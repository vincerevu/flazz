import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'
import { PostHogProvider } from 'posthog-js/react'
import { ThemeProvider } from '@/contexts/theme-context'

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-11-30',
} as const

const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {apiKey ? (
      <PostHogProvider apiKey={apiKey} options={options}>
        <ThemeProvider defaultTheme="system">
          <App />
        </ThemeProvider>
      </PostHogProvider>
    ) : (
      <ThemeProvider defaultTheme="system">
        <App />
      </ThemeProvider>
    )}
  </StrictMode>,
)
