"use client"

import * as React from "react"

import { DEFAULT_THEMES } from "@/opencode-theme/default-themes"
import { resolveThemeVariant, themeToCss } from "@/opencode-theme/resolve"
import type { DesktopTheme } from "@/opencode-theme/types"

export type Theme = "light" | "dark" | "system"
export type ColorScheme = Theme

type ThemeContextProps = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  colorScheme: Theme
  setColorScheme: (theme: Theme) => void
  previewColorScheme: (theme: Theme) => void
  themeId: string
  setThemeId: (id: string) => void
  previewTheme: (id: string) => void
  cancelPreview: () => void
  themeIds: string[]
  getThemeName: (id: string) => string
  uiFont: string
  setUIFont: (font: string) => void
  codeFont: string
  setCodeFont: (font: string) => void
}

const ThemeContext = React.createContext<ThemeContextProps | null>(null)

const STORAGE_KEYS = {
  COLOR_SCHEME: "Flazz-theme",
  THEME_ID: "Flazz-theme-id",
  UI_FONT: "Flazz-ui-font",
  CODE_FONT: "Flazz-code-font",
} as const

const THEME_STYLE_ID = "flazz-opencode-theme"

const THEME_NAMES: Record<string, string> = {
  "oc-2": "OC-2",
  amoled: "AMOLED",
  aura: "Aura",
  ayu: "Ayu",
  carbonfox: "Carbonfox",
  catppuccin: "Catppuccin",
  "catppuccin-frappe": "Catppuccin Frappe",
  "catppuccin-macchiato": "Catppuccin Macchiato",
  cobalt2: "Cobalt2",
  cursor: "Cursor",
  dracula: "Dracula",
  everforest: "Everforest",
  flexoki: "Flexoki",
  github: "GitHub",
  gruvbox: "Gruvbox",
  kanagawa: "Kanagawa",
  "lucent-orng": "Lucent Orng",
  material: "Material",
  matrix: "Matrix",
  mercury: "Mercury",
  monokai: "Monokai",
  nightowl: "Night Owl",
  nord: "Nord",
  "one-dark": "One Dark",
  onedarkpro: "One Dark Pro",
  opencode: "OpenCode",
  orng: "Orng",
  "osaka-jade": "Osaka Jade",
  palenight: "Palenight",
  rosepine: "Rose Pine",
  shadesofpurple: "Shades of Purple",
  solarized: "Solarized",
  synthwave84: "Synthwave '84",
  tokyonight: "Tokyonight",
  vercel: "Vercel",
  vesper: "Vesper",
  zenburn: "Zenburn",
}

const defaultSansBase = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const defaultMonoBase =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

