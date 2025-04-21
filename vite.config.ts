import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
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
