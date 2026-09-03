import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const defaultRelay = (env.VITE_DEFAULT_RELAY || 'ws://localhost:3334').replace(/\/$/, '');
  const proxyTarget = defaultRelay
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      modulePreload: false,
    },
    plugins: [
      react(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      onConsoleLog(log) {
        return !log.includes("React Router Future Flag Warning");
      },
      env: {
        DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});