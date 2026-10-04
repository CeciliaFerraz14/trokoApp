import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Camera, PackageCheck, ShieldCheck, Shirt, Trash2, X } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { useDeleteProduct, useMerchProduct, useSaveProduct } from './api'

/** "12,50" o "12.5" → 1250 céntimos; null si no es un precio */
function parsePrice(value: string) {
  const m = value.trim().replace('€', '').trim().match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
}

/** Crear o editar un producto (solo admins) */
export function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { data: me } = useMe()
  const existing = useMerchProduct(id)
  const save = useSaveProduct()
  const remove = useDeleteProduct()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [sizes, setSizes] = useState('')
  const [available, setAvailable] = useState(true)
  const [photo, setPhoto] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const loaded = existing.data
  useEffect(() => {
    if (!loaded) return
    setName(loaded.name)
    setPrice((loaded.price_cents / 100).toFixed(loaded.price_cents % 100 ? 2 : 0).replace('.', ','))
    setDescription(loaded.description)
    setSizes(loaded.sizes.join(', '))
    setAvailable(loaded.available)
    // Solo al llegar: no pisar lo que se esté escribiendo si se recarga
  }, [loaded?.id])

  const header = <PageHeader title={isNew ? 'Nuevo producto' : 'Editar producto'} back />
  if (!me) return <>{header}<Spinner /></>
  if (!me.isAdmin) {
    return (
      <>
        {header}
        <EmptyState icon={<ShieldCheck className="size-8" />} title="No puedes hacer esto">
          Solo los admins pueden gestionar el merchandising.
        </EmptyState>
      </>
    )
  }
  if (!isNew && existing.isPending) return <>{header}<Spinner /></>
  if (!isNew && existing.isError) return <>{header}<ErrorState error={existing.error} onRetry={() => existing.refetch()} /></>
  if (!isNew && !existing.data) return <>{header}<EmptyState title="No encontrado">Este producto ya no existe.</EmptyState></>

  const shownPhoto = preview ?? (!removePhoto ? existing.data?.thumbUrl : null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Ponle un nombre.')
    const priceCents = parsePrice(price)
    if (priceCents === null) return setError('Escribe el precio en euros, por ejemplo 12 o 12,50.')
    const sizeList = sizes.split(',').map((s) => s.trim()).filter(Boolean)
    if (sizeList.some((s) => s.length > 20)) return setError('Cada talla puede tener como mucho 20 letras.')
    save.mutate(
      { id, name: name.trim(), description: description.trim(), price_cents: priceCents, sizes: sizeList, available, photo, removePhoto },
      {
        onSuccess: (p) => {
          toast(isNew ? 'Producto creado' : 'Cambios guardados')
          navigate(`/trokoteca/merch/${p.id}`, { replace: true })
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  const onDelete = () => {
    if (!existing.data || !confirm(`¿Borrar «${existing.data.name}»? Los pedidos que ya se hicieron se mantienen.`)) return
    remove.mutate(existing.data, {
      onSuccess: () => {
        toast('Producto borrado')
        navigate('/trokoteca?tab=merch', { replace: true })
      },
      onError: (err) => toast(errorMessage(err), 'error'),
    })
  }

  return (
    <>
      {header}
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">Foto</p>
            <div className="relative overflow-hidden rounded-[1.4rem] bg-surface-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="block w-full" aria-label={shownPhoto ? 'Cambiar foto' : 'Añadir foto'}>
                {shownPhoto ? (
                  <img src={shownPhoto} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="grid aspect-[4/3] place-items-center text-muted">
                    <span className="flex flex-col items-center gap-2">
                      <Camera className="size-8" />
                      Añadir foto
                    </span>
                  </span>
                )}
              </button>
              {shownPhoto && (
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={() => (photo ? setPhoto(null) : setRemovePhoto(true))}
                  className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-black/70 text-white"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file?.type.startsWith('image/')) {
                  setPhoto(file)
                  setRemovePhoto(false)
                }
                e.target.value = ''
              }}
            />
          </div>

          <TextField label="Nombre" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Camiseta Troko Bloco" />
          <TextField
            label="Precio (€)"
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="15"
          />
          <TextArea label="Descripción (opcional)" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextField
            label="Tallas o modelos (opcional)"
            value={sizes}
            onChange={(e) => setSizes(e.target.value)}
            placeholder="S, M, L, XL"
            hint="Separados por comas. Si lo dejas vacío, es talla única."
          />
          <Switch
            label="Disponible"
            hint="Si lo desactivas, se verá como agotado y no se podrá pedir."
            icon={<PackageCheck className="size-5" />}
            checked={available}
            onChange={setAvailable}
          />

          <FormError>{error}</FormError>
          <Button type="submit" block loading={save.isPending} icon={isNew ? <Shirt className="size-4" /> : undefined}>
            {isNew ? 'Crear producto' : 'Guardar cambios'}
          </Button>
          {!isNew && (
            <Button type="button" variant="danger" block icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={onDelete}>
              Borrar producto
            </Button>
          )}
        </form>
      </Page>
    </>
  )
}
