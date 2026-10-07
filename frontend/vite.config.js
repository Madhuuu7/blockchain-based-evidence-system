import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
    // Vitest treats a run with no matching files as a failure, which is the
    // right default - it means the suite silently stopped being run.
    passWithNoTests: false
  }
});
