// Liaisons de Planet'Dash avec le reste de Planet'Desk :
// journal d'activité, notifications, création de dossiers Planet'Claim
// depuis une expédition, et clé API Ship24 stockée dans les réglages.
import { insert, list } from "../lib/data";
import { notify } from "../lib/notify";

// ─── Journal d'activité global ───
export function logDash(action) {
  try {
    insert("audit_log", {
      user_id: window.__deskActor?.id ?? null,
      user_name: window.__deskActor?.name ?? "",
      app: "dash",
      action,
    });
  } catch (e) {
    console.warn("Journal Planet'Dash :", e);
  }
}

// ─── Clé API Ship24 (réglage Administration, pas de clé en dur) ───
let ship24Key = null;
export async function loadShip24Key() {
  try {
    const rows = await list("app_settings", { key: "ship24_api_key" });
    ship24Key = rows[0]?.value || null;
  } catch {
    ship24Key = null;
  }
  return ship24Key;
}
export const getShip24Key = () => ship24Key;

// ─── Création d'un dossier Planet'Claim depuis une expédition ───
const CATEGORY_BY_STATUS = {
  sinistre: "casse",
  exception: "autre",
  tentative: "erreur_livraison",
  annule: "autre",
};

export async function createClaimFromShipping(s) {
  const claims = await list("claims");
  const year = new Date().getFullYear();
  const ref = `PA-${year}-${String(claims.filter((c) => c.ref.includes(String(year))).length + 1).padStart(3, "0")}`;
  const dest = s.dest || {};
  const created = await insert("claims", {
    ref,
    kind: "sinistre",
    category: CATEGORY_BY_STATUS[s.status] || "casse",
    status: "nouveau",
    priority: "haute",
    title: `Expédition ${s.id} — ${dest.nom || "destinataire"}`,
    description: s.note || "",
    client_nom: [dest.prenom, dest.nom].filter(Boolean).join(" "),
    client_email: dest.email || "",
    client_tel: dest.tel || "",
    pays: dest.pays || "",
    shipping_ref: s.id,
    adherent: s.exp?.nom || "",
    date_expedition: isoDate(s.dateEnlevement),
    date_livraison: isoDate(s.dateLivEffective),
    valeur_commande: Number(s.valeur) || 0,
    carrier: s.transporteur || s.tracking?.courier || "",
    tracking_number: s.tracking?.number || "",
    destinataire: dest.nom || "",
    nb_bouteilles: Number(s.nbBtl) || 0,
    assureur: "Coste Fermon",
    assignee_id: window.__deskActor?.id ?? null,
    created_by: window.__deskActor?.id ?? null,
  });
  await insert("claim_events", {
    claim_id: created.id,
    author_id: window.__deskActor?.id ?? null,
    kind: "statut",
    content: `Dossier ouvert depuis Planet'Dash (expédition ${s.id})`,
  });
  logDash(`Dossier sinistre ${ref} ouvert depuis l'expédition ${s.id}`);
  return created;
}

/** Convertit une date "JJ/MM/AA" du dashboard en ISO, sinon null. */
function isoDate(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

// ─── Notifications : colis en incident ou livraison en retard ───
const ALERT_STATUSES = ["exception", "sinistre", "tentative"];
const STATUS_LABELS = {
  exception: "en exception",
  sinistre: "en sinistre",
  tentative: "en tentative de livraison",
};

/**
 * Alerte le responsable (utilisateur connecté) une fois par session :
 * colis en incident, ou date de livraison souhaitée dépassée.
 */
export async function runDashAlerts(shippings) {
  const actor = window.__deskActor;
  if (!actor || !shippings?.length) return;
  try {
    const mine = await list("notifications", { user_id: actor.id });
    const existing = new Set(mine.map((n) => n.message));
    const today = new Date().toISOString().slice(0, 10);

    const incidents = shippings.filter((s) => ALERT_STATUSES.includes(s.status));
    const late = shippings.filter((s) => {
      if (["livre", "annule"].includes(s.status)) return false;
      const due = isoDate(s.dateLivSouhaitee);
      return due && due < today;
    });

    for (const s of incidents.slice(0, 20)) {
      const message = `📦 Expédition ${s.id} ${STATUS_LABELS[s.status]} — ${s.dest?.nom || "destinataire"}`;
      if (!existing.has(message)) await notify(actor.id, message, "/dash");
    }
    for (const s of late.slice(0, 20)) {
      const message = `⏰ Expédition ${s.id} : livraison souhaitée dépassée (${s.dateLivSouhaitee})`;
      if (!existing.has(message)) await notify(actor.id, message, "/dash");
    }
  } catch (e) {
    console.warn("Alertes Planet'Dash :", e);
  }
}
