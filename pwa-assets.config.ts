import { defineConfig } from '@vite-pwa/assets-generator/config'

// Iconos de la PWA generados a partir del isotipo, siempre sobre negro.
// Regenerar con: npm run icons
const onBlack = { background: '#000000', fit: 'contain' as const }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0.12, resizeOptions: onBlack },
    // Maskable: margen de seguridad amplio para que Android pueda recortar en círculo
    maskable: { sizes: [512], padding: 0.3, resizeOptions: onBlack },
    apple: { sizes: [180], padding: 0.18, resizeOptions: onBlack },
  },
  images: ['public/logo-isotipo.png'],
})
