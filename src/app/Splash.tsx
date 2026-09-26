/** Pantalla de carga inicial con el logotipo completo */
export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-brand-black" role="status" aria-label="Cargando Troko">
      <img src="/logo-troko-bloco.png" alt="Troko Bloco" className="w-56 max-w-[65%] animate-pulse" />
    </div>
  )
}
