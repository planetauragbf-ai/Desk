import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build du site AUTONOME Planet'Stock (stock.html → dist-stock/),
// déployé sur son propre site Cloudflare Pages (planet-stock), séparé
// de Planet'Desk. La base visée est le projet Supabase « Stockage » :
// ses clés remplacent celles du Desk au moment du build.
//   STOCK_SUPABASE_URL      → https://xxxx.supabase.co
//   STOCK_SUPABASE_ANON_KEY → clé PUBLIABLE (jamais la clé secrète)
// Clés absentes → l'application démarre en mode local (localStorage).
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.STOCK_SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.STOCK_SUPABASE_ANON_KEY ?? ''),
  },
  build: {
    outDir: 'dist-stock',
    sourcemap: false,
    rollupOptions: { input: 'stock.html' },
  },
})
