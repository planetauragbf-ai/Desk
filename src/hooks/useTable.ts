import { useCallback, useEffect, useState } from 'react'
import { list, type OrderBy } from '../lib/data'
import { signalerErreur } from '../lib/erreurs'
import type { TableName, TableRowMap } from '../lib/types'

/** Une même erreur de lecture n'est signalée qu'une fois par session. */
const dejaSignalees = new Set<string>()

/** Charge une table avec rechargement manuel via `refresh()`. */
export function useTable<K extends TableName>(
  table: K,
  where?: Partial<TableRowMap[K]>,
  orderBy?: OrderBy,
) {
  const [rows, setRows] = useState<TableRowMap[K][]>([])
  const [loading, setLoading] = useState(true)
  const whereKey = JSON.stringify(where ?? null)
  const orderKey = JSON.stringify(orderBy ?? null)

  const refresh = useCallback(() => {
    let cancelled = false
    list(table, where, orderBy)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e) => {
        // Une lecture qui échoue laissait la liste vide, sans un mot :
        // impossible de distinguer « rien à afficher » de « ça ne marche
        // pas ». On le dit, une seule fois par type d'erreur.
        const cle = `${table}:${e instanceof Error ? e.message : String(e)}`
        if (dejaSignalees.has(cle)) return
        dejaSignalees.add(cle)
        signalerErreur(e, `Chargement (${table})`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, whereKey, orderKey])

  useEffect(() => refresh(), [refresh])

  return { rows, loading, refresh }
}
