/** Une clases de Tailwind ignorando valores vacíos */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
