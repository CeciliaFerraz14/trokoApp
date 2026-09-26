import { CalendarSync, Copy, RefreshCw } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { isAndroid, isIOS } from '@/lib/platform'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { icsUrl, useCalendarToken, useRegenerateCalendarToken } from './api'

/** Suscribirse al calendario de Troko desde el calendario del móvil (.ics) */
export function SubscribePage() {
  const token = useCalendarToken()
  const regenerate = useRegenerateCalendarToken()
  const toast = useToast()

  if (token.isPending) return <><PageHeader title="Calendario en el móvil" back /><Spinner /></>
  if (token.isError) return <><PageHeader title="Calendario en el móvil" back /><ErrorState error={token.error} onRetry={() => token.refetch()} /></>

  const https = icsUrl(token.data)
  const webcal = https.replace(/^https?:/, 'webcal:')
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      toast('Enlace copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  const apple = (
    <a href={webcal} className="block">
      <Button block icon={<CalendarSync className="size-4" />} tabIndex={-1}>
        Añadir al Calendario de Apple
      </Button>
    </a>
  )
  const googleBtn = (
    <a href={google} target="_blank" rel="noopener noreferrer" className="block">
      <Button block variant={isIOS ? 'secondary' : 'primary'} icon={<CalendarSync className="size-4" />} tabIndex={-1}>
        Añadir a Google Calendar
      </Button>
    </a>
  )

  return (
    <>
      <PageHeader title="Calendario en el móvil" back />
      <Page className="space-y-6">
        <p className="text-muted">
          Suscríbete una vez y los eventos de Troko aparecerán solos en el calendario de tu móvil, junto a los tuyos. Si se cambia o
          cancela algo, se actualiza sin hacer nada.
        </p>

        <div className="space-y-3">
          {isAndroid ? (
            <>
              {googleBtn}
              {apple}
            </>
          ) : (
            <>
              {apple}
              {googleBtn}
            </>
          )}
          <Button variant="secondary" block onClick={copy} icon={<Copy className="size-4" />}>
            Copiar enlace
          </Button>
        </div>

        <section>
          <SectionTitle>Cómo funciona</SectionTitle>
          <Card className="space-y-2 text-sm text-muted">
            <p>
              <strong className="text-fg">iPhone:</strong> pulsa «Añadir al Calendario de Apple» y confirma con «Suscribirse».
            </p>
            <p>
              <strong className="text-fg">Android / Google:</strong> pulsa «Añadir a Google Calendar» y confirma con «Añadir». Si no
              funciona, en calendar.google.com ve a <em>Otros calendarios → + → Desde URL</em> y pega el enlace copiado.
            </p>
            <p>Google puede tardar unas horas en mostrar los cambios; el Calendario de Apple, alrededor de una hora.</p>
            <p>Solo es de lectura: tu asistencia y tus notas se gestionan en la app.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Privacidad</SectionTitle>
          <Card className="space-y-3 text-sm text-muted">
            <p>El enlace es personal: quien lo tenga puede ver los eventos de tus grupos. No lo compartas.</p>
            <Button
              variant="ghost"
              block
              loading={regenerate.isPending}
              icon={<RefreshCw className="size-4" />}
              onClick={() =>
                confirm('¿Crear un enlace nuevo? El anterior dejará de funcionar y tendrás que volver a suscribirte.') &&
                regenerate.mutate(undefined, { onSuccess: () => toast('Enlace nuevo creado'), onError: (e) => toast(errorMessage(e), 'error') })
              }
            >
              Crear un enlace nuevo
            </Button>
          </Card>
        </section>
      </Page>
    </>
  )
}
