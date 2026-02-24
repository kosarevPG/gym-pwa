import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Меняем index.html при каждой сборке, чтобы браузер не отдавал старую версию из кэша
    {
      name: 'html-build-id',
      transformIndexHtml(html) {
        return html.replace(
          '<meta http-equiv="Cache-Control" content="no-cache" />',
          `<meta http-equiv="Cache-Control" content="no-cache" /><meta name="build-id" content="${Date.now()}" />`
        );
      },
    },
  ],
  base: '/gym-pwa/', // путь репозитория на GitHub Pages
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})