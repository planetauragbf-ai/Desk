# Planet'Desk — dossier de reprise

Document destiné à un développeur qui reprend le projet. Il décrit ce qui
existe, où se trouve chaque chose, comment faire tourner l'application, et
ce qui reste à faire.

---

## 1. Ce qu'est Planet'Desk

Bureau numérique interne de **Planet Aura** (logistique viticole). Une seule
connexion donne accès à quatre applications, l'administrateur décidant
personne par personne qui accède à quoi.

| Application | Rôle | Code |
|---|---|---|
| **Planet'Projects** | Objectifs, plans d'actions, process, notes, décisions | `src/pages/` (Objectives, ObjectiveDetail, Pilotage, Workflows, Notes) |
| **Planet'Dash** | Suivi des expéditions (UE, Pays Tiers, USA) | `src/dash/` |
| **Planet'Stock** | Stockage & picking viticole | `src/stock/` |
| **Planet'Claim** | Sinistres & litiges transport | `src/pages/ClaimPage.tsx` |
| Espaces communs | Chat, assistant, documents, liens, calendrier & congés | `src/pages/` |

**En production :** https://planet-desk.pages.dev

---

## 2. Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

**Sans configuration Supabase, l'application démarre en mode démo** : jeu de
données d'exemple dans le `localStorage` du navigateur (`src/lib/localdb.ts`).
C'est le moyen le plus rapide de découvrir l'application, et c'est aussi le
mode dans lequel tournent les essais automatisés.

Pour travailler sur des données réelles, copier `.env.example` vers `.env` :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> ⚠️ Uniquement la clé **anon public**. La clé `service_role` ne doit jamais
> se trouver dans le frontend : elle contourne toutes les règles de sécurité.

---

## 3. Pile technique

| Brique | Version | Rôle |
|---|---|---|
| React | 18.3 | Interface |
| Vite | 5.3 | Build et serveur de développement |
| TypeScript | 5.5 | Typage strict (`tsc -b` bloque le build en cas d'erreur) |
| Tailwind CSS | 3.4 | Styles (sauf Planet'Stock et Planet'Dash, voir §5) |
| React Router | 6.26 | Navigation |
| @supabase/supabase-js | 2.45 | Base, authentification, stockage de fichiers, temps réel |
| three, jsqr, pdfjs-dist | — | Utilisés par Planet'Stock (3D des espaces, lecture QR, import PDF) |

Aucune dépendance de composants tierce : les éléments d'interface sont dans
`src/components/ui.tsx`.

---

## 4. Arborescence

```
src/
  main.tsx                 point d'entrée, fournisseurs, filet d'erreurs
  App.tsx                  routes et gardes d'accès
  components/
    Layout.tsx             menu latéral, menu téléphone, en-tête
    ui.tsx                 Card, Modal, Badge, StatTile, Skeleton…
    ErrorBoundary.tsx      une page qui casse ne vide plus l'écran
    ErrorToasts.tsx        bandeau d'erreurs
    ChatToasts.tsx         fenêtre « nouveau message »
    SchemaBanner.tsx       alerte quand la base est en retard sur le code
    EmojiPicker.tsx        sélecteur d'émojis du chat
    NotificationsBell.tsx  cloche de notifications
  context/
    AuthContext.tsx        session et profil courant
    BrandingContext.tsx    logos par application
    UnreadContext.tsx      compteurs de messages non lus (un seul abonnement)
  hooks/useTable.ts        chargement d'une table + refresh manuel
  lib/
    supabase.ts            client Supabase (null si non configuré)
    data.ts                couche d'accès unifiée Supabase / démo + journal
    localdb.ts             base locale du mode démo
    types.ts               types de toutes les entités + TableRowMap
    erreurs.ts             traduction des erreurs techniques en français
    schema.ts              contrôle de l'état de la base au démarrage
    permissions.ts         droits par module et par projet
    assistant.ts           moteur de recherche de l'assistant
    reminders.ts           relances automatiques des dossiers sinistres
    adherents.ts           référentiel adhérents (source : Planet'Stock)
    chat.ts, notify.ts, format.ts
  pages/                   une page par écran
  stock/                   Planet'Stock (voir §5)
  dash/                    Planet'Dash
supabase/
  migrations/              0001 → 0022, toutes rejouables
  scripts/                 fichiers à coller dans l'éditeur SQL Supabase
  seed.sql                 données d'exemple (optionnel)
```

---

## 5. Planet'Stock — le module de stockage et picking

C'est le module le plus volumineux et le plus autonome.

### 5.1 Fichiers

| Fichier | Taille | Contenu |
|---|---|---|
| `src/stock/StockApp.jsx` | ~2 140 lignes, 230 Ko | **Toute l'application** : écrans, calculs tarifaires, générateur de QR codes, impression d'étiquettes et de DRM, vue 3D des espaces |
| `src/stock/storage.js` | 237 lignes | Persistance et synchronisation temps réel |
| `src/stock/StockApp.d.ts` | — | Déclaration de types pour l'import depuis TypeScript |
| `src/pages/StockPage.tsx` | 33 lignes | Montage du module dans Planet'Desk |

**À savoir avant d'y toucher :** ce module est écrit en **JavaScript, pas en
TypeScript**, avec des **styles en ligne** et non en Tailwind, et une
convention de nommage très condensée (`d` pour data, `sD` pour setData, `P`
pour la palette). C'est un module repris d'une application autonome
antérieure, intégré tel quel. Le reste de Planet'Desk suit des conventions
différentes : TypeScript strict, Tailwind, noms explicites.

### 5.2 Comment il est monté

`src/pages/StockPage.tsx` le charge en `lazy` (le module est lourd : 3D, PDF,
QR) et lui passe deux propriétés :

```jsx
<StockApp
  forcedTab={params.get('onglet')}   // onglet demandé par le menu de gauche
  session={{ email, fullName, isAdmin, stockAccess }}
/>
```

Le module **n'a pas d'écran de connexion** : la session vient de Planet'Desk.
La navigation vit dans le menu latéral de Planet'Desk (`stockNav()` dans
`Layout.tsx`), via `?onglet=…` — pas dans le module lui-même.

