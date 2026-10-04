import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Shirt } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import type { MerchOrder } from '@/types/database'
import { formatPrice, ORDER_STATUS, useMerchProducts, useMyOrders, useSetOrderStatus } from './api'

/** Catálogo de productos y mis pedidos */
export function MerchTab({ isAdmin }: { isAdmin: boolean }) {
  const products = useMerchProducts()
  if (products.isPending) return <SkeletonList count={4} className="h-52" />
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />

  return (
    <div className="space-y-6">
      {products.data.length === 0 ? (
        <EmptyState icon={<Shirt className="size-8" />} title="Todavía no hay productos">
          {isAdmin ? 'Pulsa + arriba para añadir el primero.' : 'Aquí estarán las camisetas y demás cosas de Troko Bloco.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {products.data.map((p) => (
            <li key={p.id}>
              <Link to={`/trokoteca/merch/${p.id}`} className="block h-full">
                <Card className="flex h-full flex-col overflow-hidden p-0! hover:border-brand-blue">
                  <div className="relative aspect-square bg-surface-2">
                    {p.thumbUrl ? (
                      <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Shirt className="absolute inset-0 m-auto size-10 text-muted" />
                    )}
                    {!p.available && (
                      <Badge tone="danger" className="absolute top-2 left-2 bg-bg">
                        Agotado
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 leading-snug font-semibold">{p.name}</p>
                    <p className="mt-auto pt-1 font-display text-lg font-bold text-accent">{formatPrice(p.price_cents)}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <MyOrders />
    </div>
  )
}

function MyOrders() {
  const orders = useMyOrders()
  const setStatus = useSetOrderStatus()
  const toast = useToast()
  if (!orders.data?.length) return null

  const cancel = (o: MerchOrder) => {
    if (!confirm(`¿Cancelar tu pedido de ${o.product_name}?`)) return
    setStatus.mutate({ id: o.id, status: 'cancelled' }, { onSuccess: () => toast('Pedido cancelado'), onError: (e) => toast(errorMessage(e), 'error') })
  }

  return (
    <section>
      <SectionTitle>Mis pedidos</SectionTitle>
      <ul className="space-y-2">
        {orders.data.map((o) => (
          <li key={o.id}>
            <Card className="space-y-1.5">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-semibold">
                  {o.quantity} × {o.product_name}
                  {o.size && <span className="text-muted"> · {o.size}</span>}
                </p>
                <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
              </div>
              <p className="text-sm text-muted">
                {formatPrice(o.unit_price_cents * o.quantity)} · {format(new Date(o.created_at), "d 'de' MMMM", { locale: es })}
              </p>
              {o.note && <p className="text-sm text-muted italic">«{o.note}»</p>}
              {o.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => cancel(o)}
                  disabled={setStatus.isPending}
                  className="min-h-10 text-sm font-semibold text-danger disabled:opacity-50"
                >
                  Cancelar pedido
                </button>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-sm text-muted">El pago y la entrega se acuerdan con Troko Bloco.</p>
    </section>
  )
}
