import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change base to '/your-repo-name/' if deploying to a GitHub Project page
// Leave as './' for a User/Org page (username.github.io)
export default defineConfig({
  plugins: [react()],
  base: './',
})
