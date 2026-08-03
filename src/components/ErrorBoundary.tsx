import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Filet de dernier recours autour des pages.
 *
 * Sans lui, la moindre erreur de rendu vidait tout l'écran sans le moindre
 * message : la page « ne s'affichait pas », sans indice sur la cause.
 * Ici, le reste de l'application (menu compris) continue de fonctionner et
 * l'erreur est affichée.
 */
interface Props {
  children: ReactNode
  /** Change de valeur à la navigation : réarme le filet. */
  resetKey?: string
}

interface State {
  erreur: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erreur: null }

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur }
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error('Erreur de rendu :', erreur, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.erreur) {
      this.setState({ erreur: null })
    }
  }

  render() {
    if (!this.state.erreur) return this.props.children
    return (
      <div className="card max-w-xl mx-auto my-8">
        <h2 className="text-lg font-extrabold text-aura-950">Cette page n'a pas pu s'afficher</h2>
        <p className="text-sm text-aura-700/80 mt-2">
          Le reste de Planet'Desk fonctionne : utilisez le menu pour continuer. Si le problème
          persiste, transmettez le message ci-dessous.
        </p>
        <pre className="mt-3 rounded-lg bg-aura-50 p-3 text-[11px] text-aura-700 overflow-x-auto whitespace-pre-wrap break-words">
          {this.state.erreur.message}
        </pre>
        <button className="btn-secondary mt-3" onClick={() => this.setState({ erreur: null })}>
          Réessayer
        </button>
      </div>
    )
  }
}