function normalizeThemeId(id: string | null | undefined) {
  if (!id) return "vercel"
  return id === "oc-1" ? "oc-2" : id
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStorage(key: string) {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function ensureThemeStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (existing) return existing
  const element = document.createElement("style")
  element.id = THEME_STYLE_ID
  document.head.appendChild(element)
  return element
}

function quoteFontFamily(value: string) {
  if (/^[\w-]+$/.test(value)) return value
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function withFontFallback(value: string, fallback: string) {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return `${quoteFontFamily(trimmed)}, ${fallback}`
}

function applyTheme(theme: DesktopTheme, themeId: string, mode: "light" | "dark") {
  const tokens = resolveThemeVariant(mode === "dark" ? theme.dark : theme.light, mode === "dark")
  const css = themeToCss(tokens)
  const fullCss = `:root {
  color-scheme: ${mode};
  --text-mix-blend-mode: ${mode === "dark" ? "plus-lighter" : "multiply"};
  ${css}
}`

  ensureThemeStyleElement().textContent = fullCss
  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(mode)
}

function applyFonts(uiFont: string, codeFont: string) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.style.setProperty("--font-family-sans", withFontFallback(uiFont, defaultSansBase))
  root.style.setProperty("--font-family-mono", withFontFallback(codeFont, defaultMonoBase))
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
  const themeIds = React.useMemo(() => Object.keys(DEFAULT_THEMES), [])
  const [colorScheme, setColorSchemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const stored = readStorage(STORAGE_KEYS.COLOR_SCHEME) as Theme | null
    return stored || defaultTheme
  })
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(() =>
    colorScheme === "system" ? getSystemTheme() : colorScheme,
  )
  const [themeId, setThemeIdState] = React.useState<string>(() => {
    if (typeof window === "undefined") return "vercel"
    return normalizeThemeId(readStorage(STORAGE_KEYS.THEME_ID))
  })
  const [uiFont, setUIFontState] = React.useState(() => readStorage(STORAGE_KEYS.UI_FONT) ?? "")
  const [codeFont, setCodeFontState] = React.useState(() => readStorage(STORAGE_KEYS.CODE_FONT) ?? "")
  const [previewColorSchemeState, setPreviewColorSchemeState] = React.useState<Theme | null>(null)
  const [previewThemeId, setPreviewThemeId] = React.useState<string | null>(null)

  const activeColorScheme = previewColorSchemeState ?? colorScheme
  const activeThemeId = previewThemeId ?? themeId

  React.useEffect(() => {
    const nextResolved = activeColorScheme === "system" ? getSystemTheme() : activeColorScheme
    setResolvedTheme(nextResolved)

    const selectedTheme = DEFAULT_THEMES[activeThemeId] ?? DEFAULT_THEMES.vercel
    applyTheme(selectedTheme, activeThemeId, nextResolved)
  }, [activeColorScheme, activeThemeId])

  React.useEffect(() => {
    applyFonts(uiFont, codeFont)
  }, [uiFont, codeFont])

  React.useEffect(() => {
    if (activeColorScheme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const nextResolved = getSystemTheme()
      setResolvedTheme(nextResolved)
      const selectedTheme = DEFAULT_THEMES[activeThemeId] ?? DEFAULT_THEMES.vercel
      applyTheme(selectedTheme, activeThemeId, nextResolved)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [activeColorScheme, activeThemeId])

  const setColorScheme = React.useCallback((next: Theme) => {
    writeStorage(STORAGE_KEYS.COLOR_SCHEME, next)
    setColorSchemeState(next)
  }, [])

  const previewColorScheme = React.useCallback((next: Theme) => {
    setPreviewColorSchemeState(next)
  }, [])

  const setThemeId = React.useCallback((nextId: string) => {
    const normalized = normalizeThemeId(nextId)
    if (!DEFAULT_THEMES[normalized]) return
    writeStorage(STORAGE_KEYS.THEME_ID, normalized)
    setThemeIdState(normalized)
  }, [])

  const previewTheme = React.useCallback((nextId: string) => {
    const normalized = normalizeThemeId(nextId)
    if (!DEFAULT_THEMES[normalized]) return
    setPreviewThemeId(normalized)
  }, [])

  const cancelPreview = React.useCallback(() => {
    setPreviewColorSchemeState(null)
    setPreviewThemeId(null)
  }, [])

  const setUIFont = React.useCallback((font: string) => {
    writeStorage(STORAGE_KEYS.UI_FONT, font)
    setUIFontState(font)
  }, [])

  const setCodeFont = React.useCallback((font: string) => {
    writeStorage(STORAGE_KEYS.CODE_FONT, font)
    setCodeFontState(font)
  }, [])

  const getThemeName = React.useCallback(
    (id: string) => DEFAULT_THEMES[id]?.name ?? THEME_NAMES[id] ?? id,
    [],
  )

  const contextValue = React.useMemo<ThemeContextProps>(
    () => ({
      theme: colorScheme,
      resolvedTheme,
      setTheme: setColorScheme,
      colorScheme,
      setColorScheme,
      previewColorScheme,
      themeId,
      setThemeId,
      previewTheme,
      cancelPreview,
      themeIds,
      getThemeName,
      uiFont,
      setUIFont,
      codeFont,
      setCodeFont,
    }),
    [
      cancelPreview,
      codeFont,
      colorScheme,
      getThemeName,
      previewColorScheme,
      previewTheme,
      resolvedTheme,
      setCodeFont,
      setColorScheme,
      setThemeId,
      setUIFont,
      themeId,
      themeIds,
      uiFont,
    ],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}
