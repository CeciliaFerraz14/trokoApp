import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { SectionTitle } from '@/components/ui/Card'
import { FormError } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import type { Instagram } from '@/types/database'
import { InstagramFields, instagramError, normalizeInstagram, useMyInstagram, useSaveInstagram } from './instagram'

export function PrivacyPage() {
  const instagram = useMyInstagram()
  return (
    <>
      <PageHeader title="Privacidad" back="/perfil" />
      <Page>
        {instagram.isPending ? (
          <Spinner />
        ) : instagram.isError ? (
          <ErrorState error={instagram.error} onRetry={() => instagram.refetch()} />
        ) : (
          <PrivacyForm instagram={instagram.data} />
        )}
      </Page>
    </>
  )
}

function PrivacyForm({ instagram }: { instagram: Pick<Instagram, 'username' | 'tag_consent'> | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveInstagram()
  const [username, setUsername] = useState(instagram?.username ?? '')
  const [consent, setConsent] = useState(instagram?.tag_consent ?? false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const igError = instagramError(username)
    if (igError) return setError(igError)
    const value = normalizeInstagram(username)
    try {
      await save.mutateAsync({ username: value, consent: !!value && consent })
    } catch (err) {
      return setError(errorMessage(err))
    }
    toast('Privacidad guardada')
    navigate('/perfil')
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section>
        <SectionTitle>Instagram</SectionTitle>
        <InstagramFields username={username} consent={consent} onUsername={setUsername} onConsent={setConsent} />
      </section>
      <p className="px-1 text-sm text-muted">Si borras tu usuario y guardas, dejará de estar en la app.</p>
      <FormError>{error}</FormError>
      <Button type="submit" block loading={save.isPending}>
        Guardar
      </Button>
    </form>
  )
}
