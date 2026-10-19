import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:'./',plugins:[react(),tailwindcss(),{name:'development-csp',apply:'serve',transformIndexHtml:html=>html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/>/,'')}],test:{include:['tests/**/*.test.ts'],testTimeout:60000},build:{chunkSizeWarningLimit:1200}});
