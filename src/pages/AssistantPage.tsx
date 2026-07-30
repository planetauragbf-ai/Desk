import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { answer, KIND_LABELS, SHORTCUTS, type AssistantData, type AssistantResult } from '../lib/assistant'
import { Card } from '../components/ui'

interface Turn {
  who: 'moi' | 'aura'
  text: string
  results?: AssistantResult[]
}

export default function AssistantPage() {
  const { profile } = useAuth()
  const [turns, setTurns] = useState<Turn[]>([
    {
      who: 'aura',
      text:
        "Bonjour ! Je suis l'assistant Aura 🌍. Posez-moi une question : je cherche dans tous les objectifs, tâches, notes, documents, décisions, process, liens et messages de l'espace Planet Aura.",
    },
  ])
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const { rows: profiles } = useTable('profiles')
  const { rows: objectives } = useTable('objectives')
  const { rows: tasks } = useTable('tasks')
  const { rows: notes } = useTable('notes')
  const { rows: documents } = useTable('documents')
  const { rows: decisions } = useTable('decisions')
  const { rows: workflows } = useTable('workflow_templates')
  const { rows: links } = useTable('links')
  const { rows: channels } = useTable('channels')
  const { rows: messages } = useTable('messages')
  const { rows: leaves } = useTable('leaves')

  const data: AssistantData = useMemo(
    () => ({ profile, profiles, objectives, tasks, notes, documents, decisions, workflows, links, channels, messages, leaves }),
    [profile, profiles, objectives, tasks, notes, documents, decisions, workflows, links, channels, messages, leaves],
  )

  // Défilement du fil de conversation uniquement (jamais de la page entière).
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length])

  function ask(question: string) {
    const q = question.trim()
    if (!q) return
    const a = answer(q, data)
    setTurns((t) => [...t, { who: 'moi', text: q }, { who: 'aura', text: a.text, results: a.results }])
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    ask(draft)
    setDraft('')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Assistant Aura</h1>
        <p className="text-sm text-aura-700/80 mt-1">
          Recherche instantanée dans toutes les données de l'espace : posez une question ou utilisez un raccourci.
        </p>
      </div>

      <Card className="flex flex-col min-h-[60vh]">
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 pr-1" style={{ maxHeight: '58vh' }}>
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.who === 'moi' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  t.who === 'moi' ? 'bg-aura-800 text-white' : 'bg-aura-50 text-aura-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{t.text}</p>
                {t.results && t.results.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {t.results.map((r, j) => (
                      <div key={j} className="rounded-lg bg-white border border-aura-100 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block rounded-full bg-aura-100 text-aura-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            {KIND_LABELS[r.kind]}
                          </span>
                          {r.to ? (
                            r.external ? (
                              <a href={r.to} target="_blank" rel="noreferrer" className="text-sm font-semibold underline text-aura-900 truncate">
                                {r.title}
                              </a>
                            ) : (
                              <Link to={r.to} className="text-sm font-semibold underline text-aura-900 truncate">
                                {r.title}
                              </Link>
                            )
                          ) : (
                            <span className="text-sm font-semibold truncate">{r.title}</span>
                          )}
                        </div>
                        {r.subtitle && <p className="text-xs text-aura-700/80 mt-0.5">{r.subtitle}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-aura-100 pt-3 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {SHORTCUTS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-aura-200 bg-white px-3 py-1 text-xs font-semibold text-aura-800 hover:bg-aura-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="ex. Où est le cahier des charges ? Qui s'occupe du site web ?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!draft.trim()}>Demander</button>
          </form>
        </div>
      </Card>
    </div>
  )
}
