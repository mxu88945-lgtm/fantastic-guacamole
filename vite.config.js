import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE || "/fantastic-guacamole/",
  build: {
    target: "es2020",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
