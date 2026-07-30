// Rappels automatiques : à l'ouverture de l'application, on génère des
// notifications pour les dossiers Planet'Claim de l'utilisateur qui
// arrivent à échéance (prochaine action ou date limite de réclamation).
// Anti-doublon : on ne recrée pas une notification au message identique.
import { list } from './data'
import { notify } from './notify'
import { canAccessModule } from './permissions'
import { formatDate } from './format'
import type { Profile } from './types'

let alreadyRan = false

const OPEN_STATUSES = ['nouveau', 'en_cours', 'attente_transporteur', 'attente_assurance', 'attente_client']

export async function runClaimReminders(profile: Profile | null): Promise<void> {
  if (!profile || alreadyRan) return
  if (!canAccessModule(profile, 'claim')) return
  alreadyRan = true
  try {
    const [claims, myNotifs] = await Promise.all([
      list('claims'),
      list('notifications', { user_id: profile.id }),
    ])
    const existing = new Set(myNotifs.map((n) => n.message))
    const horizon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    const due = claims.filter(
      (c) =>
        c.assignee_id === profile.id &&
        OPEN_STATUSES.includes(c.status) &&
        ((c.action_echeance && c.action_echeance <= horizon) || (c.deadline && c.deadline <= horizon)),
    )
    for (const c of due) {
      const when = [c.action_echeance, c.deadline].filter(Boolean).sort()[0]!
      const what = c.prochaine_action || 'relancer le dossier'
      const message = `⏰ ${c.ref} à relancer : ${what} (échéance ${formatDate(when)})`
      if (existing.has(message)) continue
      await notify(profile.id, message, '/claim')
    }
  } catch (e) {
    console.warn('Rappels dossiers :', e)
  }
}
