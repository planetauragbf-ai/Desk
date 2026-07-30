// Notifications internes : créées aux moments clés (attribution,
// demande de validation, validation/refus) et affichées sur le
// tableau de bord du destinataire.
import { insert } from './data'

export async function notify(userId: string | null | undefined, message: string, link?: string) {
  if (!userId) return
  try {
    await insert('notifications', { user_id: userId, message, link: link ?? null, read: false })
  } catch (e) {
    // Une notification qui échoue ne doit jamais bloquer l'action principale.
    console.error('Notification non envoyée :', e)
  }
}
