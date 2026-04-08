"use client"

import * as React from "react"

export type Theme = "light" | "dark" | "system"

type ThemeContextProps = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  colorScheme: Theme
  setColorScheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextProps | null>(null)
const STORAGE_KEY = "Flazz-theme"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(theme)
  root.style.colorScheme = theme
  root.dataset.colorScheme = theme
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.")
  }
  return context
}

export function ThemeProvider({
  defaultTheme = "system",
  children,
}: {
  defaultTheme?: Theme
  children: React.ReactNode
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
      return stored || defaultTheme
    } catch {
      return defaultTheme
    }
  })

  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(() =>
    theme === "system" ? getSystemTheme() : theme,
  )

  React.useEffect(() => {
    const nextResolved = theme === "system" ? getSystemTheme() : theme
    setResolvedTheme(nextResolved)
    applyTheme(nextResolved)
  }, [theme])

  React.useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const nextResolved = getSystemTheme()
      setResolvedTheme(nextResolved)
      applyTheme(nextResolved)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
    setThemeState(next)
  }, [])

  const value = React.useMemo<ThemeContextProps>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      colorScheme: theme,
      setColorScheme: setTheme,
    }),
    [resolvedTheme, setTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
