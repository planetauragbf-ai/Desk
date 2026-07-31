// Référentiel unique des adhérents / clients de Planet Aura.
//
// La source de vérité est Planet'Stock (fiches adhérents complètes :
// grille tarifaire, contacts, activation). Les autres modules
// (Planet'Claim, Planet'Dash) s'y raccordent au lieu de tenir chacun
// leur liste, avec repli sur les valeurs déjà saisies pour ne rien perdre.
import { supabase } from './supabase'

export interface AdherentRef {
  id: string
  name: string
  email?: string
  actif: boolean
}

const STOCK_KEY = 'pa-stock-clean2'

let cache: AdherentRef[] | null = null

/** Adhérents du référentiel Planet'Stock (mis en cache pour la session). */
export async function loadAdherents(): Promise<AdherentRef[]> {
  if (cache) return cache
  if (!supabase) {
    cache = []
    return cache
  }
  try {
    const { data } = await supabase.from('app_state').select('value').eq('key', STOCK_KEY).maybeSingle()
    const raw = (data?.value as { adherents?: { id: string; name: string; email?: string; stockageActif?: boolean }[] } | undefined)?.adherents
    cache = (raw ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      actif: a.stockageActif !== false,
    }))
  } catch {
    cache = []
  }
  return cache
}

/**
 * Noms d'adhérents proposés dans un formulaire : référentiel Planet'Stock
 * en priorité, complété par les valeurs déjà utilisées dans le module
 * appelant (historique conservé même si l'adhérent n'est plus au stock).
 */
export function mergeAdherentNames(referentiel: AdherentRef[], used: (string | undefined)[]): string[] {
  const names = new Set<string>()
  for (const a of referentiel) if (a.actif && a.name) names.add(a.name)
  for (const u of used) if (u && u.trim()) names.add(u.trim())
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'))
}
