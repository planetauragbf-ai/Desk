// Persistance de Planet'Dash : même principe que Planet'Stock —
// une ligne JSONB dans la table partagée app_state (clé dédiée),
// avec repli localStorage quand Supabase n'est pas configuré.
//
// L'enregistrement est protégé contre l'écrasement : une sauvegarde
// n'aboutit que si la ligne n'a pas bougé depuis notre dernière lecture
// (comparaison sur `updated_at`). Sans cela, deux personnes travaillant
// en même temps voyaient le dernier enregistrement écraser entièrement
// le travail de l'autre, sans le moindre avertissement.
import { supabase } from "../lib/supabase";

const KEY = "pa-dash-v1";

/** Horodatage de la version que nous connaissons, pour détecter les conflits. */
let versionConnue = null;
/** Appelé quand quelqu'un d'autre a enregistré entre-temps. */
let onConflit = null;

export function surConflitDash(fn) {
  onConflit = fn;
  return () => {
    onConflit = null;
  };
}

export async function loadDash() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("value, updated_at")
        .eq("key", KEY)
        .maybeSingle();
      if (!error && data) {
        versionConnue = data.updated_at ?? null;
        if (data.value) return data.value;
      }
    } catch (e) {
      console.warn("Planet'Dash : chargement cloud impossible", e);
    }
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let timer = null;

async function ecrire(value) {
  const maintenant = new Date().toISOString();

  // Première écriture : la ligne n'existe pas encore.
  if (versionConnue === null) {
    const { data, error } = await supabase
      .from("app_state")
      .upsert({ key: KEY, value, updated_at: maintenant })
      .select("updated_at");
    if (error) throw new Error(error.message);
    versionConnue = data?.[0]?.updated_at ?? maintenant;
    return true;
  }

  // Écriture conditionnelle : refusée si la ligne a changé entre-temps.
  const { data, error } = await supabase
    .from("app_state")
    .update({ value, updated_at: maintenant })
    .eq("key", KEY)
    .eq("updated_at", versionConnue)
    .select("updated_at");
  if (error) throw new Error(error.message);
  if (data && data.length > 0) {
    versionConnue = data[0].updated_at ?? maintenant;
    return true;
  }
  return false; // quelqu'un d'autre a enregistré depuis notre lecture
}

export function saveDash(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch (e) {
    console.warn(e);
  }
  if (!supabase) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const ok = await ecrire(value);
      if (!ok && onConflit) onConflit();
    } catch (e) {
      console.warn("Planet'Dash : sauvegarde cloud", e);
    }
  }, 600);
}

/** Oublie la version connue : la prochaine lecture reprend la main. */
export async function rechargerDash() {
  versionConnue = null;
  return loadDash();
}
