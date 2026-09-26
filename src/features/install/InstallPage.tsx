import { useState, type ReactNode } from 'react'
import { CheckCircle2, Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react'
import { isAndroid, isIOS, isIOSSafari, isStandalone } from '@/lib/platform'
import { useInstallPrompt } from '@/lib/installPrompt'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

type Platform = 'ios' | 'android'

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-blue font-display font-bold text-brand-black">{n}</span>
      <div className="pt-1">{children}</div>
    </li>
  )
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-0.5 font-semibold whitespace-nowrap">
    {children}
  </span>
)

export function InstallPage() {
  const [platform, setPlatform] = useState<Platform>(isAndroid ? 'android' : 'ios')
  const { canPrompt, prompt } = useInstallPrompt()

  return (
    <>
      <PageHeader title="Instalar la app" back />
      <Page className="space-y-5">
        {isStandalone() ? (
          <Card className="flex items-center gap-3 border-success/40">
            <CheckCircle2 className="size-6 shrink-0 text-success" />
            <p>¡Ya estás usando la app instalada! 🥁</p>
          </Card>
        ) : (
          <p className="text-muted">
            La app de Troko no está en App Store ni en Google Play: se instala directamente desde el navegador y
            ocupa casi nada.
          </p>
        )}

        <Tabs<Platform>
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'ios', label: 'iPhone / iPad' },
            { value: 'android', label: 'Android' },
          ]}
        />

        {platform === 'ios' ? (
          <Card>
            {isIOS && !isIOSSafari && (
              <p className="mb-4 rounded-xl bg-warning/15 p-3 text-sm text-warning">
                Abre esta página en <strong>Safari</strong> para poder instalarla.
              </p>
            )}
            <ol className="space-y-4">
              <Step n={1}>
                Abre la app en <strong>Safari</strong>.
              </Step>
              <Step n={2}>
                Toca el botón <Kbd><Share className="size-4" /> Compartir</Kbd> (abajo en iPhone, arriba en iPad).
              </Step>
              <Step n={3}>
                Baja y elige <Kbd><SquarePlus className="size-4" /> Añadir a pantalla de inicio</Kbd>.
              </Step>
              <Step n={4}>
                Toca <Kbd>Añadir</Kbd>. Abre Troko desde el icono nuevo e <strong>inicia sesión otra vez</strong>{' '}
                (la app instalada no comparte sesión con Safari).
              </Step>
            </ol>
          </Card>
        ) : (
          <Card>
            {canPrompt && (
              <Button block className="mb-5" icon={<Download className="size-5" />} onClick={() => prompt()}>
                Instalar ahora
              </Button>
            )}
            <ol className="space-y-4">
              <Step n={1}>
                Abre la app en <strong>Chrome</strong>.
              </Step>
              <Step n={2}>
                Toca el menú <Kbd><EllipsisVertical className="size-4" /></Kbd> arriba a la derecha.
              </Step>
              <Step n={3}>
                Elige <Kbd>Instalar app</Kbd> o <Kbd>Añadir a pantalla de inicio</Kbd>.
              </Step>
              <Step n={4}>Confirma y abre Troko desde el icono nuevo.</Step>
            </ol>
          </Card>
        )}
      </Page>
    </>
  )
}
