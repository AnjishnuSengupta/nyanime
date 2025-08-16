import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'https://nyanime-backend.vercel.app',
        changeOrigin: true,
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    },
  },
  build: {
    outDir: "dist", // Explicitly set build output directory
    chunkSizeWarningLimit: 1000, // Optional: Adjust chunk size warning
  },
  plugins: [
    react(),
                                           mode === 'development' && componentTagger(),
  ].filter(Boolean),
                                           resolve: {
                                             alias: {
                                               "@": path.resolve(__dirname, "./src"),
                                             },
                                           },
}));
