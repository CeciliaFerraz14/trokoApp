import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { usePendingUsers } from './api'
import { PendingTab } from './PendingTab'
import { PeopleTab } from './PeopleTab'
import { GroupsTab } from './GroupsTab'

type Tab = 'pendientes' | 'personas' | 'grupos'

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const pending = usePendingUsers()
  const tab = (params.get('tab') as Tab) || (pending.data?.length ? 'pendientes' : 'personas')

  return (
    <>
      <PageHeader title="Admin" subtitle="Cuentas, grupos y permisos" />
      <Page className="space-y-4">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'pendientes', label: 'Pendientes', count: pending.data?.length },
            { value: 'personas', label: 'Personas' },
            { value: 'grupos', label: 'Grupos' },
          ]}
        />
        {tab === 'pendientes' && <PendingTab />}
        {tab === 'personas' && <PeopleTab />}
        {tab === 'grupos' && <GroupsTab />}
      </Page>
    </>
  )
}
