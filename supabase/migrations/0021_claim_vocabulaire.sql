-- ============================================================
-- Planet'Claim — Vocabulaire aligné sur le suivi Planet Aura
-- À exécuter APRÈS 0020_chat_lecture.sql. Script rejouable.
--
-- Le module utilisait ses propres codes (« nouveau », « casse »,
-- « moyenne »). Le classeur de suivi, lui, a son vocabulaire — dix
-- statuts, neuf types, trois niveaux d'urgence, listés dans son onglet
-- « Listes ». Importer les dossiers sans aligner les deux aurait
-- déformé les données à l'entrée.
--
-- Ce sont donc les valeurs du classeur qui font foi, et les dossiers
-- déjà saisis dans l'application sont convertis.
-- ============================================================

-- ---------- 1. Les anciennes contraintes doivent tomber d'abord -------
alter table public.claims drop constraint if exists claims_status_chk;
alter table public.claims drop constraint if exists claims_category_chk;
alter table public.claims drop constraint if exists claims_priority_chk;

-- ---------- 2. Conversion des dossiers déjà saisis --------------------
update public.claims set status = case status
  when 'nouveau'              then 'Nouveau'
  when 'en_cours'             then 'En instruction'
  when 'attente_transporteur' then 'Documents en cours'
  when 'attente_assurance'    then 'Transmis Coste Fermon'
  when 'attente_client'       then 'Documents en cours'
  when 'accepte'              then 'Accord assureur'
  when 'refuse'               then 'Refusé / Sans suite'
  when 'clos'                 then 'Clôturé'
  else status end
where status in ('nouveau','en_cours','attente_transporteur','attente_assurance',
                 'attente_client','accepte','refuse','clos');

update public.claims set category = case category
  when 'casse'            then 'Casse partielle'
  when 'perte'            then 'Perte'
  when 'vol'              then 'Vol'
  when 'temperature'      then 'Altération thermique'
  when 'erreur_livraison' then 'Refus livraison'
  when 'retard'           then 'Autre'
  when 'facturation'      then 'Autre'
  when 'autre'            then 'Autre'
  else category end
where category in ('casse','perte','vol','temperature','erreur_livraison',
                   'retard','facturation','autre');

update public.claims set priority = case priority
  when 'basse'    then 'Normal'
  when 'moyenne'  then 'Normal'
  when 'haute'    then 'Important'
  when 'critique' then 'Critique'
  else priority end
where priority in ('basse','moyenne','haute','critique');

-- Filet : toute valeur restée inconnue retombe sur la valeur par défaut,
-- sinon la contrainte posée ensuite ne pourrait pas être validée.
update public.claims set status = 'Nouveau'
where status not in ('Nouveau','Documents en cours','Transmis Coste Fermon','En instruction',
                     'Expertise en cours','Accord assureur','Indemnisé','Clôturé',
                     'Refusé / Sans suite','Non - Assuré');
update public.claims set category = 'Autre'
where category not in ('Casse partielle','Casse totale','Coulage / fuite','Perte','Vol',
                       'Refus livraison','Altération thermique','Étiquette tachée','Autre');
update public.claims set priority = 'Normal'
where priority not in ('Normal','Important','Critique');

-- ---------- 3. Nouvelles valeurs par défaut et contraintes ------------
alter table public.claims alter column status   set default 'Nouveau';
alter table public.claims alter column category set default 'Casse partielle';
alter table public.claims alter column priority set default 'Normal';

alter table public.claims add constraint claims_status_chk check (status in (
  'Nouveau','Documents en cours','Transmis Coste Fermon','En instruction','Expertise en cours',
  'Accord assureur','Indemnisé','Clôturé','Refusé / Sans suite','Non - Assuré'));

alter table public.claims add constraint claims_category_chk check (category in (
  'Casse partielle','Casse totale','Coulage / fuite','Perte','Vol','Refus livraison',
  'Altération thermique','Étiquette tachée','Autre'));

alter table public.claims add constraint claims_priority_chk check (priority in (
  'Normal','Important','Critique'));

