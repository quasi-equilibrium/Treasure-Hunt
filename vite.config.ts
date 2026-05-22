import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0"
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"]
  }
});
