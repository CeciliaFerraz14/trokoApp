import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ClipboardList, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import type { MerchOrderStatus } from '@/types/database'
import { formatPrice, ORDER_STATUS, useAllOrders, useSetOrderStatus, type OrderWithPerson } from './api'

type Filter = MerchOrderStatus | 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'ready', label: 'Listos' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'all', label: 'Todos' },
]

/** Siguiente paso de un pedido para el botón principal */
const NEXT: Partial<Record<MerchOrderStatus, { status: MerchOrderStatus; label: string }>> = {
  pending: { status: 'ready', label: 'Marcar como listo' },
  ready: { status: 'delivered', label: 'Marcar como entregado' },
}

/** Pedidos de merchandising (solo admins) */
export function OrdersPage() {
  const { data: me } = useMe()
  const orders = useAllOrders({ enabled: !!me?.isAdmin })
  const [filter, setFilter] = useState<Filter>('pending')

  const list = useMemo(() => (orders.data ?? []).filter((o) => filter === 'all' || o.status === filter), [orders.data, filter])

  // Qué hay que preparar: unidades pendientes por producto y talla
  const toPrepare = useMemo(() => {
    const totals = new Map<string, number>()
    for (const o of orders.data ?? []) {
      if (o.status !== 'pending') continue
      const key = o.size ? `${o.product_name} · ${o.size}` : o.product_name
      totals.set(key, (totals.get(key) ?? 0) + o.quantity)
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [orders.data])

  const header = <PageHeader title="Pedidos" subtitle="Merchandising" back="/trokoteca?tab=merch" />
  if (!me) return <>{header}<Spinner /></>
  if (!me.isAdmin) {
    return (
      <>
        {header}
        <EmptyState icon={<ShieldCheck className="size-8" />} title="Solo para admins">
          Tus pedidos están en Trokoteca → Merch.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {header}
      <Page className="space-y-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => {
            const count = f.value === 'pending' ? (orders.data ?? []).filter((o) => o.status === 'pending').length : 0
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold',
                  filter === f.value ? 'border-transparent bg-fg text-bg' : 'border-line bg-bg text-muted',
                )}
              >
                {f.label}
                {count > 0 && <span className="rounded-full bg-brand-blue px-1.5 text-xs text-brand-black">{count}</span>}
              </button>
            )
          })}
        </div>

        {filter === 'pending' && toPrepare.length > 0 && (
          <Card>
            <SectionTitle className="px-0">Para preparar</SectionTitle>
            <ul className="space-y-1">
              {toPrepare.map(([what, units]) => (
                <li key={what} className="flex justify-between gap-3">
                  <span>{what}</span>
                  <span className="font-bold">× {units}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {orders.isPending ? (
          <SkeletonList count={4} />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-8" />} title="No hay pedidos">
            {filter === 'pending' ? 'No queda nada pendiente.' : 'No hay pedidos en este estado.'}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {list.map((o) => (
              <li key={o.id}>
                <OrderCard order={o} />
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  )
}

function OrderCard({ order: o }: { order: OrderWithPerson }) {
  const setStatus = useSetOrderStatus()
  const toast = useToast()
  const next = NEXT[o.status]
  const change = (status: MerchOrderStatus) =>
    setStatus.mutate(
      { id: o.id, status },
      { onSuccess: () => toast(`Pedido: ${ORDER_STATUS[status].label.toLowerCase()}`), onError: (e) => toast(errorMessage(e), 'error') },
    )

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar name={o.person?.full_name ?? '?'} url={o.person?.avatar_url ?? null} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{o.person ? displayName(o.person) : 'Cuenta borrada'}</p>
          <p className="text-xs text-muted">{format(new Date(o.created_at), "d 'de' MMMM, HH:mm", { locale: es })}</p>
        </div>
        <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
      </div>
      <div>
        <p className="font-semibold">
          {o.quantity} × {o.product_name}
          {o.size && <span className="text-muted"> · {o.size}</span>}
        </p>
        <p className="text-sm text-muted">{formatPrice(o.unit_price_cents * o.quantity)}</p>
        {o.note && <p className="mt-1 text-sm italic">«{o.note}»</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {next && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => change(next.status)}
            className="min-h-10 rounded-full bg-brand-blue px-4 text-sm font-bold text-brand-black disabled:opacity-50"
          >
            {next.label}
          </button>
        )}
        {o.status !== 'cancelled' && o.status !== 'delivered' && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => confirm('¿Cancelar este pedido?') && change('cancelled')}
            className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold text-danger disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
        {(o.status === 'cancelled' || o.status === 'delivered' || o.status === 'ready') && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => change('pending')}
            className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold text-muted disabled:opacity-50"
          >
            Volver a pendiente
          </button>
        )}
      </div>
    </Card>
  )
}
