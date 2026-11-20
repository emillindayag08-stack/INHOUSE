import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // IPv4 loopback: "localhost" alone can bind only to ::1, which some
    // browsers can't reach — and the API's CORS origin is localhost:5173.
    host: "127.0.0.1",
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
