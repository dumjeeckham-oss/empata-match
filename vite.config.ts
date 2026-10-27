import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 서브도메인 사용을 위해 base를 루트(/)로 변경했습니다.
  base: '/', 
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/kpi-api": {
        target: "https://dongbaek-kpi-supervision-staging.dong100center.workers.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kpi-api/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    // The gzip-size report is diagnostic only and was exhausting the Windows build process
    // after chunk rendering. Bundle output itself is unchanged by disabling this report.
    reportCompressedSize: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react", 
      "react-dom", 
      "react-router-dom", 
      "react/jsx-runtime", 
      "react/jsx-dev-runtime", 
      "@tanstack/react-query", 
      "@tanstack/query-core"
    ],
  },
}));
