import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로 기반으로 빌드해 GitHub Pages 같은 서브패스 배포에 안전
  base: './',
  plugins: [react()],
})
