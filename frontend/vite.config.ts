import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: mode === 'production' ? 'production' : 'development',
    }),
  },
  plugins: [react(), tailwindcss()],
}))