`StockApp` filtre ses onglets selon `session.stockAccess` :

- `{ role: 'admin' }` — tous les onglets ;
- `{ role: 'logisticien', permissions: {…} }` — onglets choisis par l'admin ;
- `{ role: 'adherent', adherent_id }` — un seul écran, ses propres données ;
- `null` — comportement par défaut (correspondance par e-mail).

### 5.3 Persistance : un seul document JSONB

Tout l'état du module tient dans **une ligne** de la table `app_state`, clé
`pa-stock-clean2` :

```js
{
  adherents: [], references: [], entrees: [], sorties: [],
  espaces: [], factures: [], fournitures: [], journal: [],
  nextEntreeId, nextSortieId, nextFactureId
}
```

`src/stock/storage.js` expose :

| Fonction | Rôle |
|---|---|
| `loadState()` | lecture via la RPC `stock_state()` |
| `saveState(d)` | écriture (différée, puis diffusion aux autres postes) |
| `subscribeSync(cb)` | temps réel : broadcast + `postgres_changes` |
| `uploadPhoto(file, dossier)` / `deletePhoto(path)` | bucket `photos` |

**Le filtrage des adhérents se fait côté serveur**, pas dans le navigateur.
La fonction `stock_state()` (migration `0017`) renvoie l'état complet à un
salarié interne, et un état **filtré** à un adhérent — uniquement ses
adhérents, références, entrées, sorties et factures. Ne pas contourner cette
RPC par un `select` direct sur `app_state` : ce serait rouvrir la fuite de
données entre clients.

### 5.4 Limite structurelle à connaître

Le document JSONB est **écrit en entier à chaque sauvegarde**. Deux personnes
qui travaillent en même temps sur le stock : la dernière écriture écrase la
précédente. Planet'Dash avait le même défaut, corrigé par une écriture
conditionnelle sur `updated_at` (`src/dash/storage.js`, fonction `ecrire`) —
**le même correctif reste à appliquer à Planet'Stock**. C'est le point
d'amélioration le plus important du module.

---

## 6. Base de données

### 6.1 Mise en place

| Cas | Fichier |
|---|---|
| Base neuve | `supabase/scripts/installation_desk.sql` (migrations 0001 → 0022) |
| Base déjà en service | `supabase/scripts/rattrapage.sql` |
| Données d'exemple | `supabase/seed.sql` |
| Import des sinistres | `supabase/scripts/import_sinistres.sql` |

À coller dans **SQL Editor → New query → Run**.

**Ces deux premiers fichiers sont générés**, ne pas les modifier à la main :

```bash
./supabase/scripts/generer.sh
```

La liste des migrations du rattrapage est en tête de ce script.

### 6.2 Règle absolue : les migrations sont rejouables

Chaque migration peut être relancée sans erreur : `create table if not
exists`, `drop policy if exists` avant chaque `create policy`, `alter
publication` dans un bloc qui absorbe l'exception. Toute nouvelle migration
doit respecter cette règle — c'est ce qui permet de rattraper une base dont
on ne connaît pas l'état exact.

**Vérification recommandée avant toute livraison SQL** : monter un PostgreSQL
local avec un schéma imitant Supabase (`auth.uid()`, `storage.buckets`,
publication `supabase_realtime`), rejouer la chaîne complète **trois fois**,
puis rejouer le scénario réel de la production. Plusieurs pannes ont été
causées par une migration validée sur base neuve mais pas sur base remplie.

### 6.3 Tables principales

