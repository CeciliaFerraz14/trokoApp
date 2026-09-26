/** Se muestra si faltan las variables de entorno de Supabase */
export function SetupNeeded() {
  return (
    <div className="grid min-h-dvh place-items-center bg-brand-black p-6 text-white">
      <div className="max-w-sm text-center">
        <img src="/logo-isotipo.png" alt="" className="mx-auto mb-6 size-24" />
        <h1 className="font-display text-2xl font-bold">Falta configurar Supabase</h1>
        <p className="mt-3 text-white/70">
          Crea un archivo <code className="text-brand-blue">.env</code> a partir de{' '}
          <code className="text-brand-blue">.env.example</code> con <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>. En Vercel, añádelas en Settings → Environment Variables. Tienes los pasos
          en el README.
        </p>
      </div>
    </div>
  )
}
