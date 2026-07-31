/**
 * Traduction des erreurs techniques en messages lisibles.
 *
 * Sans cela, une écriture refusée par la base remontait soit un message
 * en anglais incompréhensible, soit rien du tout — l'action semblait
 * simplement « ne pas marcher ».
 */

const REGLES: { test: RegExp; message: (m: RegExpMatchArray) => string }[] = [
  {
    test: /duplicate key value.*constraint "?channels_name_uniq/i,
    message: () => 'Un canal porte déjà ce nom. Choisissez-en un autre.',
  },
  {
    test: /duplicate key value.*constraint "?claims_ref_uniq/i,
    message: () => 'Cette référence de dossier existe déjà.',
  },
  {
    test: /duplicate key value.*constraint "?folders_kind_name/i,
    message: () => 'Un dossier porte déjà ce nom.',
  },
  {
    test: /duplicate key value/i,
    message: () => 'Cet enregistrement existe déjà.',
  },
  {
    test: /violates row-level security|row-level security policy/i,
    message: () => "Vous n'avez pas les droits nécessaires pour cette action.",
  },
  {
    // PGRST116 : la ligne a bien été écrite mais n'est pas relisible,
    // ou la mise à jour n'a touché aucune ligne faute de droits.
    test: /multiple \(or no\) rows returned|PGRST116/i,
    message: () => "Action refusée : vous n'avez pas les droits sur cet élément.",
  },
  {
    test: /violates foreign key constraint/i,
    message: () => 'Un élément lié est introuvable ou a été supprimé.',
  },
  {
    test: /violates not-null constraint.*column "([^"]+)"/i,
    message: (m) => `Le champ « ${m[1]} » est obligatoire.`,
  },
  {
    test: /violates check constraint "?(\w+)/i,
    message: () => "Une valeur saisie n'est pas acceptée.",
  },
  {
    test: /infinite recursion detected in policy/i,
    message: () => 'Configuration de la base incomplète : exécutez la dernière migration SQL.',
  },
  {
    test: /relation "[^"]+" does not exist|column "[^"]+" .* does not exist/i,
    message: () => 'Configuration de la base incomplète : exécutez les dernières migrations SQL.',
  },
  {
    test: /JWT expired|invalid claim/i,
    message: () => 'Votre session a expiré. Reconnectez-vous.',
  },
  {
    test: /Failed to fetch|NetworkError|network/i,
    message: () => 'Connexion au serveur impossible. Vérifiez votre réseau.',
  },
]

/** Message lisible pour une erreur remontée par la base ou le réseau. */
export function messageErreur(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e ?? '')
  for (const r of REGLES) {
    const m = brut.match(r.test)
    if (m) return r.message(m)
  }
  return brut || "L'action n'a pas pu être effectuée."
}

/** Erreur affichée à l'écran. */
export interface ErreurAffichee {
  id: number
  contexte?: string
  message: string
}

type Abonne = (e: ErreurAffichee) => void

const abonnes = new Set<Abonne>()
let compteur = 0

/** S'abonner au flux d'erreurs (utilisé par le bandeau d'erreurs). */
export function surErreur(fn: Abonne): () => void {
  abonnes.add(fn)
  return () => abonnes.delete(fn)
}

/**
 * Signale une erreur à l'utilisateur.
 *
 * Passe par le bandeau d'erreurs quand il est monté ; retombe sur `alert`
 * sinon (erreur survenue avant le premier rendu, par exemple).
 */
export function signalerErreur(e: unknown, contexte?: string) {
  const message = messageErreur(e)
  console.error(contexte ?? 'Erreur', e)
  const erreur: ErreurAffichee = { id: ++compteur, contexte, message }
  if (abonnes.size === 0) {
    alert(contexte ? `${contexte} : ${message}` : message)
    return
  }
  abonnes.forEach((fn) => fn(erreur))
}

/**
 * Exécute une écriture et affiche un message clair si elle échoue.
 * Renvoie `null` en cas d'échec, ce qui permet d'interrompre proprement
 * la suite du traitement.
 */
export async function essayer<T>(action: () => Promise<T>, contexte?: string): Promise<T | null> {
  try {
    return await action()
  } catch (e) {
    signalerErreur(e, contexte)
    return null
  }
}

/**
 * Filet de sécurité : toute écriture dont l'erreur n'est pas rattrapée par
 * l'appelant remonte quand même à l'écran. Une trentaine d'enregistrements
 * échouaient jusqu'ici en silence — l'action semblait simplement ignorée.
 */
export function installerFiletErreurs() {
  window.addEventListener('unhandledrejection', (e) => {
    const brut = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '')
    // Bruit de navigation / annulations : sans intérêt pour l'utilisateur.
    if (/AbortError|The user aborted|ResizeObserver/i.test(brut)) return
    e.preventDefault()
    signalerErreur(e.reason)
  })
}
