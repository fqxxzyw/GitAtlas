import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:'./',plugins:[react(),tailwindcss()],test:{include:['tests/**/*.test.ts'],testTimeout:60000},build:{chunkSizeWarningLimit:1200}});
