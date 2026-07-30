-- ============================================================
-- Planet'Claim v2 — Dossier complet aligné sur le suivi PA
-- À exécuter APRÈS 0015_claim.sql.
-- Sections : identification, client, commande, transport, sinistre,
-- réserves & recours transporteur, Coste Fermon (assureur),
-- indemnisation, prochaine action.
-- ============================================================

alter table public.claims add column if not exists client_nom text not null default '';
alter table public.claims add column if not exists client_email text not null default '';
alter table public.claims add column if not exists client_tel text not null default '';

alter table public.claims add column if not exists date_expedition date;
alter table public.claims add column if not exists date_livraison date;
alter table public.claims add column if not exists valeur_commande numeric not null default 0;

alter table public.claims add column if not exists lien_suivi text not null default '';
alter table public.claims add column if not exists lien_transporteur text not null default '';

alter table public.claims add column if not exists nb_bouteilles int not null default 0;
alter table public.claims add column if not exists lien_drive text not null default '';

alter table public.claims add column if not exists reserves text not null default '';
alter table public.claims add column if not exists lrar_le date;
alter table public.claims add column if not exists ar_le date;
alter table public.claims add column if not exists reponse_transporteur text not null default '';

alter table public.claims add column if not exists cf_declaration date;
alter table public.claims add column if not exists cf_dossier text not null default '';
alter table public.claims add column if not exists cf_interlocuteur text not null default '';
alter table public.claims add column if not exists cf_statut text not null default '';
alter table public.claims add column if not exists cf_relance date;

alter table public.claims add column if not exists montant_propose numeric not null default 0;
alter table public.claims add column if not exists date_accord date;
alter table public.claims add column if not exists date_versement date;

alter table public.claims add column if not exists prochaine_action text not null default '';
alter table public.claims add column if not exists action_echeance date;
alter table public.claims add column if not exists notes text not null default '';

-- Assureur par défaut : Coste Fermon
alter table public.claims alter column assureur set default 'Coste Fermon';
