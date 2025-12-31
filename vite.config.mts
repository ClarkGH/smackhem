import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
  esbuild: {
    target: 'es2020'
  },
  define: {
    __PLATFORM__ : JSON.stringify(process.env.VARIABLE_NAME),
  }

});