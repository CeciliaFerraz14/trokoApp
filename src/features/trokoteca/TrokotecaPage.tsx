import { useSearchParams } from 'react-router'
import { ClipboardList, Plus } from 'lucide-react'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { useMe } from '@/features/auth/useMe'
import type { LibrarySection } from '@/types/database'
import { useAllOrders } from './api'
import { GuideList, MediaList } from './LibraryLists'
import { MerchTab } from './MerchTab'

type Tab = 'guias' | 'musica' | 'videos' | 'merch'

export const TAB_SECTION: Record<Exclude<Tab, 'merch'>, LibrarySection> = { guias: 'guide', musica: 'music', videos: 'video' }
export const SECTION_TAB: Record<LibrarySection, Tab> = { guide: 'guias', music: 'musica', video: 'videos' }

export function TrokotecaPage() {
  const [params, setParams] = useSearchParams()
  const { data: me } = useMe()
  const isAdmin = !!me?.isAdmin
  const orders = useAllOrders({ enabled: isAdmin })
  const pendingOrders = orders.data?.filter((o) => o.status === 'pending').length ?? 0
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && ['guias', 'musica', 'videos', 'merch'].includes(raw) ? raw : 'guias'

  const addTo = tab === 'merch' ? '/trokoteca/merch/nuevo' : `/trokoteca/nuevo?seccion=${TAB_SECTION[tab]}`
  const addLabel = { guias: 'Nueva guía', musica: 'Añadir música', videos: 'Añadir vídeo', merch: 'Nuevo producto' }[tab]

  return (
    <>
      <PageHeader
        title="Trokoteca"
        subtitle="Guías, música, vídeos y merch"
        actions={
          isAdmin && (
            <>
              {tab === 'merch' && (
                <HeaderLink to="/trokoteca/pedidos" label="Pedidos" className="relative">
                  <ClipboardList className="size-5" />
                  {pendingOrders > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-brand-black px-1 text-center text-[0.7rem] leading-5 font-bold text-white ring-2 ring-brand-blue">
                      {pendingOrders}
                    </span>
                  )}
                </HeaderLink>
              )}
              <HeaderLink to={addTo} label={addLabel}>
                <Plus className="size-6" />
              </HeaderLink>
            </>
          )
        }
      />
      <Page className="space-y-4">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'guias', label: 'Guías' },
            { value: 'musica', label: 'Música' },
            { value: 'videos', label: 'Vídeos' },
            { value: 'merch', label: 'Merch' },
          ]}
        />
        {tab === 'guias' && <GuideList isAdmin={isAdmin} />}
        {tab === 'musica' && <MediaList section="music" isAdmin={isAdmin} />}
        {tab === 'videos' && <MediaList section="video" isAdmin={isAdmin} />}
        {tab === 'merch' && <MerchTab isAdmin={isAdmin} />}
      </Page>
    </>
  )
}
