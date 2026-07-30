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

// ─── Journal d'activité global ───
// Chaque écriture (création / modification / suppression) passe par cette
// couche : on en profite pour tracer « qui a fait quoi » par application.
// Le module stock tient son propre journal (fusionné à l'affichage).

let auditActor: { id: string; name: string } | null = null
export function setAuditActor(actor: { id: string; name: string } | null) {
  auditActor = actor
}

type Row = Record<string, unknown>
interface AuditMeta {
  app: string | ((row: Row) => string)
  label: string
  name: (row: Row) => string
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const AUDITED: Partial<Record<TableName, AuditMeta>> = {
  objectives: { app: 'projects', label: 'Objectif', name: (r) => str(r.title) },
  tasks: { app: 'projects', label: 'Tâche', name: (r) => str(r.title) },
  workflow_templates: { app: 'projects', label: 'Process', name: (r) => str(r.name) },
  notes: { app: 'projects', label: 'Note', name: (r) => str(r.title) },
  decisions: { app: 'projects', label: 'Décision', name: (r) => str(r.title) },
  indicators: { app: 'projects', label: 'Indicateur', name: (r) => str(r.name) },
  instances: { app: 'projects', label: 'Instance', name: (r) => str(r.name) },
  channels: { app: 'chat', label: 'Canal', name: (r) => str(r.name) },
  messages: { app: 'chat', label: 'Message', name: (r) => str(r.content).slice(0, 60) },
  documents: { app: 'documents', label: 'Document', name: (r) => str(r.name) },
  links: { app: 'liens', label: 'Lien', name: (r) => str(r.label) },
  folders: {
    app: (r) => (r.kind === 'liens' ? 'liens' : 'documents'),
    label: 'Dossier',
    name: (r) => str(r.name),
  },
  profiles: { app: 'administration', label: 'Compte', name: (r) => str(r.full_name) || str(r.email) },
  app_settings: { app: 'administration', label: 'Personnalisation', name: (r) => str(r.key) },
}

function audit(verb: 'Création' | 'Modification' | 'Suppression', table: TableName, row: Row | null) {
  const meta = AUDITED[table]
  if (!meta || !auditActor || !row) return
  const app = typeof meta.app === 'function' ? meta.app(row) : meta.app
  const name = meta.name(row)
  const entry = {
    user_id: auditActor.id,
    user_name: auditActor.name,
    app,
    action: `${verb} — ${meta.label}${name ? ` « ${name} »` : ''}`,
  }
  // Fire-and-forget : le journal ne doit jamais bloquer l'action métier.
  if (supabase) {
    supabase.from('audit_log').insert(entry).then(({ error }) => {
      if (error) console.warn('Journal :', error.message)
    })
  } else {
    try {
      localDb.insert('audit_log', entry)
    } catch (e) {
      console.warn('Journal :', e)
    }
  }
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
    audit('Création', table, data as Row)
    return data as TableRowMap[K]
  }
  const created = localDb.insert(table, row)
  audit('Création', table, created as unknown as Row)
  return created
}

export async function update<K extends TableName>(
  table: K,
  id: string,
  patch: Partial<TableRowMap[K]>,
): Promise<TableRowMap[K]> {
  if (supabase) {
    const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    audit('Modification', table, data as Row)
    return data as TableRowMap[K]
  }
  const updated = localDb.update(table, id, patch)
  audit('Modification', table, updated as unknown as Row)
  return updated
}

export async function remove<K extends TableName>(table: K, id: string): Promise<void> {
  // Le nom de l'élément est lu avant suppression pour le journal.
  const audited = AUDITED[table] ? await get(table, id).catch(() => null) : null
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    audit('Suppression', table, audited as Row | null)
    return
  }
  localDb.remove(table, id)
  audit('Suppression', table, audited as Row | null)
}
