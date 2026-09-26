import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { usePendingUsers } from './api'
import { PendingTab } from './PendingTab'
import { PeopleTab } from './PeopleTab'
import { GroupsTab } from './GroupsTab'
import { SummaryTab } from './SummaryTab'

type Tab = 'resumen' | 'pendientes' | 'personas' | 'grupos'

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const pending = usePendingUsers()
  const tab = (params.get('tab') as Tab) || (pending.data?.length ? 'pendientes' : 'resumen')

  return (
    <>
      <PageHeader title="Admin" subtitle="Cuentas, grupos y permisos" />
      <Page className="space-y-4">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'pendientes', label: 'Pendientes', count: pending.data?.length },
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
