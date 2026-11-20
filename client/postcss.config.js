import { fileURLToPath } from "node:url";

// Resolve Tailwind's config next to this file, not the shell's working
// directory, so the dev server styles correctly however it is launched
// (e.g. `npm --prefix client run dev` from the repo root).
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
