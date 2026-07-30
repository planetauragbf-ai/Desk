// Couche d'accès aux données : une même interface pour Supabase
// (production) et la base locale (mode démo sans backend).
import { supabase, supabaseConfigured } from './supabase'
import { localDb } from './localdb'
import type { TableName, TableRowMap } from './types'

export const demoMode = !supabaseConfigured

export interface OrderBy {
  column: string
  ascending?: boolean
}

export async function list<K extends TableName>(
  table: K,
  where?: Partial<TableRowMap[K]>,
  orderBy?: OrderBy,
): Promise<TableRowMap[K][]> {
  if (supabase) {
    let q = supabase.from(table).select('*')
    if (where) {
      for (const [k, v] of Object.entries(where)) {
        q = v === null ? q.is(k, null) : q.eq(k, v)
      }
    }
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as TableRowMap[K][]
  }
  const rows = localDb.list(table, where)
  if (orderBy) {
    const { column, ascending = true } = orderBy
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[column] ?? ''
      const bv = (b as unknown as Record<string, unknown>)[column] ?? ''
      return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1)
    })
  }
  return rows
}

export async function get<K extends TableName>(table: K, id: string): Promise<TableRowMap[K] | null> {
  if (supabase) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return (data as TableRowMap[K]) ?? null
  }
  return localDb.get(table, id)
}

export async function insert<K extends TableName>(
  table: K,
  row: Partial<TableRowMap[K]>,
): Promise<TableRowMap[K]> {
  if (supabase) {
    const { data, error } = await supabase.from(table).insert(row as never).select('*').single()
    if (error) throw new Error(error.message)
    return data as TableRowMap[K]
  }
  return localDb.insert(table, row)
}

export async function update<K extends TableName>(
  table: K,
  id: string,
  patch: Partial<TableRowMap[K]>,
): Promise<TableRowMap[K]> {
  if (supabase) {
    const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return data as TableRowMap[K]
  }
  return localDb.update(table, id, patch)
}

export async function remove<K extends TableName>(table: K, id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  localDb.remove(table, id)
}
