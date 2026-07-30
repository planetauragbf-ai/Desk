# Planet Aura · Organisation

Application de **pilotage organisationnel** pour Planet Aura, inspirée de la méthodologie Eidō Organisations : posez vos objectifs, gérez vos projets, suivez vos plans d'actions, partagez l'information.

## Fonctionnalités

- **Tableau de bord** — notifications, suivi de votre plan d'actions (objectifs, tâches, retards, validations), tâches des 14 prochains jours, notes récentes.
- **Chat interne** — messagerie d'équipe par canaux (temps réel via Supabase Realtime), création de canaux, modération par les administrateurs.
- **Assistant Aura** — chatbot interactif qui cherche dans **toutes** les données de l'espace (objectifs, tâches, notes, documents, décisions, process, liens, messages, équipe), répond aux questions (« tâches en retard », « où est le cahier des charges ? », « qui s'occupe du site web ? ») et propose des raccourcis.
- **Liens & outils** — annuaire des applications et raccourcis de l'équipe (Gmail, Drive, Canva…), classés par catégorie, avec recherche.
- **Objectifs** — hiérarchie objectifs / sous-objectifs, fiche complète par objectif avec onglets :
  - *Synthèse* : attendu/livrable, indices de **maîtrise** et de **réalité**, probabilité de résultat, échéances à venir, objectifs liés ;
  - *Plan d'actions* : sous-objectifs, tâches directes, workflows importés ;
  - *Tâches* : statuts (à faire, en cours, en validation, terminé), priorités, référents, échéances ;
  - *Notes*, *Documents*, *Décisions* (à instruire → en instruction → arbitrée, avec traçabilité), *Indicateurs* (cible vs réalisé).
- **Pilotage** — vue **stratégique** (cartographie des objectifs, probabilités de réussite, objectifs critiques) et vue **opérationnelle** (consolidation des tâches, respect des échéances, validations).
- **Workflows** — templates réutilisables (étapes → actions) importables dans le plan d'actions de n'importe quel objectif.
- **Notes & Documents** — centralisés et reliés aux objectifs.
- **Organisation** — instances (direction, pôles, équipes), membres et rattachements.

L'avancement se **consolide automatiquement vers le haut** : les tâches nourrissent les sous-objectifs, qui nourrissent les objectifs de tête. Aucune double saisie.

## Architecture

| Brique | Rôle |
|---|---|
| React + Vite + TypeScript + Tailwind | Frontend (SPA, interface en français) |
| Supabase | Base Postgres, authentification email/mot de passe, RLS, stockage |
| Cloudflare Pages | Hébergement du frontend, déploiement automatique via GitHub Actions |
| GitHub | Code source, CI (build à chaque push), CD (déploiement sur `main`) |

**Mode démo intégré** : sans configuration Supabase, l'application démarre avec des données d'exemple stockées dans le navigateur (localStorage). Idéal pour tester immédiatement : `npm install && npm run dev`.

## Mise en route

### 1. Développement local

```bash
npm install
npm run dev        # http://localhost:5173 — mode démo si Supabase n'est pas configuré
```

### 2. Configurer Supabase (espace partagé multi-utilisateurs)

1. Créez un projet sur [supabase.com](https://supabase.com) (offre gratuite suffisante pour démarrer).
2. Dans **SQL Editor**, exécutez les fichiers de [`supabase/migrations/`](supabase/migrations) **dans l'ordre** (`0001_init.sql` → `0006_chat_liens.sql`) : tables, sécurité RLS, trigger de création de profil, chat temps réel, liens & outils.
3. *(Optionnel)* Exécutez [`supabase/seed.sql`](supabase/seed.sql) pour partir avec des données d'exemple.
4. Dans **Authentication → Providers**, vérifiez que *Email* est activé. Désactivez « Confirm email » si vous voulez des inscriptions immédiates.
5. Récupérez dans **Settings → API** : l'URL du projet et la clé `anon public`.
6. Copiez `.env.example` vers `.env` et renseignez :
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
7. Relancez `npm run dev` : l'écran de connexion apparaît. Le premier compte créé peut être passé `admin` via **Table Editor → profiles → role**.

### 3. Déployer sur Cloudflare Pages (automatique via GitHub)

1. Créez un [compte Cloudflare](https://dash.cloudflare.com) et un **API Token** (modèle « Cloudflare Pages — Edit »). Notez aussi votre **Account ID** (visible dans l'URL du dashboard).
2. Dans le dépôt GitHub, ajoutez les secrets (**Settings → Secrets and variables → Actions**) :
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Poussez sur la branche `main` : le workflow [`deploy.yml`](.github/workflows/deploy.yml) construit l'application et la déploie sur le projet Pages `planet-aura-organisation` (créé automatiquement au premier déploiement).
4. L'application est servie sur `https://planet-aura-organisation.pages.dev` (domaine personnalisé possible dans le dashboard Cloudflare Pages).

Déploiement manuel possible : `npm run build && npx wrangler pages deploy dist --project-name=planet-aura-organisation`.

### CI

Chaque push sur une branche autre que `main` déclenche [`ci.yml`](.github/workflows/ci.yml) : installation + build TypeScript strict.

## Structure du code

```
supabase/
  migrations/                # schéma + RLS (0001 → 0006 : init, accès, branding, tâches, validation, chat & liens)
  seed.sql                   # données d'exemple (optionnel)
src/
  lib/
    types.ts                 # types des entités (objectifs, tâches, décisions…)
    supabase.ts              # client Supabase (si configuré)
    localdb.ts               # base locale du mode démo (localStorage, seed Planet Aura)
    data.ts                  # couche d'accès unifiée Supabase / démo
    compute.ts               # consolidation : complétion, probabilité, indices maîtrise/réalité
  context/AuthContext.tsx    # session (Supabase Auth ou démo)
  components/                # layout, badges, jauges, modales…
  pages/                     # Tableau de bord, Objectifs, Pilotage, Workflows, Notes, Documents, Organisation
```

## Indices et calculs

- **Complétion** : moyenne pondérée des tâches du périmètre (objectif + descendants) — terminé = 100 %, en validation = 90 %, en cours = 50 %.
- **Indice de réalité** (0–10) : avancement réel, pénalisé par les tâches en retard.
- **Indice de maîtrise** (0–10) : qualité du cadrage — échéance posée, plan d'actions défini, tâches attribuées et datées, indicateurs suivis.
- **Probabilité de résultat** (0–100 %) : avancement comparé au temps écoulé, corrigé des retards et de la maîtrise. Un objectif est **critique** si sa probabilité passe sous 40 % ou s'il porte des retards.
