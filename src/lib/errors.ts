// Traduce los errores habituales de Supabase / red a mensajes en español.
const translations: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese email. Prueba a iniciar sesión.'],
  [/password should be at least (\d+)/i, 'La contraseña es demasiado corta (mínimo 8 caracteres).'],
  [/weak.?password/i, 'La contraseña es demasiado débil. Usa al menos 8 caracteres, con letras y números.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'Ese email no parece válido.'],
  [/email not confirmed/i, 'Tienes que confirmar tu email antes de entrar.'],
  [/signups not allowed|signup is disabled/i, 'El registro está desactivado ahora mismo.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
  [/failed to fetch|network ?error|load failed|fetch failed/i, 'Sin conexión. Revisa tu internet y vuelve a intentarlo.'],
  // Suscripción push rechazada por el navegador (va antes que "permission denied" genérico)
  [/registration failed|push service/i, 'Este navegador no permite activar las notificaciones. Prueba desde la app instalada en el móvil.'],
  [/row-level security|permission denied/i, 'No tienes permiso para hacer esto.'],
  [/duplicate key.*groups_name_key/i, 'Ya existe un grupo con ese nombre.'],
  [/JWT expired/i, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
]

export function errorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '')
  for (const [re, msg] of translations) if (re.test(raw)) return msg
  return raw || 'Ha ocurrido un error inesperado.'
}
