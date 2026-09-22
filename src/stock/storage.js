// ─── COUCHE DE PERSISTANCE ───
// Supabase (cloud) quand les 2 clés API sont configurées, sinon localStorage.
// Les clés sont lues depuis les variables d'environnement Vite (fichier .env
// en local, variables de build sur Cloudflare Pages) :
//   VITE_SUPABASE_URL      → URL du projet (https://xxxx.supabase.co)
//   VITE_SUPABASE_ANON_KEY → clé PUBLIABLE : nouveau format "sb_publishable_..."
//                            (ou ancienne clé "anon" JWT "eyJ...")
// ⚠️ JAMAIS la clé secrète "sb_secret_..." / "service_role" côté frontend.
// Client Supabase PARTAGÉ avec le reste de l'application interne :
// un seul projet Supabase et une seule session d'authentification.
import { supabase as sharedSupabase, isRecoveryLink as _isRecoveryLink } from "../lib/supabase";

// Vrai quand la page est ouverte depuis un lien de réinitialisation de mot
// de passe (capté avant que Supabase n'efface le fragment de l'URL).
export const isRecoveryLink = _isRecoveryLink;

export const SK = "pa-stock-clean2";

export const supabase = sharedSupabase;

export const isCloud = () => supabase !== null;

// Garde-fou : si le réseau ne répond pas dans le délai imparti, on rejette
// pour basculer sur le repli localStorage (l'app doit toujours démarrer).
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`délai dépassé (${ms} ms)`)), ms)
    ),
  ]);

// ─── SYNCHRO TEMPS RÉEL MULTI-APPAREILS ───
// Chaque client a un identifiant ; chaque sauvegarde porte un numéro de
// révision croissant. Les autres appareils reçoivent la nouvelle version
// via Realtime (canal broadcast + changements Postgres) et l'adoptent si
// elle est plus récente que la leur.
const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
let currentRev = 0;
let syncChannel = null;

export async function fetchCloudState() {
  if (!supabase) return null;
  try {
    // stock_state() applique le cloisonnement côté serveur : état complet
    // pour un salarié interne, données du seul adhérent concerné sinon.
    const { data, error } = await withTimeout(supabase.rpc("stock_state"), 5000);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

// S'abonner aux mises à jour des autres appareils.
// Redondance volontaire : broadcast (sans configuration), postgres_changes
// (si la table est publiée), rafraîchissement au retour de focus + toutes
// les 60 s en filet de sécurité.
export function subscribeSync(onRemoteState) {
  if (!supabase) return () => {};
  const apply = (v) => {
    if (!v) return;
    if (v._clientId === CLIENT_ID) return; // notre propre écriture
    const rev = v._rev || 0;
    if (rev && rev <= currentRev) return; // version plus ancienne que la nôtre
    if (rev) currentRev = rev;
    onRemoteState(v);
  };
  const refetch = async () => apply(await fetchCloudState());
  const ch = supabase
    .channel("pa-stock-sync")
    .on("broadcast", { event: "maj" }, (p) => {
      if (p?.payload?.clientId === CLIENT_ID) return;
      refetch();
    })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state", filter: `key=eq.${SK}` },
      (p) => apply(p.new?.value)
    )
    .subscribe();
  syncChannel = ch;
  const onWake = () => refetch();
  const onVis = () => {
    if (document.visibilityState === "visible") refetch();
  };
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onVis);
  const iv = setInterval(refetch, 60000);
  return () => {
    try {
      supabase.removeChannel(ch);
    } catch {}
    window.removeEventListener("focus", onWake);
    document.removeEventListener("visibilitychange", onVis);
    clearInterval(iv);
    syncChannel = null;
  };
}

// ─── LECTURE ───
// Priorité au cloud (source de vérité partagée), repli sur localStorage.
export async function loadState() {
  if (supabase) {
    try {
      const { data, error } = await withTimeout(supabase.rpc("stock_state"), 5000);
      if (!error && data) {
        currentRev = data._rev || 0;
        return data;
      }
      if (error) console.warn("Supabase load:", error.message, "→ repli localStorage");
    } catch (e) {
      console.warn("Supabase indisponible → repli localStorage", e);
    }
  }
  try {
    const r = localStorage.getItem(SK);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

// ─── AUTHENTIFICATION SUPABASE (Phase 2) ───
// À la connexion, l'utilisateur est aussi authentifié auprès de Supabase
// Auth (création automatique du compte au premier passage). Cela permet
// ensuite de verrouiller la base aux seuls utilisateurs authentifiés
// (voir supabase/phase2-securite.sql). Non bloquant : si l'auth échoue,
// l'application continue tant que le verrouillage n'est pas activé.
export async function ensureCloudAuth(email, password) {
  // Site autonome uniquement (en mode intégré à Planet'Desk, la session
  // Supabase est déjà ouverte et cette fonction n'est pas appelée).
  //
  // Le mot de passe défini dans les données de l'application
  // (app_state.users[].mdp) est la SEULE référence. Si l'authentification
  // Supabase échoue (mot de passe divergent d'un appareil à l'autre), on
  // appelle stock_sync_auth qui — quand l'identifiant applicatif est bon —
  // resynchronise le mot de passe Supabase dessus, puis on réessaie. Un
  // seul mot de passe, valable partout, qui se répare tout seul.
  if (!supabase) return { ok: true, mode: "local" };
  const signIn = () =>
    withTimeout(supabase.auth.signInWithPassword({ email, password }), 6000);
  try {
    const first = await signIn();
    if (!first.error) return { ok: true, mode: "signin" };
    const msg0 = first.error.message || "";
    if (!/invalid login credentials|email not confirmed/i.test(msg0)) {
      return { ok: false, msg: msg0 };
    }

    // Resynchronisation via le mot de passe applicatif (source de vérité).
    // 'synced' : identifiant bon, mot de passe Supabase remis à jour.
    // 'nouser' : identifiant bon mais pas encore de compte Supabase.
    // 'bad'    : identifiant applicatif incorrect.
    // 'error'  : fonction absente (SQL pas encore exécuté) → repli signUp.
    let st = "error";
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("stock_sync_auth", { p_email: email, p_mdp: password }),
        8000
      );
      if (!error && typeof data === "string") st = data;
    } catch {}

    if (st === "synced") {
      const retry = await signIn();
      if (!retry.error) return { ok: true, mode: "signin" };
    }
    if (st === "nouser" || st === "error") {
      const { data, error: e2 } = await withTimeout(
        supabase.auth.signUp({ email, password }),
        8000
      );
      if (!e2 && data?.session) return { ok: true, mode: "signup" };
      if (st === "nouser" && !e2)
        return {
          ok: false,
          msg: "Compte créé. Si une confirmation par email est demandée, désactivez « Confirm email » dans Supabase (Authentication → Sign In / Providers → Email), puis reconnectez-vous.",
        };
      if (st === "error" && !e2)
        return {
          ok: false,
          msg: "Mot de passe incorrect, ou compte en attente de confirmation par email.",
        };
    }
    if (st === "bad")
      return {
        ok: false,
        msg: "Mot de passe incorrect. Vérifiez la saisie (majuscules, correction automatique), ou faites redéfinir votre mot de passe dans l'onglet Utilisateurs.",
      };
    return {
      ok: false,
      msg: "Connexion impossible. Réessayez ; si cela persiste, faites redéfinir votre mot de passe dans l'onglet Utilisateurs.",
    };
  } catch (e) {
    return { ok: false, msg: String(e?.message || e) };
  }
}

