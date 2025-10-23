import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages와 같은 서브경로 배포를 위한 상대 base 경로
  base: "./",
  plugins: [react()],
});
