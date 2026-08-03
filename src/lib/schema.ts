/**
 * Contrôle de l'état de la base.
 *
 * L'application et la base évoluent séparément : le code est déployé
 * automatiquement, les migrations SQL sont exécutées à la main. Quand les
 * deux se désynchronisent, les symptômes sont déroutants — une page vide,
 * un enregistrement sans effet, un compteur qui reste à zéro.
 *
 * Plutôt que de le découvrir au cas par cas, on interroge la base au
 * démarrage : chaque table et chaque fonction attendues sont testées par
 * une requête vide, et ce qui manque est nommé.
 */
import { supabase } from './supabase'

/** Ce que chaque migration apporte, dans l'ordre. */
const ATTENDU: { migration: string; tables: string[]; fonctions: string[]; quoi: string }[] = [
  { migration: '0009', tables: ['folders'], fonctions: [], quoi: 'dossiers de Documents et de Liens & outils' },
  { migration: '0017', tables: ['app_secrets'], fonctions: ['is_admin', 'stock_state'], quoi: 'sécurité' },
  { migration: '0020', tables: ['chat_reads'], fonctions: ['chat_unread'], quoi: 'compteurs de messages non lus' },
  { migration: '0021', tables: ['carriers'], fonctions: [], quoi: "Planet'Claim : transporteurs" },
]

export interface EtatBase {
  complete: boolean
  manquants: { migration: string; quoi: string; objets: string[] }[]
}

async function tableAbsente(nom: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from(nom).select('*', { head: true, count: 'exact' }).limit(0)
  if (!error) return false
  // Une table présente mais protégée par RLS ne renvoie pas d'erreur de
  // structure : seule l'absence nous intéresse ici.
  return /does not exist|schema cache|PGRST205|PGRST20[26]/i.test(`${error.message} ${error.code ?? ''}`)
}

async function fonctionAbsente(nom: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc(nom as never, {} as never)
  if (!error) return false
  return /Could not find the function|does not exist|PGRST202/i.test(`${error.message} ${error.code ?? ''}`)
}

let cache: EtatBase | null = null

export async function verifierBase(): Promise<EtatBase> {
  if (cache) return cache
  if (!supabase) return { complete: true, manquants: [] }

  const manquants: EtatBase['manquants'] = []
  for (const m of ATTENDU) {
    const objets: string[] = []
    for (const t of m.tables) if (await tableAbsente(t)) objets.push(`table ${t}`)
    for (const f of m.fonctions) if (await fonctionAbsente(f)) objets.push(`fonction ${f}()`)
    if (objets.length) manquants.push({ migration: m.migration, quoi: m.quoi, objets })
  }
  cache = { complete: manquants.length === 0, manquants }
  return cache
}
