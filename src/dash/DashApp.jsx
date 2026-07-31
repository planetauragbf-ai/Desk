import { useState, useMemo, useRef, useEffect } from "react";
import { loadDash, saveDash } from "./storage.js";
import { logDash, loadShip24Key, getShip24Key, createClaimFromShipping, runDashAlerts } from "./integration.js";
import { loadAdherents, mergeAdherentNames } from "../lib/adherents";

/** Vrai sur écran étroit (téléphone) : la grille cède la place à des cartes. */
function useIsMobileDash() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return m;
}

/** Carte d'expédition (affichage téléphone). */
function ShipCard({ s, statusMeta, onOpen, onMenu, menuOpen, isProd, onAction }) {
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--b1)", borderRadius: 10, padding: 12, marginBottom: 8, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 800, color: "var(--accent)", fontSize: 14 }}>{s.id}</span>
        <span style={{ background: (statusMeta?.color || "#64748b") + "18", color: statusMeta?.color || "#64748b", borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>
          {statusMeta?.label || s.status}
        </span>
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <button onClick={(e) => { e.stopPropagation(); onMenu(); }}
            style={{ background: "var(--bg3)", border: "1px solid var(--b1)", borderRadius: 6, cursor: "pointer", fontSize: 15, padding: "2px 8px" }}>⋮</button>
          {menuOpen && <ActionsPopover s={s} isProd={isProd} onAction={onAction} onClose={onMenu} />}
        </div>
      </div>
      <div onClick={onOpen} style={{ cursor: "pointer", fontSize: 12, lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700 }}>{[s.dest?.prenom, s.dest?.nom].filter(Boolean).join(" ") || "—"}</div>
        <div style={{ color: "var(--t2)" }}>{[s.dest?.ville, s.dest?.pays].filter(Boolean).join(", ") || "—"}</div>
        <div style={{ color: "var(--t2)" }}>🏭 {s.exp?.nom || "—"}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "var(--t2)", marginTop: 4 }}>
          <span>✈ {s.dateEnlevement || "—"}</span>
          <span>📬 {s.dateLivSouhaitee || "—"}</span>
          <span>🍾 {s.nbBtl || 0}</span>
        </div>
        {s.tracking?.number && <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{s.tracking.number}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHIP24 API
// ═══════════════════════════════════════════════════════════════
// Clé API Ship24 : réglée dans Administration → Réglages (jamais en dur).
const SHIP24_KEY = () => getShip24Key();
const SHIP24 = "https://api.ship24.com/public/v1";
const ship24 = {
  async createTracker(num, courier) {
    const b = { trackingNumber: num }; if (courier) b.courierCode = [courier];
    try { const r = await fetch(`${SHIP24}/trackers`, { method: "POST", headers: { Authorization: `Bearer ${SHIP24_KEY()}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }); return r.json(); } catch { return null; }
  },
  async getResults(id) { try { const r = await fetch(`${SHIP24}/trackers/${id}/results`, { headers: { Authorization: `Bearer ${SHIP24_KEY()}` } }); return r.json(); } catch { return null; } },
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const STATUSES = [
  { key: "all", label: "Tous", color: "#64748b" },
  { key: "non_specifie", label: "Non spécifié", color: "#94a3b8" },
  { key: "att_info", label: "Att info", color: "#f59e0b" },
  { key: "differe", label: "Différé", color: "#78716c" },
  { key: "pickup", label: "Pick-up", color: "#f97316" },
  { key: "transit", label: "Transit", color: "#3b82f6" },
  { key: "tentative", label: "Tentative", color: "#a855f7" },
  { key: "point_relais", label: "Point relais", color: "#06b6d4" },
  { key: "exception", label: "Exception", color: "#ef4444" },
  { key: "livre", label: "Livré", color: "#10b981" },
  { key: "sinistre", label: "Sinistre", color: "#991b1b" },
  { key: "annule", label: "Annulé", color: "#6b7280" },
];
const DASHBOARDS = [
  { key: "ue", label: "UE" }, { key: "pays_tiers", label: "Pays Tiers" },
  { key: "usa_first", label: "USA · First Miles" }, { key: "usa_prod", label: "USA · Liste de Prod" }, { key: "usa_last", label: "USA · Last Miles" },
];
const USA_TABS = [
  { key: "usa_first", label: "First Miles" }, { key: "usa_prod", label: "Liste de Prod" }, { key: "usa_last", label: "Last Miles" },
];
const fmt = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const TRANSPORTEURS = ["", "UPS", "FedEx", "DHL", "TNT", "GLS", "Colissimo", "Chronopost", "DPD", "Autre"];

// ═══════════════════════════════════════════════════════════════
// DATA FACTORY
// ═══════════════════════════════════════════════════════════════
const mk = (id, o) => ({
  id, dashboard: o.dashboard || "ue", status: o.status || "pickup",
  dateEnlevement: o.de || "", dateLivSouhaitee: o.dls || "", precision: o.prec || "AVANT",
  dateLivEffective: o.dle || "",
  note: o.note || "",
  exp: { nom: o.en || "", adresse: o.ea || "", cp: o.ecp || "", ville: o.ev || "", pays: o.ep || "France", email: o.ee || "", tel: o.et || "", numSortie: o.ens || "" },
  dest: { nom: o.dn || "", prenom: o.dp || "", adresse: o.da || "", cp: o.dcp || "", ville: o.dv || "", pays: o.dpy || "", email: o.dem || "", tel: o.dt || "", info: o.di || "" },
  nbBtl: o.nb || 0, colisage: o.colis || "", champagne: o.champ ?? false,
  incoterm: o.inc || "DDP", assurance: o.ass ?? true,
  prixAchatTransport: o.pat || "",
  refEnlevement: o.refE || "",
  tracking: { number: o.tn || "", courier: o.tc || "", locked: false },
  transporteur: o.transp || "",
  valeur: o.val || 0, transport: o.tr || 0, montant: o.mt || 0, marge: o.mg || 0, margePct: o.mp || 0,
  totalColis: o.col || 0, poids: o.pds || 0,
  vins: o.vins || [], usaSheet: o.sheet || null, isRxp: false, rxpParentId: null,
});

// Base vide : les expéditions sont saisies dans l'application
// (ou importées) — plus aucune donnée de démonstration.
const INIT = [];


// ═══════════════════════════════════════════════════════════════
// INLINE EDITABLE CELL
// ═══════════════════════════════════════════════════════════════
function EditCell({ value, onChange, mono, area, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} title="Cliquer pour modifier"
        style={{ cursor: "text", minHeight: 18, padding: "1px 3px", borderRadius: 3, border: "1px solid transparent", transition: "border-color 0.15s", fontSize: "inherit", color: value ? "inherit" : "var(--t3)", fontFamily: mono ? "var(--mono)" : "inherit", wordBreak: "break-word", lineHeight: 1.5 }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--b1)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}>
        {value || placeholder || "—"}
      </div>
    );
  }
  const save = () => { setEditing(false); if (draft !== value) onChange(draft); };
  if (area) {
    return <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }} rows={3} style={{ width: "100%", padding: "3px 5px", borderRadius: 4, border: "1.5px solid var(--accent)", background: "var(--accent-bg)", fontSize: "inherit", fontFamily: "var(--font)", color: "var(--t1)", outline: "none", resize: "vertical", lineHeight: 1.4 }} />;
  }
  return <input ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }} style={{ width: "100%", padding: "2px 5px", borderRadius: 4, border: "1.5px solid var(--accent)", background: "var(--accent-bg)", fontSize: "inherit", fontFamily: mono ? "var(--mono)" : "var(--font)", color: "var(--t1)", outline: "none" }} />;
}

// ═══════════════════════════════════════════════════════════════
// STATUS PILL
// ═══════════════════════════════════════════════════════════════
const StatusPill = ({ status, small }) => {
  const s = STATUSES.find((x) => x.key === status) || STATUSES[0];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 8px" : "4px 12px", borderRadius: 6, fontSize: small ? 10 : 11, fontWeight: 700, background: s.color + "18", color: s.color, border: `1px solid ${s.color}30`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════════════════════════
const SectionTitle = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 18, marginBottom: 6, paddingBottom: 4, borderBottom: "2px solid var(--accent)" }}>{children}</div>
);
const DRow = ({ label, val }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--b2)", fontSize: 12 }}>
    <span style={{ color: "var(--t2)" }}>{label}</span>
    <span style={{ color: "var(--t1)", fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>{val || "—"}</span>
  </div>
);

function DetailPanel({ s, onClose }) {
  if (!s) return null;
  return (
    <div style={{ width: 380, borderLeft: "1px solid var(--b1)", background: "var(--bg2)", display: "flex", flexDirection: "column", height: "100%", flexShrink: 0 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, color: "var(--accent)", fontSize: 15 }}>#{s.id}</span>
          <StatusPill status={s.status} small />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => window.open(`https://app.planet-aura.com/administration/shipping/ajout.php?id=${s.id}`, "_blank")} style={btnSmS}>Ouvrir ↗</button>
          <button onClick={onClose} style={btnSmS}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "10px 18px" }}>
        <SectionTitle>Dates</SectionTitle>
        <DRow label="Enlèvement" val={s.dateEnlevement} />
        <DRow label="Liv. souhaitée" val={s.dateLivSouhaitee || "—"} />
        <DRow label="Précision" val={s.precision} />
        <SectionTitle>Expéditeur</SectionTitle>
        <DRow label="Nom" val={s.exp.nom} />
        <DRow label="Adresse" val={`${s.exp.adresse}, ${s.exp.cp} ${s.exp.ville}`} />
        <DRow label="Pays" val={s.exp.pays} />
        <DRow label="Email" val={s.exp.email} />
        <DRow label="Tél" val={s.exp.tel} />
        <SectionTitle>Destinataire (DA)</SectionTitle>
        <DRow label="Nom" val={`${s.dest.prenom} ${s.dest.nom}`} />
        <DRow label="Adresse" val={`${s.dest.adresse}, ${s.dest.cp} ${s.dest.ville}`} />
        <DRow label="Pays" val={s.dest.pays} />
        <DRow label="Email" val={s.dest.email} />
        <DRow label="Tél" val={s.dest.tel} />
        <SectionTitle>Commande</SectionTitle>
        <DRow label="Bouteilles" val={s.nbBtl} />
        <DRow label="Colis" val={s.totalColis} />
        <DRow label="Poids" val={`${s.poids} kg`} />
        <DRow label="Valeur HT" val={fmt(s.valeur)} />
        <DRow label="Assurance" val={s.assurance ? "OUI" : "NON"} />
        <DRow label="Incoterm" val={s.incoterm} />
        <SectionTitle>Tracking</SectionTitle>
        <DRow label="N°" val={s.tracking.number || "—"} />
        <DRow label="Transporteur" val={s.tracking.courier || "—"} />
        <DRow label="Verrouillé" val={s.tracking.locked ? "🔒 OUI" : "🔓 NON"} />
        <SectionTitle>Financier</SectionTitle>
        <DRow label="Transport" val={fmt(s.transport)} />
        <DRow label="Montant" val={fmt(s.montant)} />
        <DRow label="Marge" val={`${fmt(s.marge)} (${s.margePct}%)`} />
        {s.note && <><SectionTitle>Note</SectionTitle><div style={{ fontSize: 12, color: "var(--t1)", padding: "8px 10px", background: "#f59e0b12", borderRadius: 8, border: "1px solid #f59e0b25", lineHeight: 1.5 }}>{s.note}</div></>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS POPOVER
// ═══════════════════════════════════════════════════════════════
function ActionsPopover({ s, onAction, onClose, isProd }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const sections = [
    { title: "Actions", items: [
      { key: "move", label: "📂 Déplacer de dashboard" },
      { key: "status", label: "🔄 Modifier le statut" },
      { key: "duplicate", label: "📋 Dupliquer la ligne" },
      { key: "rxp", label: "🔁 Créer copie RXP" },
      { key: "sinistre", label: "🛡️ Déclarer un sinistre" },
      { key: "copy_usa", label: "📑 Copier vers feuille USA" },
      ...(isProd ? [{ key: "move_sheet", label: "📄 Déplacer vers autre feuille" }] : []),
    ]},
    { title: "Documents", items: [
      { key: "etiquette", label: "🏷️ Étiquette" },
      { key: "da", label: "📄 DA (Document d'Accompagnement)" },
      { key: "espace_doc", label: "📁 Espace document" },
    ]},
    { title: "Historiques", items: [
      { key: "hist_action", label: "📜 Historique actions shipping" },
      { key: "hist_comm", label: "💬 Historique communication" },
      { key: "hist_dashboard", label: "🕓 Historique ID dans dashboard" },
    ]},
    { title: "Communication", items: [
      { key: "communiquer", label: "✉️ Communiquer" },
    ]},
  ];

  return (
    <div ref={ref} style={{ position: "absolute", left: 0, top: "100%", zIndex: 200, background: "#fff", border: "1px solid var(--b1)", borderRadius: 12, boxShadow: "0 12px 48px rgba(0,0,0,0.18)", padding: "6px 0", minWidth: 270, marginTop: 4, maxHeight: 420, overflow: "auto" }}>
      {sections.map((sec, si) => (
        <div key={si}>
          {si > 0 && <div style={{ borderTop: "1px solid var(--b2)", margin: "4px 0" }} />}
          <div style={{ padding: "5px 14px 3px", fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{sec.title}</div>
          {sec.items.map((it) => (
            <button key={it.key} onClick={() => { onAction(it.key, s.id); onClose(); }}
              style={{ display: "block", width: "100%", padding: "7px 14px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "var(--t1)", borderRadius: 0, fontFamily: "var(--font)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {it.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERLAY + MODALS
// ═══════════════════════════════════════════════════════════════
const Overlay = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, border: "1px solid var(--b1)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "85vh", overflow: "auto" }}>{children}</div>
  </div>
);
const MBtn = ({ children, primary, ...p }) => (
  <button {...p} style={{ padding: "8px 18px", borderRadius: 7, border: primary ? "none" : "1px solid var(--b1)", background: primary ? "var(--accent)" : "#fff", color: primary ? "#fff" : "var(--t2)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", ...p.style }}>{children}</button>
);

function DuplicateModal({ shipId, onDuplicate, onClose }) {
  const [count, setCount] = useState(2);
  return (
    <div style={{ padding: 28, width: 360 }}>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Dupliquer la ligne</div>
      <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 12 }}>Shipping #{shipId}</div>
      <div style={{ padding: 10, background: "var(--bg3)", borderRadius: 8, marginBottom: 16, fontSize: 12, lineHeight: 1.8 }}>
        Aperçu : {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--accent)" }}>{shipId}-{i + 1}{i === count - 1 ? "D" : ""}{i < count - 1 ? " / " : ""}</span>
        ))}
      </div>
      <label style={{ fontSize: 10, fontWeight: 700, color: "var(--t2)", textTransform: "uppercase" }}>Nombre de copies</label>
      <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value || 1))} style={{ display: "block", width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--b1)", background: "var(--bg3)", fontSize: 15, fontFamily: "var(--mono)", fontWeight: 700, marginTop: 6, outline: "none" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <MBtn onClick={onClose}>Annuler</MBtn>
        <MBtn primary onClick={() => onDuplicate(shipId, count)}>Dupliquer ({count})</MBtn>
      </div>
    </div>
  );
}

const btnSmS = { padding: "4px 10px", borderRadius: 6, border: "1px solid var(--b1)", background: "var(--bg3)", color: "var(--t2)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font)" };

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [shippings, setShippings] = useState(INIT);
  const [dashLoaded, setDashLoaded] = useState(false);
  const [adherentNames, setAdherentNames] = useState([]);
  const isMobile = useIsMobileDash();
  const [mainTab, setMainTab] = useState("ue");
  const [usaTab, setUsaTab] = useState("usa_first");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ pays: "", adherent: "", incoterm: "", assurance: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [prodSheets, setProdSheets] = useState(["Consolidation 1"]);
  const [activeProdSheet, setActiveProdSheet] = useState("Consolidation 1");
  const [modal, setModal] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [apiStatus, setApiStatus] = useState("ok");
  const [lastSync, setLastSync] = useState(new Date());

  // Persistance partagée (Supabase app_state / localStorage)
  useEffect(() => {
    loadDash().then((d) => {
      if (d) {
        if (Array.isArray(d.shippings)) setShippings(d.shippings);
        if (Array.isArray(d.prodSheets) && d.prodSheets.length) { setProdSheets(d.prodSheets); setActiveProdSheet(d.prodSheets[0]); }
      }
      setDashLoaded(true);
      loadShip24Key();
      loadAdherents().then((ref) =>
        setAdherentNames(mergeAdherentNames(ref, (d?.shippings || []).map((s) => s.exp?.nom))),
      );
      runDashAlerts(Array.isArray(d?.shippings) ? d.shippings : []);
    });
  }, []);
  useEffect(() => {
    if (!dashLoaded) return;
    saveDash({ shippings, prodSheets });
  }, [shippings, prodSheets, dashLoaded]);

  const activeDashboard = mainTab === "usa" ? usaTab : mainTab;
  const isProd = activeDashboard === "usa_prod";

  // Déclarer un sinistre : crée le dossier Planet'Claim pré-rempli
  const declareSinistre = async (shipId) => {
    const s = shippings.find((x) => x.id === shipId);
    if (!s) return;
    if (!confirm(`Ouvrir un dossier sinistre pour l'expédition ${shipId} ?\n\nLe dossier Planet'Claim sera pré-rempli (client, transporteur, tracking, valeur…).`)) return;
    try {
      const claim = await createClaimFromShipping(s);
      setShippings((prev) => prev.map((x) => (x.id === shipId ? { ...x, status: "sinistre" } : x)));
      if (confirm(`Dossier ${claim.ref} créé ✔\n\nOuvrir Planet'Claim maintenant ?`)) window.location.href = "/claim";
    } catch (e) {
      alert("Création du dossier impossible : " + (e?.message || e));
    }
  };

  // Update a shipping field
  const updateShipping = (id, path, val) => {
    logDash(`Modification expédition ${id} — ${path}`);
    setShippings((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const clone = JSON.parse(JSON.stringify(s));
      const parts = path.split(".");
      let obj = clone;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = val;
      return clone;
    }));
  };

  // Toggle tracking lock
  const toggleLock = (id) => {
    setShippings((prev) => prev.map((s) => s.id === id ? { ...s, tracking: { ...s.tracking, locked: !s.tracking.locked } } : s));
  };

  const data = useMemo(() => {
    let d = shippings.filter((s) => s.dashboard === activeDashboard);
    if (isProd && activeProdSheet) d = d.filter((s) => s.usaSheet === activeProdSheet);
    if (statusFilter !== "all") d = d.filter((s) => s.status === statusFilter);
    if (search) { const q = search.toLowerCase(); d = d.filter((s) => s.id.toLowerCase().includes(q) || s.exp.nom.toLowerCase().includes(q) || `${s.dest.prenom} ${s.dest.nom}`.toLowerCase().includes(q) || s.dest.pays.toLowerCase().includes(q) || (s.tracking.number || "").toLowerCase().includes(q) || (s.note || "").toLowerCase().includes(q)); }
    if (filters.pays) d = d.filter((s) => s.dest.pays.toLowerCase().includes(filters.pays.toLowerCase()));
    if (filters.adherent) d = d.filter((s) => s.exp.nom.toLowerCase().includes(filters.adherent.toLowerCase()));
    if (filters.incoterm) d = d.filter((s) => s.incoterm === filters.incoterm);
    if (filters.assurance === "oui") d = d.filter((s) => s.assurance);
    if (filters.assurance === "non") d = d.filter((s) => !s.assurance);
    return d;
  }, [shippings, activeDashboard, statusFilter, search, filters, isProd, activeProdSheet]);

  const counts = useMemo(() => {
    const base = shippings.filter((s) => s.dashboard === activeDashboard);
    const c = { all: base.length };
    STATUSES.slice(1).forEach((st) => { c[st.key] = base.filter((s) => s.status === st.key).length; });
    return c;
  }, [shippings, activeDashboard]);

  // ─── Actions ───
  const PA = "https://app.planet-aura.com/administration/shipping";
  const handleAction = (key, shipId) => {
    setMenuId(null);
    if (key === "duplicate") setModal({ type: "duplicate", data: { shipId } });
    if (key === "move") setModal({ type: "move", data: { shipId } });
    if (key === "status") setModal({ type: "status", data: { shipId, cur: shippings.find((s) => s.id === shipId)?.status } });
    if (key === "copy_usa") setModal({ type: "copy_usa", data: { shipId } });
    if (key === "move_sheet") setModal({ type: "move_sheet", data: { shipId } });
    if (key === "rxp") doRxp(shipId);
    if (key === "sinistre") declareSinistre(shipId);
    // Document & link actions → open in back-office
    if (key === "etiquette") window.open(`${PA}/etiquette.php?id=${shipId}`, "_blank");
    if (key === "da") window.open(`${PA}/da.php?id=${shipId}`, "_blank");
    if (key === "espace_doc") window.open(`${PA}/documents.php?id=${shipId}`, "_blank");
    if (key === "hist_action") setModal({ type: "hist_action", data: { shipId } });
    if (key === "hist_comm") setModal({ type: "hist_comm", data: { shipId } });
    if (key === "hist_dashboard") setModal({ type: "hist_dashboard", data: { shipId } });
    if (key === "communiquer") setModal({ type: "communiquer", data: { shipId } });
  };
  const doDuplicate = (shipId, count) => {
    setShippings((prev) => { const orig = prev.find((s) => s.id === shipId); if (!orig) return prev; const dupes = []; for (let i = 1; i <= count; i++) { const suf = i === count ? "D" : ""; dupes.push({ ...JSON.parse(JSON.stringify(orig)), id: `${shipId}-${i}${suf}`, isRxp: false, rxpParentId: null }); } const idx = prev.findIndex((s) => s.id === shipId); const next = [...prev]; next.splice(idx + 1, 0, ...dupes); return next; });
    setModal(null);
  };
  const doRxp = (shipId) => {
    setShippings((prev) => {
      const rxpId = `RXP-${shipId}`;
      if (prev.find((s) => s.id === rxpId)) return prev; // already exists
      const orig = prev.find((s) => s.id === shipId);
      if (!orig) return prev;
      const copy = { ...JSON.parse(JSON.stringify(orig)), id: rxpId, isRxp: true, rxpParentId: shipId };
      const idx = prev.findIndex((s) => s.id === shipId);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const doMove = (shipId, target) => { setShippings((p) => p.map((s) => s.id === shipId ? { ...s, dashboard: target } : s)); setModal(null); };
  const doStatusChange = (shipId, st) => { setShippings((p) => p.map((s) => s.id === shipId ? { ...s, status: st } : s)); setModal(null); };
  const doCopyUsa = (shipId, target) => { setShippings((p) => { const o = p.find((s) => s.id === shipId); if (!o) return p; const c = { ...JSON.parse(JSON.stringify(o)), id: `${shipId}-cp`, dashboard: target }; if (target === "usa_prod") c.usaSheet = activeProdSheet; return [...p, c]; }); setModal(null); };
  const doMoveSheet = (shipId, sheet) => { setShippings((p) => p.map((s) => s.id === shipId ? { ...s, usaSheet: sheet } : s)); setModal(null); };
  const addProdSheet = (name) => { if (name && !prodSheets.includes(name)) { setProdSheets([...prodSheets, name]); setActiveProdSheet(name); } setModal(null); };
  const toggleCheck = (id) => { setCheckedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAll = () => { checkedIds.size === data.length ? setCheckedIds(new Set()) : setCheckedIds(new Set(data.map((s) => s.id))); };
  // Le raccordement à Ship24 reste à construire : plutôt qu'une fausse
// synchronisation, on l'annonce clairement.
const handleSync = () => { alert("Le suivi automatique Ship24 n'est pas encore raccordé.\n\nLes statuts sont pour l'instant saisis manuellement (menu ⋮ → Modifier le statut)."); };

  const exportCSV = () => {
    const h = ["ID", "Statut", "Enlèvement", "Expéditeur", "Ville", "Destinataire", "Pays Dest", "Btl", "Tracking", "Locked", "Montant"];
    const rows = data.map((s) => [s.id, s.status, s.dateEnlevement, s.exp.nom, s.exp.ville, `${s.dest.prenom} ${s.dest.nom}`, s.dest.pays, s.nbBtl, s.tracking.number, s.tracking.locked ? "OUI" : "NON", s.montant]);
    const csv = [h, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `planet-aura-${activeDashboard}.csv`; a.click();
  };

  const detailShipping = shippings.find((s) => s.id === detailId);

  // Column config
  const showTracking = !isProd;

  return (
    <div style={{ "--bg1": "#f0f5fa", "--bg2": "#ffffff", "--bg3": "#f8fafc", "--b1": "#e2e8f0", "--b2": "#edf2f7", "--t1": "#0f172a", "--t2": "#3f4c60", "--t3": "#64748b", "--accent": "#2e7fa0", "--accent2": "#14435c", "--accent-bg": "#2e7fa00c", "--font": "'DM Sans', -apple-system, sans-serif", "--mono": "'DM Mono', monospace", fontFamily: "var(--font)", background: "var(--bg1)", color: "var(--t1)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: var(--b1); border-radius: 3px; }
        button { font-family: var(--font); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .row-hover:hover { background: var(--bg3) !important; }
        .edit-hover:hover { outline: 1px dashed var(--b1); outline-offset: 1px; border-radius: 3px; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{ padding: "9px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--bg2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #e8584a, #f59e0b)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 800 }}>PA</div>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Planet Aura</span>
          <span style={{ color: "var(--t3)", fontSize: 12 }}>Dashboard Shipping</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 5, background: "var(--bg3)", fontSize: 10, fontWeight: 600 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
            <span style={{ color: "var(--t2)" }}>Ship24</span>
            <span style={{ color: "#f59e0b" }}>non raccordé</span>
          </div>
          <button onClick={handleSync} style={btnSmS}>🔄</button>
        </div>
      </div>

      {/* ── MAIN TABS ── */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--b1)", background: "var(--bg2)", padding: "0 24px" }}>
        {[{ key: "ue", label: "🇪🇺  UE" }, { key: "pays_tiers", label: "🌍  Pays Tiers" }, { key: "usa", label: "🇺🇸  USA" }].map((t) => (
          <button key={t.key} onClick={() => { setMainTab(t.key); setStatusFilter("all"); setSearch(""); setDetailId(null); setCheckedIds(new Set()); setMenuId(null); }}
            style={{ padding: "11px 22px", border: "none", borderBottom: mainTab === t.key ? "3px solid var(--accent)" : "3px solid transparent", background: "transparent", color: mainTab === t.key ? "var(--accent)" : "var(--t2)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USA SUB-TABS ── */}
      {mainTab === "usa" && (
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--bg3)", padding: "0 24px" }}>
          {USA_TABS.map((t) => (
            <button key={t.key} onClick={() => { setUsaTab(t.key); setStatusFilter("all"); setDetailId(null); setCheckedIds(new Set()); setMenuId(null); }}
              style={{ padding: "8px 18px", border: "none", borderBottom: usaTab === t.key ? "2px solid var(--t1)" : "2px solid transparent", background: "transparent", color: usaTab === t.key ? "var(--t1)" : "var(--t3)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
          {usaTab === "usa_prod" && (
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: 14, borderLeft: "1px solid var(--b1)", paddingLeft: 10 }}>
              {prodSheets.map((n) => (
                <button key={n} onClick={() => setActiveProdSheet(n)} style={{ padding: "6px 12px", border: "none", borderRadius: "6px 6px 0 0", background: activeProdSheet === n ? "var(--bg2)" : "transparent", color: activeProdSheet === n ? "var(--t1)" : "var(--t3)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{n}</button>
              ))}
              <button onClick={() => setModal({ type: "add_sheet" })} style={{ padding: "4px 8px", border: "1px dashed var(--b1)", borderRadius: 5, background: "transparent", color: "var(--accent)", cursor: "pointer", fontSize: 10, fontWeight: 700, marginLeft: 5 }}>+ Feuille</button>
            </div>
          )}
        </div>
      )}

      {/* ── TOOLBAR ── */}
      <div style={{ padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: "1px solid var(--b2)" }}>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {(isProd ? [STATUSES[0]] : STATUSES).map((st) => (
            <button key={st.key} onClick={() => setStatusFilter(st.key)} style={{
              padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: statusFilter === st.key ? `2px solid ${st.color}` : "2px solid transparent",
              background: statusFilter === st.key ? st.color + "12" : "var(--bg2)",
              color: statusFilter === st.key ? st.color : "var(--t2)",
            }}>
              {st.label} <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 3, color: statusFilter === st.key ? st.color : "var(--t3)" }}>{counts[st.key] ?? 0}</span>
            </button>
          ))}
        </div>
        {/* flexWrap : sur téléphone la barre d'outils dépassait de l'écran. */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 160px", minWidth: 0 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…"
              style={{ padding: "6px 10px 6px 28px", borderRadius: 7, border: "1px solid var(--b1)", background: "var(--bg2)", color: "var(--t1)", fontSize: 12, width: "100%", maxWidth: 180, outline: "none", fontFamily: "var(--font)", boxSizing: "border-box" }} />
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11 }}>🔍</span>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} style={{ ...btnSmS, background: showFilters ? "var(--accent-bg)" : "var(--bg2)", color: showFilters ? "var(--accent)" : "var(--t2)" }}>▽ Filtres</button>
          {checkedIds.size > 0 && <button style={{ ...btnSmS, background: "var(--accent)", color: "#fff", border: "none" }}>ACTION GROUPÉE ({checkedIds.size})</button>}
          <button style={{ ...btnSmS, background: "#8b5cf6", color: "#fff", border: "none" }}>ÉTIQUETTES</button>
          <button onClick={exportCSV} style={{ ...btnSmS, background: "#10b981", color: "#fff", border: "none" }}>Export CSV</button>
        </div>
      </div>

      {showFilters && (
        <div style={{ padding: "8px 24px", display: "flex", gap: 10, borderBottom: "1px solid var(--b2)", background: "var(--bg3)", flexWrap: "wrap", alignItems: "center" }}>
          <input value={filters.pays} onChange={(e) => setFilters({ ...filters, pays: e.target.value })} placeholder="Pays…"
            style={{ padding: "5px 9px", borderRadius: 5, border: "1px solid var(--b1)", background: "var(--bg2)", color: "var(--t1)", fontSize: 11, width: 130, outline: "none", fontFamily: "var(--font)" }} />
          {/* Adhérents : référentiel unique Planet'Stock */}
          <input value={filters.adherent} onChange={(e) => setFilters({ ...filters, adherent: e.target.value })} placeholder="Adhérent…" list="dash-adherents"
            style={{ padding: "5px 9px", borderRadius: 5, border: "1px solid var(--b1)", background: "var(--bg2)", color: "var(--t1)", fontSize: 11, width: 130, outline: "none", fontFamily: "var(--font)" }} />
          <datalist id="dash-adherents">{adherentNames.map((n) => <option key={n} value={n} />)}</datalist>
          <select value={filters.incoterm} onChange={(e) => setFilters({ ...filters, incoterm: e.target.value })} style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid var(--b1)", background: "var(--bg2)", fontSize: 11, fontFamily: "var(--font)", cursor: "pointer" }}>
            <option value="">Incoterm…</option><option>DDP</option><option>DAP</option><option>EXW</option>
          </select>
          <select value={filters.assurance} onChange={(e) => setFilters({ ...filters, assurance: e.target.value })} style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid var(--b1)", background: "var(--bg2)", fontSize: 11, fontFamily: "var(--font)", cursor: "pointer" }}>
            <option value="">Assurance…</option><option value="oui">Oui</option><option value="non">Non</option>
          </select>
          <button onClick={() => setFilters({ pays: "", adherent: "", incoterm: "", assurance: "" })} style={{ ...btnSmS, fontSize: 10 }}>✕ Reset</button>
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Column headers */}
          {(() => {
            const gc = `28px 28px 36px 58px 120px minmax(80px,0.8fr) minmax(140px,1.3fr) minmax(140px,1.3fr) 90px 82px 72px 78px${showTracking ? " 108px 88px 82px" : ""}`;
            return (
            <>
            <div style={{
              display: isMobile ? "none" : "grid", gridTemplateColumns: gc,
              padding: "7px 10px", borderBottom: "1px solid var(--b1)",
              background: "var(--accent)", color: "#fff",
              fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              alignItems: "center", gap: 3, flexShrink: 0,
            }}>
              <span><input type="checkbox" checked={checkedIds.size === data.length && data.length > 0} onChange={toggleAll} style={{ accentColor: "var(--accent)" }} /></span>
              <span>👁</span>
              <span>⋮</span>
              <span>🔖 ID</span>
              <span>📅 Dates</span>
              <span>📝 Note</span>
              <span>🏭 Expéditeur</span>
              <span>👤 Destinataire</span>
              <span>📦 Colis</span>
              <span>Infos cmd</span>
              <span>✏️ Prix achat</span>
              <span>Ref enlèv.</span>
              {showTracking && <><span>🔍 Tracking</span><span>🚚 Statut</span><span>Transporteur</span></>}
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 10 : 0 }}>
              {data.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Aucun shipping ici.</div>
              ) : isMobile ? data.map((s) => (
                <ShipCard key={s.id} s={s}
                  statusMeta={STATUSES.find((x) => x.key === s.status)}
                  onOpen={() => setDetailId(detailId === s.id ? null : s.id)}
                  onMenu={() => setMenuId(menuId === s.id ? null : s.id)}
                  menuOpen={menuId === s.id}
                  isProd={isProd}
                  onAction={handleAction} />
              )) : data.map((s) => (
                <div key={s.id} className="row-hover" style={{
                  display: "grid", gridTemplateColumns: gc,
                  padding: "8px 10px", borderBottom: "1px solid var(--b2)",
                  alignItems: "start", gap: 3,
                  background: detailId === s.id ? "var(--accent-bg)" : checkedIds.has(s.id) ? "#3b82f606" : "var(--bg2)",
                  fontSize: 11, position: "relative",
                }}>
                  {/* Checkbox */}
                  <span style={{ paddingTop: 2 }}><input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggleCheck(s.id)} style={{ accentColor: "var(--accent)" }} /></span>
                  {/* Eye */}
                  <button onClick={() => setDetailId(detailId === s.id ? null : s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 0 0", color: detailId === s.id ? "var(--accent)" : "var(--t3)" }}>👁</button>
                  {/* Three dots */}
                  <div style={{ position: "relative" }}>
                    <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}
                      style={{ background: menuId === s.id ? "var(--accent-bg)" : "var(--bg3)", border: "1px solid var(--b1)", cursor: "pointer", fontSize: 15, padding: "1px 6px", borderRadius: 5, color: "var(--t1)", lineHeight: 1, fontWeight: 800 }}>
                      ⋮
                    </button>
                    {menuId === s.id && (
                      <ActionsPopover s={s} isProd={isProd}
                        onAction={handleAction} onClose={() => setMenuId(null)} />
                    )}
                  </div>
                  {/* 🔖 ID */}
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 800, color: s.isRxp ? "#8b5cf6" : "var(--accent)", fontSize: 11, paddingTop: 1 }}>
                    {s.isRxp && <span style={{ display: "inline-block", background: "#8b5cf618", border: "1px solid #8b5cf630", borderRadius: 3, padding: "0 3px", fontSize: 8, fontWeight: 800, color: "#8b5cf6", marginRight: 2, letterSpacing: "0.04em" }}>RXP</span>}
                    {s.id}
                  </span>
                  {/* 📅 Dates */}
                  <div style={{ lineHeight: 1.6, fontSize: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9 }}>✈</span>
                      <EditCell value={s.dateEnlevement} onChange={(v) => updateShipping(s.id, "dateEnlevement", v)} placeholder="jj/mm/aa" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9 }}>📬</span>
                      <EditCell value={s.dateLivSouhaitee} onChange={(v) => updateShipping(s.id, "dateLivSouhaitee", v)} placeholder="—" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9 }}>🔎</span>
                      <EditCell value={s.precision} onChange={(v) => updateShipping(s.id, "precision", v)} />
                    </div>
                  </div>
                  {/* 📝 Note */}
                  <div><EditCell value={s.note} onChange={(v) => updateShipping(s.id, "note", v)} area placeholder="—" /></div>
                  {/* 🏭 Expéditeur + Adresse + N° de sortie */}
                  <div style={{ lineHeight: 1.4, fontSize: 10 }}>
                    <div style={{ fontWeight: 700 }}><EditCell value={s.exp.nom} onChange={(v) => updateShipping(s.id, "exp.nom", v)} /></div>
                    <div style={{ color: "var(--t2)" }}><EditCell value={s.exp.adresse} onChange={(v) => updateShipping(s.id, "exp.adresse", v)} placeholder="Adresse complète" /></div>
                    <div style={{ color: "var(--t2)" }}>✉ <EditCell value={s.exp.email} onChange={(v) => updateShipping(s.id, "exp.email", v)} placeholder="email" /></div>
                    <div style={{ color: "var(--t2)" }}>☎ <EditCell value={s.exp.tel} onChange={(v) => updateShipping(s.id, "exp.tel", v)} placeholder="tél" /></div>
                  </div>
                  {/* 👤 Destinataire (Nom · Adresse · Email · Tél · info) */}
                  <div style={{ lineHeight: 1.4, fontSize: 10 }}>
                    <div style={{ fontWeight: 700 }}>
                      <EditCell value={`${s.dest.nom} ${s.dest.prenom}`} onChange={(v) => { const p = v.split(" "); updateShipping(s.id, "dest.nom", p[0] || ""); updateShipping(s.id, "dest.prenom", p.slice(1).join(" ") || ""); }} />
                    </div>
                    <div style={{ color: "var(--t2)" }}><EditCell value={`${s.dest.adresse} ${s.dest.cp} ${s.dest.ville}`} onChange={(v) => updateShipping(s.id, "dest.adresse", v)} /></div>
                    <div style={{ color: "var(--t2)" }}><EditCell value={s.dest.pays} onChange={(v) => updateShipping(s.id, "dest.pays", v)} placeholder="Pays" /></div>
                    <div style={{ color: "var(--t2)" }}>✉ <EditCell value={s.dest.email} onChange={(v) => updateShipping(s.id, "dest.email", v)} placeholder="email" /></div>
                    <div style={{ color: "var(--t2)" }}>☎ <EditCell value={s.dest.tel} onChange={(v) => updateShipping(s.id, "dest.tel", v)} placeholder="tél" /></div>
                    {s.dest.info && <div style={{ color: "#f59e0b", fontSize: 9, fontWeight: 600 }}>💬 {s.dest.info}</div>}
                  </div>
                  {/* 📦 Colis (Btls · Colisage · Champagne) */}
                  <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                    <div>🍾 <b><EditCell value={String(s.nbBtl)} onChange={(v) => updateShipping(s.id, "nbBtl", parseInt(v) || 0)} /></b> btls</div>
                    <div>📄 <EditCell value={s.colisage} onChange={(v) => updateShipping(s.id, "colisage", v)} placeholder="colisage" /></div>
                    {s.champagne && <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 9 }}>🥂 CHAMPAGNE</div>}
                  </div>
                  {/* Infos commande (Incoterm · Ass.) */}
                  <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                    <div>📄 <EditCell value={s.incoterm} onChange={(v) => updateShipping(s.id, "incoterm", v)} /></div>
                    <div>🛡 Ass. : <b>{s.assurance ? "oui" : "non"}</b></div>
                  </div>
                  {/* ✏️ Prix achat transport */}
                  <div>
                    <EditCell value={s.prixAchatTransport} onChange={(v) => updateShipping(s.id, "prixAchatTransport", v)} placeholder="—" mono />
                  </div>
                  {/* Ref enlèvement */}
                  <div>
                    <EditCell value={s.refEnlevement} onChange={(v) => updateShipping(s.id, "refEnlevement", v)} placeholder="—" />
                  </div>
                  {/* 🔍 Tracking + Lock */}
                  {showTracking && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <button onClick={() => toggleLock(s.id)} title={s.tracking.locked ? "Verrouillé — non envoyé à Ship24" : "Déverrouillé — envoyé à Ship24"}
                            style={{ background: s.tracking.locked ? "#ef444418" : "#10b98118", border: `1px solid ${s.tracking.locked ? "#ef444430" : "#10b98130"}`, borderRadius: 4, cursor: "pointer", fontSize: 12, padding: "1px 4px", lineHeight: 1, flexShrink: 0 }}>
                            {s.tracking.locked ? "🔒" : "🔓"}
                          </button>
                          <div style={{ flex: 1 }}>
                            <EditCell value={s.tracking.number} onChange={(v) => updateShipping(s.id, "tracking.number", v)} mono placeholder="N° tracking" />
                          </div>
                        </div>
                        {s.tracking.locked && <div style={{ fontSize: 8, color: "#ef4444", fontWeight: 600 }}>🔒 Non transmis</div>}
                      </div>
                      {/* 🚚 Statut Ship24 + Date liv. eff. */}
                      <div>
                        <StatusPill status={s.status} small />
                        {s.dateLivEffective && <div style={{ fontSize: 9, color: "var(--t2)", marginTop: 3 }}>✅ {s.dateLivEffective}</div>}
                      </div>
                      {/* Transporteur — dropdown */}
                      <div>
                        <select value={s.transporteur} onChange={(e) => updateShipping(s.id, "transporteur", e.target.value)}
                          style={{ padding: "3px 4px", borderRadius: 4, border: "1px solid var(--b1)", background: "var(--bg2)", color: "var(--t1)", fontSize: 10, fontFamily: "var(--font)", cursor: "pointer", width: "100%" }}>
                          {TRANSPORTEURS.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            </>);
          })()}

          {/* Footer */}
          <div style={{ padding: "7px 20px", borderTop: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--t3)", background: "var(--bg2)", flexShrink: 0 }}>
            <span>{data.length} shipping{data.length > 1 ? "s" : ""}{checkedIds.size > 0 ? ` · ${checkedIds.size} sél.` : ""}</span>
            <span>Sync : {lastSync.toLocaleTimeString("fr-FR")}</span>
          </div>
        </div>

        {/* Detail Panel */}
        {detailShipping && <DetailPanel s={detailShipping} onClose={() => setDetailId(null)} />}
      </div>

      {/* ═══════ MODALS ═══════ */}

      {modal?.type === "duplicate" && (
        <Overlay onClose={() => setModal(null)}>
          <DuplicateModal shipId={modal.data.shipId} onDuplicate={doDuplicate} onClose={() => setModal(null)} />
        </Overlay>
      )}

      {modal?.type === "move" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 340 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Déplacer #{modal.data.shipId}</div>
            {DASHBOARDS.filter((d) => d.key !== activeDashboard).map((d) => (
              <button key={d.key} onClick={() => doMove(modal.data.shipId, d.key)}
                style={{ display: "block", width: "100%", padding: "9px 14px", borderRadius: 7, border: "1px solid var(--b1)", background: "var(--bg3)", color: "var(--t1)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left", marginBottom: 5, fontFamily: "var(--font)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg3)")}>
                → {d.label}
              </button>
            ))}
            <div style={{ marginTop: 14, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Annuler</MBtn></div>
          </div>
        </Overlay>
      )}

      {modal?.type === "status" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 320 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Statut #{modal.data.shipId}</div>
            {STATUSES.slice(1).map((st) => (
              <button key={st.key} onClick={() => doStatusChange(modal.data.shipId, st.key)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", borderRadius: 7, border: modal.data.cur === st.key ? `2px solid ${st.color}` : "1px solid var(--b1)", background: modal.data.cur === st.key ? st.color + "12" : "var(--bg3)", color: st.color, cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "left", marginBottom: 5, fontFamily: "var(--font)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} /> {st.label}
                {modal.data.cur === st.key && <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.6 }}>actuel</span>}
              </button>
            ))}
            <div style={{ marginTop: 14, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Annuler</MBtn></div>
          </div>
        </Overlay>
      )}

      {modal?.type === "copy_usa" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 320 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Copier vers USA</div>
            {USA_TABS.map((t) => (
              <button key={t.key} onClick={() => doCopyUsa(modal.data.shipId, t.key)}
                style={{ display: "block", width: "100%", padding: "9px 14px", borderRadius: 7, border: "1px solid var(--b1)", background: "var(--bg3)", color: "var(--t1)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left", marginBottom: 5, fontFamily: "var(--font)" }}>
                → {t.label}
              </button>
            ))}
            <div style={{ marginTop: 12, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Annuler</MBtn></div>
          </div>
        </Overlay>
      )}

      {modal?.type === "move_sheet" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 320 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Déplacer vers feuille</div>
            {prodSheets.filter((n) => n !== activeProdSheet).map((n) => (
              <button key={n} onClick={() => doMoveSheet(modal.data.shipId, n)}
                style={{ display: "block", width: "100%", padding: "9px 14px", borderRadius: 7, border: "1px solid var(--b1)", background: "var(--bg3)", color: "var(--t1)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left", marginBottom: 5, fontFamily: "var(--font)" }}>
                → {n}
              </button>
            ))}
            {prodSheets.filter((n) => n !== activeProdSheet).length === 0 && <div style={{ fontSize: 12, color: "var(--t3)", padding: 12 }}>Créez d'abord d'autres feuilles.</div>}
            <div style={{ marginTop: 12, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Annuler</MBtn></div>
          </div>
        </Overlay>
      )}

      {modal?.type === "add_sheet" && (
        <Overlay onClose={() => setModal(null)}>
          <AddSheetModal onAdd={addProdSheet} onClose={() => setModal(null)} />
        </Overlay>
      )}

      {/* Historique actions shipping */}
      {modal?.type === "hist_action" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 480 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>📜 Historique actions shipping</div>
            <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 16 }}>Shipping #{modal.data.shipId}</div>
            <div style={{ background: "var(--bg3)", borderRadius: 10, padding: 16, fontSize: 12, color: "var(--t2)", maxHeight: 300, overflow: "auto" }}>
              {(() => { const s = shippings.find((x) => x.id === modal.data.shipId); return s ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: "2px solid var(--b1)" }}>
                    {["Date", "Action", "Détail", "Par"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "var(--t1)", fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--b2)" }}><td style={{ padding: "6px 8px" }}>Attribution</td><td>→ {s.dashboard.toUpperCase()}</td><td>Shipping attribué au dashboard</td><td>Système</td></tr>
                    {s.isRxp && <tr style={{ borderBottom: "1px solid var(--b2)" }}><td style={{ padding: "6px 8px" }}>Copie RXP</td><td>RXP de #{s.rxpParentId}</td><td>Copie RXP créée</td><td>Utilisateur</td></tr>}
                  </tbody>
                </table>
              ) : <div>Aucun historique</div>; })()}
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Fermer</MBtn></div>
          </div>
        </Overlay>
      )}

      {/* Historique communication */}
      {modal?.type === "hist_comm" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 480 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>💬 Historique communication</div>
            <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 16 }}>Shipping #{modal.data.shipId}</div>
            <div style={{ background: "var(--bg3)", borderRadius: 10, padding: 20, textAlign: "center", fontSize: 12, color: "var(--t3)" }}>
              Aucune communication enregistrée pour ce shipping.
              <div style={{ marginTop: 8 }}>
                <MBtn primary onClick={() => { setModal({ type: "communiquer", data: modal.data }); }}>✉️ Envoyer un message</MBtn>
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Fermer</MBtn></div>
          </div>
        </Overlay>
      )}

      {/* Historique ID dans dashboard */}
      {modal?.type === "hist_dashboard" && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ padding: 28, width: 480 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>🕓 Historique dans le dashboard</div>
            <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 16 }}>Shipping #{modal.data.shipId}</div>
            <div style={{ background: "var(--bg3)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "var(--accent)", color: "#fff" }}>
                  {["Date/Heure", "Champ modifié", "Ancienne valeur", "Nouvelle valeur", "Par"].map((h) => <th key={h} style={{ textAlign: "left", padding: "7px 10px", fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--b2)" }}><td style={{ padding: "6px 10px" }}>03/04/2026 16:52</td><td>Statut</td><td>NON SPÉCIFIÉ</td><td style={{ color: "var(--accent)", fontWeight: 700 }}>PICK-UP</td><td>Sireys Robin</td></tr>
                  <tr style={{ borderBottom: "1px solid var(--b2)" }}><td style={{ padding: "6px 10px" }}>03/04/2026 16:41</td><td>Dashboard</td><td>NON SPÉCIFIÉ</td><td style={{ color: "var(--accent)", fontWeight: 700 }}>{shippings.find((x) => x.id === modal.data.shipId)?.dashboard.toUpperCase() || "—"}</td><td>Sireys Robin</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}><MBtn onClick={() => setModal(null)}>Fermer</MBtn></div>
          </div>
        </Overlay>
      )}

      {/* Communiquer */}
      {modal?.type === "communiquer" && (
        <Overlay onClose={() => setModal(null)}>
          <CommuniquerModal shipId={modal.data.shipId} shipping={shippings.find((x) => x.id === modal.data.shipId)} onClose={() => setModal(null)} />
        </Overlay>
      )}
    </div>
  );
}

function AddSheetModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  return (
    <div style={{ padding: 28, width: 340 }}>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Nouvelle feuille</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la feuille" autoFocus
        style={{ display: "block", width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--b1)", background: "var(--bg3)", fontSize: 13, marginTop: 4, outline: "none", fontFamily: "var(--font)" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <MBtn onClick={onClose}>Annuler</MBtn>
        <MBtn primary onClick={() => onAdd(name)} style={{ opacity: name ? 1 : 0.4 }}>Créer</MBtn>
      </div>
    </div>
  );
}

function CommuniquerModal({ shipId, shipping, onClose }) {
  const [channel, setChannel] = useState("email");
  const [msg, setMsg] = useState("");
  const dest = shipping ? `${shipping.dest.prenom} ${shipping.dest.nom}` : "";
  const destEmail = shipping?.dest.email || "";
  const destTel = shipping?.dest.tel || "";

  return (
    <div style={{ padding: 28, width: 460 }}>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>✉️ Communiquer</div>
      <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 16 }}>Shipping #{shipId} — {dest}</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[{ key: "email", label: "📧 Email", sub: destEmail }, { key: "sms", label: "📱 SMS", sub: destTel }].map((c) => (
          <button key={c.key} onClick={() => setChannel(c.key)}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: channel === c.key ? "2px solid var(--accent)" : "1px solid var(--b1)", background: channel === c.key ? "var(--accent-bg)" : "var(--bg3)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: channel === c.key ? "var(--accent)" : "var(--t1)" }}>{c.label}</div>
            <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{c.sub || "Non renseigné"}</div>
          </button>
        ))}
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, color: "var(--t2)", textTransform: "uppercase" }}>Message</label>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} placeholder="Saisissez votre message..."
        style={{ display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--b1)", background: "var(--bg3)", fontSize: 13, marginTop: 6, outline: "none", fontFamily: "var(--font)", resize: "vertical", lineHeight: 1.5 }} />

      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <MBtn onClick={onClose}>Annuler</MBtn>
        <MBtn primary onClick={() => { alert(`Message envoyé par ${channel} à ${dest}`); onClose(); }} style={{ opacity: msg ? 1 : 0.4 }}>
          Envoyer
        </MBtn>
      </div>
    </div>
  );
}
