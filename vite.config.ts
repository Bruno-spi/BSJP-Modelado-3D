import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config de Vite + plugin React. Vitest comparte esta config.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
