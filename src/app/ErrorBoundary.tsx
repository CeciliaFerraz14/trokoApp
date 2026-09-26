import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface State {
  error: Error | null
}

/**
 * Si una pantalla falla al pintarse, muestra un aviso con "Recargar" en lugar
 * de dejar la app en blanco. Cambiar `resetKey` (p. ej. la ruta) lo reinicia.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // Tras publicar una versión nueva, las pantallas que se cargan aparte pueden no encontrarse
    const outdated = /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(error.message)
    return (
      <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 grid size-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,var(--bg))] text-danger">
          <AlertTriangle className="size-8" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">{outdated ? 'Hay una versión nueva' : 'Algo ha fallado'}</h2>
        <p className="mt-2 max-w-xs text-muted">
          {outdated ? 'Recarga para usar la última versión de la app.' : 'Esta pantalla no se ha podido mostrar. Prueba a recargar la app.'}
        </p>
        <Button className="mt-6" onClick={() => location.reload()} icon={<RotateCw className="size-4" />}>
          Recargar
        </Button>
      </div>
    )
  }
}
