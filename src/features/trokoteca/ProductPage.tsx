import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, Minus, Pencil, Plus, Shirt } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea } from '@/components/ui/Field'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { formatPrice, useMerchProduct, usePlaceOrder } from './api'

const MAX_QTY = 20

/** Ficha de un producto y formulario para pedirlo */
export function ProductPage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const product = useMerchProduct(id)
  const order = usePlaceOrder()
  const navigate = useNavigate()
  const toast = useToast()
  const [size, setSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const back = '/trokoteca?tab=merch'
  if (product.isPending) return <><PageHeader title="Producto" back={back} /><Spinner /></>
  if (product.isError) return <><PageHeader title="Producto" back={back} /><ErrorState error={product.error} onRetry={() => product.refetch()} /></>
  const p = product.data
  if (!p) {
    return (
      <>
        <PageHeader title="Producto" back={back} />
        <EmptyState icon={<Shirt className="size-8" />} title="No encontrado">
          Este producto ya no existe.
        </EmptyState>
      </>
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!p) return
    if (p.sizes.length && !size) return setError('Elige una talla.')
    order.mutate(
      { product_id: p.id, size: p.sizes.length ? size : null, quantity, note: note.trim() },
      {
        onSuccess: () => {
          toast('Pedido hecho')
          navigate(back, { replace: true })
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <>
      <PageHeader
        title={p.name}
        back={back}
        actions={
          me?.isAdmin && (
            <HeaderLink to={`/trokoteca/merch/${p.id}/editar`} label="Editar producto">
              <Pencil className="size-5" />
            </HeaderLink>
          )
        }
      />
      <Page className="space-y-5">
        <div className="overflow-hidden rounded-[1.4rem] bg-surface-2">
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} className="max-h-[60vh] w-full object-contain" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center">
              <Shirt className="size-16 text-muted" />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl leading-tight font-bold">{p.name}</h2>
          <p className="mt-1 font-display text-2xl font-bold text-accent">{formatPrice(p.price_cents)}</p>
          {p.description && <p className="mt-3 whitespace-pre-wrap text-muted">{p.description}</p>}
        </div>

        {!p.available ? (
          <Badge tone="danger" className="text-sm">
            Agotado: ahora no se puede pedir
          </Badge>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            {p.sizes.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-muted">Talla</legend>
                <div className="flex flex-wrap gap-2">
                  {p.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={size === s}
                      onClick={() => {
                        setSize(s)
                        setError(null)
                      }}
                      className={cn(
                        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-4 font-bold',
                        size === s ? 'border-brand-blue bg-brand-blue text-brand-black' : 'border-line bg-surface-2',
                      )}
                    >
                      {size === s && <Check className="size-4" />}
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-muted">Cantidad</p>
              <div className="flex items-center gap-4">
                <Button type="button" variant="secondary" aria-label="Menos" className="size-11 px-0!" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
                  <Minus className="size-5" />
                </Button>
                <span className="w-8 text-center font-display text-2xl font-bold" aria-live="polite">
                  {quantity}
                </span>
                <Button type="button" variant="secondary" aria-label="Más" className="size-11 px-0!" disabled={quantity >= MAX_QTY} onClick={() => setQuantity((q) => q + 1)}>
                  <Plus className="size-5" />
                </Button>
                <span className="ml-auto font-display text-xl font-bold">{formatPrice(p.price_cents * quantity)}</span>
              </div>
            </div>

            <TextArea
              label="Nota (opcional)"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Por ejemplo: es para mi hija"
            />

            <FormError>{error}</FormError>
            <Button type="submit" block loading={order.isPending} className="min-h-14 text-lg">
              Hacer pedido
            </Button>
            <p className="text-center text-sm text-muted">No se paga en la app: el pago y la entrega se acuerdan con Troko Bloco.</p>
          </form>
        )}
      </Page>
    </>
  )
}
