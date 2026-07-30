import { useCallback, useEffect, useState } from 'react'
import { list, type OrderBy } from '../lib/data'
import type { TableName, TableRowMap } from '../lib/types'

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
      .catch((e) => console.error(`Chargement ${table} :`, e))
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
