import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { useJoinRequests, usePendingUsers } from './api'
import { PendingTab } from './PendingTab'
import { PeopleTab } from './PeopleTab'
import { GroupsTab } from './GroupsTab'
import { SummaryTab } from './SummaryTab'

type Tab = 'resumen' | 'pendientes' | 'personas' | 'grupos'

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const pending = usePendingUsers()
  const requests = useJoinRequests()
  const pendingCount = (pending.data?.length ?? 0) + (requests.data?.length ?? 0)
  const tab = (params.get('tab') as Tab) || (pendingCount ? 'pendientes' : 'resumen')

  // Fijar la pestaña elegida al abrir: si no, al resolver lo último pendiente
  // la página saltaría sola a Resumen en vez de mostrar "Todo al día"
  const loaded = !pending.isPending && !requests.isPending
  useEffect(() => {
    if (loaded && !params.get('tab')) setParams({ tab }, { replace: true })
  }, [loaded, params, setParams, tab])

  return (
    <>
      <PageHeader title="Admin" subtitle="Cuentas, grupos y permisos" />
      <Page className="space-y-4">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'pendientes', label: 'Pendientes', count: pendingCount },
            { value: 'personas', label: 'Personas' },
            { value: 'grupos', label: 'Grupos' },
          ]}
        />
        {tab === 'resumen' && <SummaryTab />}
        {tab === 'pendientes' && <PendingTab />}
        {tab === 'personas' && <PeopleTab />}
        {tab === 'grupos' && <GroupsTab />}
      </Page>
    </>
  )
}
