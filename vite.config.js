import { defineConfig } from "vite";

export default defineConfig({
  base: "/fantastic-guacamole/",
  build: {
    target: "es2020",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
