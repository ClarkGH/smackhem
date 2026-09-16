import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const platform = process.env.PLATFORM || 'web';
  
  return {
    root: 'src',
    publicDir: '../public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      open: true,
    },
    esbuild: {
      target: 'esnext',
    },
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    resolve: {
      alias: {
        '@platform': platform === 'web' 
          ? './platforms/web' 
          : './platforms/stub',
      },
    },
  };
});