`profiles` · `objectives` · `tasks` · `notes` · `documents` · `decisions` ·
`indicators` · `objective_members` · `workflow_templates` / `_steps` /
`_actions` · `channels` · `channel_members` · `messages` · `poll_votes` ·
`chat_reads` · `links` · `folders` · `leaves` · `time_entries` ·
`notifications` · `audit_log` · `claims` · `claim_events` · `carriers` ·
`app_state` · `app_settings` · `app_secrets`

### 6.4 Sécurité (RLS)

Modèle « intermédiaire », posé par la migration `0017` :

- les **salariés internes** voient les données de travail entre eux ;
- les **actions sensibles** sont verrouillées côté base : gestion des accès,
  validation des congés, journal d'activité ;
- les **adhérents** (clients externes) sont strictement cloisonnés ;
- les **conversations privées** ne sont lisibles que de leurs membres.

Deux pièges rencontrés, à ne pas reproduire :

1. **Récursion.** Une politique sur une table qui interroge cette même table
   provoque `infinite recursion detected in policy`. Passer par une fonction
   `security definer` (`is_admin()`, `is_internal()`, `can_see_channel()`…).
   Voir les migrations `0019` et `0022`.
2. **Performance.** Appeler les fonctions de contexte sous la forme
   `(select public.is_admin())` : PostgreSQL les évalue alors une fois par
   requête au lieu d'une fois par ligne.

Un garde-fou (`guard_profile_privileges`) empêche un salarié de modifier son
rôle, ses modules ou ses droits. Il laisse passer le contexte serveur
(éditeur SQL, clé de service) : sans cette porte de sortie, personne ne
pourrait nommer le premier administrateur.

---

## 7. Déploiement

Cloudflare Pages, via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

Secrets à définir dans **Settings → Secrets and variables → Actions** :

```
CLOUDFLARE_API_TOKEN      (modèle « Cloudflare Pages — Edit »)
CLOUDFLARE_ACCOUNT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Déploiement manuel :

```bash
npm run build && npx wrangler pages deploy dist --project-name=planet-desk
```

`public/_redirects` contient la règle de repli SPA (`/* /index.html 200`),
indispensable pour que le rechargement d'une page profonde ne renvoie pas
une 404.

---

## 8. Ce qui reste à faire

Recensé lors d'un audit complet du code. Par ordre d'importance :

### Important

1. **Écriture concurrente sur Planet'Stock** (§5.4) — le dernier qui
   enregistre écrase le travail de l'autre. Correctif déjà écrit pour
   Planet'Dash, à transposer.
2. **Aucune pagination.** Toutes les listes chargent l'intégralité de la
   table. Tenable aujourd'hui (quelques centaines de lignes), pas à moyen
   terme. Le journal d'activité est le seul à borner son affichage (300
   entrées).
3. **Documents : fichier OU lien.** Le bucket `documents` et la colonne
   `storage_path` existent mais ne sont pas utilisés — seuls les liens
   externes fonctionnent.

### Moyen

4. **Concept « instances » à supprimer.** `src/pages/Organisation.tsx` est du
   code mort, `instance_id` traîne dans `profiles` et `objectives`, et des
   listes déroulantes le proposent encore.
5. **~40 `prompt()` / `confirm()` natifs** à remplacer par des fenêtres de
   l'application ; confirmations manquantes sur certaines suppressions.
6. **Performance de l'interface** : le calendrier recalcule les congés par
   cellule (O(n³) sur un mois chargé), l'assistant reconstruit son index à
   chaque recherche.
7. **Fichiers orphelins** : supprimer un document ou un message ne supprime
   pas le fichier correspondant dans le Storage.
8. **Buckets `chat` et `claims` publics en lecture.** Une URL devinée donne
   accès au fichier. À passer en URLs signées.

### Mineur

9. `claims.kind` est figé à `'sinistre'` (le concept de litige a été
   abandonné) ; `profiles.cp_droits` est écrit mais jamais lu ;
   `ComingSoonPage.tsx` n'est plus référencé ; les process ne peuvent être
   ni renommés ni réordonnés ; Planet'Dash contient quatre URL de
   back-office en dur.
10. **Ship24** : la clé API se saisit dans Administration et se stocke dans
    `app_secrets`, mais **le raccordement au service n'est pas fait**. Les
    statuts d'expédition sont saisis à la main.

---

## 9. Conventions

- **Interface entièrement en français**, y compris les messages d'erreur.
- **Commentaires en français**, et réservés au *pourquoi* : ce qui a été
  essayé, ce qui a cassé, la contrainte à respecter. Le *quoi* se lit dans
  le code.
- **TypeScript strict** : `npm run build` échoue à la moindre erreur de type.
- Les écritures passent par `insert` / `update` / `remove` de
  `src/lib/data.ts` — qui alimentent automatiquement le journal d'activité.
  Ne pas appeler `supabase.from(...)` directement pour une écriture métier.
- Les erreurs se signalent via `signalerErreur(err, 'Contexte')`
  (`src/lib/erreurs.ts`), jamais par un `alert()` brut.
