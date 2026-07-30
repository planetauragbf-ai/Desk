import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { formatDate, profileName } from '../lib/format'
import { insert, remove, update } from '../lib/data'
import type { WorkflowStep, WorkflowTemplate } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

export default function Workflows() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const showNew = params.get('nouveau') === '1'
  const [selected, setSelected] = useState<string | null>(null)

  const { rows: templates, refresh: refreshTemplates } = useTable('workflow_templates', undefined, { column: 'name', ascending: true })
  const { rows: steps, refresh: refreshSteps } = useTable('workflow_steps', undefined, { column: 'position', ascending: true })
  const { rows: actions, refresh: refreshActions } = useTable('workflow_actions', undefined, { column: 'position', ascending: true })
  const { rows: profiles } = useTable('profiles')

  const current = templates.find((t) => t.id === selected)

  async function createTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const now = new Date().toISOString()
    const t = await insert('workflow_templates', {
      name: String(fd.get('name')),
      description: String(fd.get('description') ?? ''),
      owner_id: profile?.id ?? null,
      status: 'a_utiliser',
      created_at: now,
      updated_at: now,
    } as Partial<WorkflowTemplate>)
    setParams({})
    refreshTemplates()
    setSelected(t.id)
  }

  async function addStep(templateId: string) {
    const title = prompt('Titre de la nouvelle étape :')
    if (!title) return
    const position = steps.filter((s) => s.template_id === templateId).length + 1
    await insert('workflow_steps', { template_id: templateId, position, title } as Partial<WorkflowStep>)
    refreshSteps()
  }

  async function addAction(stepId: string) {
    const title = prompt("Libellé de l'action :")
    if (!title) return
    const position = actions.filter((a) => a.step_id === stepId).length + 1
    await insert('workflow_actions', { step_id: stepId, position, title })
    refreshActions()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Base de workflows</h1>
        <button className="btn-primary" onClick={() => setParams({ nouveau: '1' })}>+ Ajouter un workflow</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          {templates.length === 0 ? (
            <EmptyState>
              Aucun workflow. Capitalisez vos processus (organisation d'événement, onboarding, campagne…)
              pour les rejouer sur chaque objectif.
            </EmptyState>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Workflow</th>
                  <th className="table-head">Référent</th>
                  <th className="table-head">Modification</th>
                  <th className="table-head">Statut</th>
                  <th className="table-head rounded-r-lg w-10"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className={`cursor-pointer hover:bg-aura-50/60 ${selected === t.id ? 'bg-aura-50' : ''}`}
                    onClick={() => setSelected(t.id)}
                  >
                    <td className="table-cell font-medium">{t.name}</td>
                    <td className="table-cell whitespace-nowrap">{profileName(profiles, t.owner_id)}</td>
                    <td className="table-cell whitespace-nowrap">{formatDate(t.updated_at)}</td>
                    <td className="table-cell">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.status === 'utilisee' ? 'bg-emerald-100 text-emerald-800' : 'bg-aura-100 text-aura-800'}`}>
                        {t.status === 'utilisee' ? 'Utilisée' : 'À utiliser'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <button
                        className="text-aura-700/60 hover:text-coral-600"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`Supprimer le workflow « ${t.name} » ?`)) return
                          await remove('workflow_templates', t.id)
                          if (selected === t.id) setSelected(null)
                          refreshTemplates()
                        }}
                        aria-label="Supprimer"
                      >🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title={current ? current.name : 'Détail du workflow'}
          action={current && (
            <button className="text-xs text-aura-700 underline" onClick={() => addStep(current.id)}>+ Ajouter une étape</button>
          )}
        >
          {!current ? (
            <EmptyState>Sélectionnez un workflow pour voir ses étapes et actions.</EmptyState>
          ) : (
            <div className="space-y-4">
              {current.description && <p className="text-sm text-aura-700/80">{current.description}</p>}
              {steps.filter((s) => s.template_id === current.id).map((step) => (
                <div key={step.id} className="rounded-lg border border-aura-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">
                      <span className="inline-block rounded bg-aura-800 text-white text-[10px] px-1.5 py-0.5 mr-2">Étape {step.position}</span>
                      {step.title}
                    </h3>
                    <div className="flex gap-2">
                      <button className="text-xs text-aura-700 underline" onClick={() => addAction(step.id)}>+ action</button>
                      <button
                        className="text-xs text-coral-600 underline"
                        onClick={async () => {
                          if (!confirm(`Supprimer l'étape « ${step.title} » et ses actions ?`)) return
                          for (const a of actions.filter((a) => a.step_id === step.id)) await remove('workflow_actions', a.id)
                          await remove('workflow_steps', step.id)
                          refreshSteps(); refreshActions()
                        }}
                      >supprimer</button>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {actions.filter((a) => a.step_id === step.id).map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm rounded bg-aura-50 px-3 py-1.5">
                        {a.title}
                        <button
                          className="text-aura-700/50 hover:text-coral-600 text-xs"
                          onClick={async () => { await remove('workflow_actions', a.id); refreshActions() }}
                          aria-label="Supprimer l'action"
                        >×</button>
                      </li>
                    ))}
                    {actions.filter((a) => a.step_id === step.id).length === 0 && (
                      <li className="text-xs text-aura-700/50">Aucune action.</li>
                    )}
                  </ul>
                </div>
              ))}
              {steps.filter((s) => s.template_id === current.id).length === 0 && (
                <EmptyState>Ajoutez des étapes, puis des actions dans chaque étape.</EmptyState>
              )}
              <p className="text-xs text-aura-700/60">
                Pour utiliser ce workflow : ouvrez un objectif → onglet « Plan d'actions » → « Importer un workflow ».
              </p>
            </div>
          )}
        </Card>
      </div>

      {showNew && (
        <Modal title="Ajouter un workflow" onClose={() => setParams({})}>
          <form onSubmit={createTemplate} className="space-y-3">
            <div>
              <label className="label">Nom *</label>
              <input name="name" className="input" required placeholder="Ex. : Organisation d'un événement" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea name="description" className="input" rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setParams({})}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
