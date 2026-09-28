import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 3000,
      open: true,
      allowedHosts: [
      "discount-cauterize-disbelief.ngrok-free.dev",
    ],
    },
    build: {
      outDir: 'build',
    },
    define: {
      'process.env.REACT_APP_API_URL': JSON.stringify(
        env.VITE_API_URL || env.REACT_APP_API_URL || 'http://localhost:5000/api'
      ),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
  };
});
