#!/usr/bin/env bash
# Régénère les scripts « à coller dans l'éditeur SQL Supabase » à partir
# des migrations. À relancer après toute modification de supabase/migrations.
#   ./supabase/scripts/generer.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

# Migrations qui manquent à la base déjà en service. Ajoutez ici toute
# nouvelle migration, et relancez ce script.
RATTRAPAGE=(0009_dossiers 0017_securite 0018_performance 0019_chat_recursion 0020_chat_lecture 0021_claim_vocabulaire 0022_profils_recursion)

entete() {
  printf '\n\n-- ############################################################\n'
  printf -- '-- ### MIGRATION %s\n' "$1"
  printf -- '-- ############################################################\n\n'
}

# ---------- Installation complète (base neuve) ----------
{
  cat <<'EOF'
-- ============================================================
-- Planet'Desk — SCRIPT D'INSTALLATION COMPLET
-- Pour repartir d'un projet Supabase neuf :
-- Dashboard → SQL Editor → New query → coller tout → Run.
--
-- Contient l'intégralité du schéma : organisation et projets, chat,
-- liens & outils, Planet'Stock, Planet'Dash, Planet'Claim, calendrier
-- et congés, journal d'activité, sécurité (RLS) et index.
--
-- Le script est REJOUABLE : sur une base déjà installée il se contente
-- de remettre les politiques et les index en place, sans toucher aux
-- données. Pour vider les données de démonstration, exécutez ensuite
-- supabase/scripts/remise_a_zero.sql.
--
-- Fichier généré par supabase/scripts/generer.sh — ne pas modifier ici.
-- ============================================================

EOF
  for f in supabase/migrations/*.sql; do
    entete "$(basename "$f" .sql)"
    cat "$f"
  done
} > supabase/scripts/installation_desk.sql

# ---------- Rattrapage de la base déjà en production ----------
{
  cat <<'EOF'
-- ============================================================
-- Planet'Desk — RATTRAPAGE
--   0009  dossiers de Documents et de Liens & outils (jamais exécutée)
--   0017  verrouillage de la sécurité (modèle « intermédiaire »)
--   0018  performance : index, intégrité des données, temps réel
--   0019  correctif : récursion des politiques du chat
--   0020  chat : compteurs de messages non lus
--   0021  Planet'Claim : vocabulaire du classeur + transporteurs
--   0022  correctif : récursion des politiques de profiles
--
-- À exécuter EN UNE SEULE FOIS : Supabase → SQL Editor → New query
-- → coller tout → Run. Les migrations sont reprises ci-dessous dans
-- le bon ordre.
--
-- Le script est REJOUABLE : le relancer ne casse rien et ne touche
-- à aucune donnée existante.
--
-- Fichier généré par supabase/scripts/generer.sh — ne pas modifier ici.
-- ============================================================

EOF
  for m in "${RATTRAPAGE[@]}"; do
    entete "$m"
    cat "supabase/migrations/$m.sql"
  done
} > supabase/scripts/rattrapage.sql

echo "installation_desk.sql et rattrapage.sql régénérés."
