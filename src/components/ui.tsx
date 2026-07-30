import { type ReactNode } from 'react'
import { initials } from '../lib/format'
import type { Priority, TaskStatus, ObjectiveStatus, DecisionStatus } from '../lib/types'
import {
  TASK_STATUS_LABELS,
  OBJECTIVE_STATUS_LABELS,
  PRIORITY_LABELS,
  DECISION_STATUS_LABELS,
} from '../lib/format'

export function Card({ title, action, children, className = '' }: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-aura-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const color = v >= 75 ? 'bg-emerald-500' : v >= 40 ? 'bg-accent-500' : 'bg-coral-500'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 flex-1 rounded-full bg-aura-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs font-semibold text-aura-700 w-9 text-right">{v}%</span>
    </div>
  )
}

export function Avatar({ name, size = 7 }: { name: string; size?: number }) {
  const palette = ['bg-aura-800', 'bg-accent-500', 'bg-coral-500', 'bg-emerald-600', 'bg-violet-600']
  const idx = name.length ? name.charCodeAt(0) % palette.length : 0
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold ${palette[idx]} h-${size} w-${size}`}
      style={{ height: `${size * 4}px`, width: `${size * 4}px` }}
    >
      {initials(name)}
    </span>
  )
}

const badgeStyles: Record<string, string> = {
  // statuts de tâche
  a_faire: 'bg-aura-100 text-aura-800',
  en_cours: 'bg-sky-100 text-sky-800',
  validation: 'bg-amber-100 text-amber-800',
  termine: 'bg-emerald-100 text-emerald-800',
  // statuts d'objectif
  non_initie: 'bg-aura-100 text-aura-800',
  // priorités
  basse: 'bg-aura-100 text-aura-700',
  moyenne: 'bg-sky-100 text-sky-800',
  haute: 'bg-amber-100 text-amber-800',
  critique: 'bg-coral-500/15 text-coral-600',
  // décisions
  a_instruire: 'bg-aura-100 text-aura-800',
  en_instruction: 'bg-amber-100 text-amber-800',
  arbitree: 'bg-emerald-100 text-emerald-800',
}

export function Badge({ value, kind }: {
  value: TaskStatus | ObjectiveStatus | Priority | DecisionStatus
  kind: 'task' | 'objective' | 'priority' | 'decision'
}) {
  const labels: Record<string, string> =
    kind === 'task' ? TASK_STATUS_LABELS
    : kind === 'objective' ? OBJECTIVE_STATUS_LABELS
    : kind === 'priority' ? PRIORITY_LABELS
    : DECISION_STATUS_LABELS
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${badgeStyles[value] ?? 'bg-aura-100 text-aura-800'}`}>
      {labels[value] ?? value}
    </span>
  )
}

export function StatTile({ label, value, tone = 'default' }: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'ok'
}) {
  const tones = {
    default: 'bg-aura-100/70 text-aura-900',
    alert: 'bg-coral-500/10 text-coral-600',
    ok: 'bg-emerald-100 text-emerald-800',
  }
  return (
    <div className={`rounded-lg px-4 py-3 text-center ${tones[tone]}`}>
      <div className="text-xs font-semibold opacity-80">{label}</div>
      <div className="text-xl font-extrabold mt-0.5">{value}</div>
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-aura-700/70 py-6 text-center">{children}</p>
}

export function Modal({ title, onClose, children, wide = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-aura-950/50 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-aura-700 hover:text-aura-900 text-xl leading-none" aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function GaugeRing({ value, size = 56, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const color = v >= 70 ? '#059669' : v >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold">{label ?? `${v}%`}</span>
    </div>
  )
}