-- ---------- 4. Annuaire des transporteurs -----------------------------
-- Le classeur porte un onglet « Transporteurs » : contacts du service
-- litiges et délai maximum de recours. C'est ce délai qui déclenche les
-- relances, il a sa place dans l'application plutôt que dans un fichier
-- à part.
create table if not exists public.carriers (
  name            text primary key,
  phone           text not null default '',
  email           text not null default '',
  address         text not null default '',
  tracking_url    text not null default '',
  claim_url       text not null default '',
  delai_recours   text not null default '',
  notes           text not null default ''
);

alter table public.carriers enable row level security;
drop policy if exists "carriers_read" on public.carriers;
create policy "carriers_read" on public.carriers for select to authenticated using (true);
drop policy if exists "carriers_admin_write" on public.carriers;
create policy "carriers_admin_write" on public.carriers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.carriers (name, phone, email, address, tracking_url, claim_url, delai_recours, notes) values
  ('UPS', '+33 821 233 877', 'frcustomersupport@ups.com', 'UPS France – Aéroport CDG, BP 70535, 95721 Roissy CDG', 'https://www.ups.com/track', 'https://www.ups.com/fr/fr/support/file-a-claim.page', '9 mois (UPS) / 3 j (FR)', ''),
  ('FedEx', '+33 1 70 95 92 25', 'frcustomerservice@fedex.com', 'FedEx Express France – Roissy CDG', 'https://www.fedex.com/fr-fr/tracking.html', 'https://www.fedex.com/fr-fr/customer-support/claims.html', '21 jours (CMR)', ''),
  ('Chronopost', '3634 (FR)', 'service.clients@chronopost.fr', 'Chronopost SA – 3 Bd Romain Rolland, 92120 Montrouge', 'https://www.chronopost.fr/fr/suivi-colis', 'https://www.chronopost.fr/fr/contactez-nous', '3 jours ouvrés', ''),
  ('DHL Express', '+33 1 55 85 75 75', 'expressfrance@dhl.com', 'DHL Express France – 241 Rue de la Belle Étoile, 95701 Roissy CDG', 'https://www.dhl.com/fr-fr/home/tracking.html', 'https://www.dhl.com/fr-fr/home/contactez-nous.html', '3 jours ouvrés', ''),
  ('TNT', '+33 825 033 033', 'customer.servicefrance@tnt.fr', 'TNT Express France – 58 Av. Leclerc, 69007 Lyon', 'https://www.tnt.com/express/fr_fr/site/shipping-tools/tracking.html', 'https://www.tnt.com/express/fr_fr/site/contact-us/forms/customer-care.html', '21 jours (CMR)', ''),
  ('DPD', '+33 9 70 80 85 86', 'service.clients@dpd.fr', 'DPD France – 9 Rue Maurice Mallet, 92130 Issy-les-Moulineaux', 'https://www.dpd.com/fr/fr/recevoir/suivre-mon-colis/', 'https://www.dpd.com/fr/fr/contact/', '3 jours ouvrés', ''),
  ('GLS', '+33 1 78 36 13 00', 'info-fr@gls-france.com', 'GLS France – 14 Rue Michael Faraday, 77700 Magny-le-Hongre', 'https://gls-group.com/FR/fr/suivi-colis', 'https://gls-group.com/FR/fr/nous-contacter', '3 jours ouvrés', ''),
  ('Geodis', '+33 1 56 76 26 00', 'contact@geodis.com', 'Geodis – 26 Quai Charles Pasqua, 92300 Levallois-Perret', 'https://www.geodis.com/fr', 'https://www.geodis.com/fr/nous-contacter', 'Variable selon contrat', ''),
  ('Schenker', '+33 1 56 24 80 00', 'info.fr@dbschenker.com', 'DB Schenker France – 1 Rue Berthelot, 93100 Montreuil', 'https://eschenker.dbschenker.com/', 'https://www.dbschenker.com/fr-fr/nous-contacter', 'Variable selon contrat', ''),
  ('Autre', '', '', '', '', '', '', 'À compléter au cas par cas')
on conflict (name) do update set
  phone = excluded.phone, email = excluded.email, address = excluded.address,
  tracking_url = excluded.tracking_url, claim_url = excluded.claim_url,
  delai_recours = excluded.delai_recours, notes = excluded.notes;

-- Weship, ajouté à votre demande, ne figure pas au classeur.
insert into public.carriers (name) values ('Weship') on conflict (name) do nothing;