export async function cloudSignOut() {
  try {
    await supabase?.auth.signOut();
  } catch {}
}

// Envoi d'un email de réinitialisation du mot de passe (site autonome) :
// l'utilisateur reçoit un lien qui le ramène sur le site pour définir un
// nouveau mot de passe, sans avoir eu besoin de se connecter.
export async function sendPasswordReset(email) {
  if (!supabase) return { ok: false, msg: "Réinitialisation indisponible en mode local." };
  try {
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined;
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined),
      8000
    );
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: String(e?.message || e) };
  }
}

// S'abonne à l'évènement de récupération : quand l'utilisateur revient
// depuis le lien reçu par email, Supabase ouvre une session temporaire et
// émet "PASSWORD_RECOVERY". On bascule alors l'écran « nouveau mot de passe ».
export function onPasswordRecovery(cb) {
  if (!supabase) return () => {};
  try {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { try { cb(); } catch {} }
    });
    return () => { try { data.subscription.unsubscribe(); } catch {} };
  } catch {
    return () => {};
  }
}

// Changement du mot de passe du compte connecté (site autonome).
// Met à jour l'identifiant d'authentification Supabase de l'utilisateur
// courant. Sans cloud (mode local), rien à faire côté serveur.
export async function changeCloudPassword(newPassword) {
  if (!supabase) return { ok: true, mode: "local" };
  try {
    const { error } = await withTimeout(
      supabase.auth.updateUser({ password: newPassword }),
      8000
    );
    if (error) return { ok: false, msg: error.message };
    return { ok: true, mode: "cloud" };
  } catch (e) {
    return { ok: false, msg: String(e?.message || e) };
  }
}

// ─── PHOTOS (Supabase Storage, bucket "photos") ───
// Compression côté client avant envoi : max 1280 px, JPEG ~82 %.
async function compressImage(file, max = 1280, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob || file;
  } catch {
    return file;
  }
}

const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

export async function uploadPhoto(file, dossier = "divers") {
  const blob = await compressImage(file);
  if (supabase) {
    const path = `${dossier}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (error)
      throw new Error(
        error.message +
          " — vérifiez que le bucket « photos » existe dans Supabase (exécutez supabase/storage-photos.sql)"
      );
    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    return { url: data.publicUrl, path };
  }
  // Repli local (sans Supabase) : image encodée dans l'état de l'app
  return { url: await blobToDataURL(blob), path: null };
}

export async function deletePhoto(path) {
  if (supabase && path) {
    try {
      await supabase.storage.from("photos").remove([path]);
    } catch (e) {
      console.warn(e);
    }
  }
}

// ─── ÉCRITURE ───
// localStorage immédiat (réactivité + mode hors-ligne), synchro cloud
// "debouncée", puis notification instantanée des autres appareils.
let syncTimer = null;
export async function saveState(d) {
  try {
    localStorage.setItem(SK, JSON.stringify(d));
  } catch (e) {
    console.error(e);
  }
  if (!supabase) return;
  // Garde-fou : ne JAMAIS écraser le cloud avec une liste de comptes vide.
  // Un utilisateur interne figure toujours dans users[] ; un users vide
  // trahit un état par défaut / non chargé (ou l'état filtré d'un adhérent,
  // dont l'écriture est de toute façon refusée par la base). Propager un tel
  // état effacerait tous les comptes — c'est ce qui avait vidé la liste.
  if (!Array.isArray(d?.users) || d.users.length === 0) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      currentRev += 1;
      const value = { ...d, _rev: currentRev, _clientId: CLIENT_ID };
      const { error } = await supabase.from("app_state").upsert({
        key: SK,
        value,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error("Supabase save:", error.message);
        return;
      }
      // Ping temps réel vers les autres appareils connectés
      try {
        syncChannel?.send({ type: "broadcast", event: "maj", payload: { clientId: CLIENT_ID, rev: currentRev } });
      } catch {}
    } catch (e) {
      console.error("Supabase save:", e);
    }
  }, 400);
}
