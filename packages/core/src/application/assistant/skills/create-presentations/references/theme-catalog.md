# Presentation Theme Catalog

This catalog ports the useful theme-selection ideas from `presentation-ai`.
Use these as named design directions, then translate them into the Flazz theme
contract:

```javascript
const theme = {
  primary: "...",
  secondary: "...",
  accent: "...",
  light: "...",
  bg: "...",
};
```

Hex values in generated PPTX code must not include `#`.

## Theme Selection Rules

- Pick one named theme before writing slide modules.
- Do not default every deck to blue, white, or generic corporate styling.
- Use a light theme for dense teaching/report decks unless the topic clearly
  benefits from dark mode.
- Use a dark theme for cinematic, tech, luxury, space, cyber, or launch-event
  decks.
- Use the matching font pairing when it exists on the user's machine; otherwise
  fall back to a close system-safe font.
- For localized decks with diacritics, override catalog display fonts with
  Unicode-safe system fonts unless the output is visually verified. Prefer
  Segoe UI, Arial, Aptos, Calibri, Tahoma, or Cambria; avoid decorative
  serif/display fonts for generated diacritic-heavy content.
- Use the theme's card/background contrast to create visual hierarchy, not just
  a title plus bullets.

## Recommended Themes

| Theme | Mode | Best for | Colors | Fonts |
|---|---|---|---|---|
| Daktilo | Light | clean product, simple business, SaaS | `3B82F6` `60A5FA` `FFFFFF` `1F2937` `F3F4F6` | Inter / Inter |
| Noir | Dark | cinematic tech, serious demos | `60A5FA` `93C5FD` `111827` `E5E7EB` `1F2937` | Inter / Inter |
| Cornflower | Light | polished business, reports, education | `4F46E5` `818CF8` `F8FAFC` `334155` `FFFFFF` | Poppins / Inter |
| Indigo | Dark | immersive strategy, deep tech | `818CF8` `A5B4FC` `1E1B4B` `E2E8F0` `312E81` | Poppins / Inter |
| Orbit | Light | AI, systems, future-facing product | `312E81` `3B82F6` `FFFFFF` `1F2937` `F3F4F6` | Space Grotesk / Inter |
| Cosmos | Dark | space, infrastructure, advanced AI | `818CF8` `60A5FA` `030712` `E5E7EB` `111827` | Space Grotesk / Inter |
| Piano | Light | classic professional, formal education | `1F2937` `4B5563` `F3F4F6` `374151` `FFFFFF` | Playfair Display / Source Sans Pro |
| Ebony | Dark | premium editorial, serious consulting | `E5E7EB` `9CA3AF` `111827` `E5E7EB` `1F2937` | Playfair Display / Source Sans Pro |
| Mystique | Light | psychology, luxury, creative strategy | `7C3AED` `8B5CF6` `FFFFFF` `1F2937` `F5F3FF` | Montserrat / Open Sans |
| Phantom | Dark | mysterious, premium, research-heavy | `A78BFA` `C4B5FD` `18181B` `D4D4D8` `27272A` | Montserrat / Open Sans |
| Allweone Light | Light | AI agent products, modern tools | `06B6D4` `0EA5E9` `FFFFFF` `0F172A` `ECFEFF` | JetBrains Mono / Inter |
| Allweone Dark | Dark | cyber, automation, agentic workflows | `22D3EE` `38BDF8` `0F172A` `E2E8F0` `1E293B` | JetBrains Mono / Inter |
| Crimson | Light | bold history, culture, persuasive talks | `DC2626` `F87171` `FFFFFF` `1F2937` `FEF2F2` | Merriweather / Lato |
| Ember | Dark | dramatic story, crisis, security | `F87171` `EF4444` `18181B` `E5E7EB` `27272A` | Merriweather / Lato |
| Sunset | Light | travel, lifestyle, warm storytelling | `EA580C` `FB923C` `FFFBEB` `292524` `FFFFFF` | DM Serif Display / Inter |
| Dusk | Dark | warm premium, evening event, hospitality | `FB923C` `F97316` `1C1917` `E7E5E4` `292524` | DM Serif Display / Inter |
| Forest | Light | ESG, nature, health, operations | `059669` `34D399` `F0FDF4` `1F2937` `FFFFFF` | Bitter / Source Sans Pro |
| Canopy | Dark | deep eco, sustainability, field research | `34D399` `10B981` `064E3B` `E5E7EB` `065F46` | Bitter / Source Sans Pro |
| Aurora | Light | innovation, education, optimistic tech | `06B6D4` `34D399` `F0FDFA` `134E4A` `FFFFFF` | Quicksand / Nunito |
| Borealis | Dark | atmospheric tech, science, launch | `22D3EE` `4ADE80` `0C1222` `E2E8F0` `1E293B` | Quicksand / Nunito |
| Sakura | Light | culture, soft creative, wellness | `EC4899` `F472B6` `FDF2F8` `831843` `FFFFFF` | Noto Serif / Noto Sans |

## Fast Theme Picker

- Enterprise report: Cornflower, Piano, Forest
- AI/product demo: Orbit, Allweone Light, Allweone Dark
- Premium/luxury: Ebony, Phantom, Mystique
- History/culture: Crimson, Piano, Sakura
- Education/training: Cornflower, Aurora, Forest
- Security/crisis: Ember, Noir, Indigo
- Nature/ESG/health: Forest, Canopy, Aurora
- Travel/lifestyle: Sunset, Dusk, Sakura

## Theme Contract Mapping

When converting a catalog theme into Flazz's five-color theme object:

- `primary`: main heading and dominant shapes
- `secondary`: darker/lighter companion for structure
- `accent`: highlight color for numbers, badges, and connectors
- `light`: card or subtle surface color
- `bg`: slide background

For light themes:

- `bg` usually uses the catalog background
- `light` usually uses cardBackground
- `secondary` can use text or heading companion

For dark themes:

- `bg` uses the catalog background
- `light` uses cardBackground
- text should be light, but keep `theme.primary` or `theme.accent` for headings

## Anti-Monotony Rules

- Do not use only primary and bg. Every slide should use at least three theme
  colors across background, cards, headings, accents, connectors, or badges.
- Dark themes need large high-contrast text and fewer small labels.
- Light themes need visible card boundaries or section fills so they do not
  look like plain documents.
- Cover, section divider, and closing slides may be more dramatic than content
  slides, but they must still use the same theme.
