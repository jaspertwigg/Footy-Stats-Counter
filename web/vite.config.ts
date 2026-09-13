import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxies to the Firebase Hosting emulator, which applies the rewrites
    // in firebase.json (so /api/** reaches the Functions emulator). Run
    // `npm run emulate` (from the repo root) alongside this dev server.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
