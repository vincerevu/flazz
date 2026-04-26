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

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
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

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.add('app-ready')
    window.setTimeout(() => {
      document.getElementById('app-preload')?.remove()
    }, 460)
  })
})
