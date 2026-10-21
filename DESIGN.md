---
version: alpha
name: PerData
description: "Terminal cuantitativa institucional para la Bolsa de Valores de Lima y Mercados Andinos. Estética bancaria suiza y colores de aviación de United Airlines: Navy profundo (#002244), Azul Vuelo (#005DAA), Canvas Slate (#F8FAFC) y acento dorado tenue (#F59E0B). Tipografía San Francisco de Apple (-apple-system / SF Pro), datos tabulares calibrados, micro-interacciones de alta precisión."
colors:
  primary: "#002244"
  secondary: "#475569"
  tertiary: "#005DAA"
  accent: "#005DAA"
  gold: "#F59E0B"
  neutral: "#F8FAFC"
  surface: "#F1F5F9"
  border: "#E2E8F0"
  on-primary: "#FFFFFF"
  on-tertiary: "#FFFFFF"
  dark-bg: "#0d0d0e"
  dark-surface: "#1c1c1e"
  dark-primary: "#f5f5f7"
  dark-secondary: "#8e8e93"
  dark-tertiary: "#f6e016"
  dark-neutral: "#0d0d0e"
  dark-on-primary: "#0d2a1c"
  dark-on-tertiary: "#0d2a1c"
typography:
  display:
    fontFamily: "Libre Franklin"
    fontSize: "4rem"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.06em"
  h1:
    fontFamily: "Libre Franklin"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.035em"
  h2:
    fontFamily: "Libre Franklin"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  h3:
    fontFamily: "Libre Franklin"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Source Serif 4"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  body-emphasis:
    fontFamily: "Source Serif 4"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "0em"
  caption:
    fontFamily: "Libre Franklin"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.08em"
  mono:
    fontFamily: "IBM Plex Mono"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
  mono-sm:
    fontFamily: "IBM Plex Mono"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  xxl: 72px
  xxxl: 110px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-accent:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  segmented-control:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "2px"
  segmented-btn:
    rounded: "4px"
    padding: "0 12px"
  segmented-btn-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "4px"
    padding: "0 12px"
  input:
    backgroundColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 12px"
  input-focus:
    backgroundColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 12px"
  select:
    backgroundColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 30px 0 10px"
  card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "24px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  stat-strip:
    backgroundColor: "transparent"
    padding: "0"
  stat:
    backgroundColor: "transparent"
    padding: "10px 16px 11px"
  table-header:
    backgroundColor: "{colors.surface}"
    padding: "10px 16px"
  table-header-dark:
    backgroundColor: "{colors.dark-surface}"
    padding: "10px 16px"
  table-row:
    backgroundColor: "transparent"
    padding: "10px 16px"
  table-row-hover:
    backgroundColor: "{colors.surface}"
    padding: "10px 16px"
  table-row-hover-dark:
    backgroundColor: "#252528"
    padding: "10px 16px"
  kpi-value:
    backgroundColor: "transparent"
    padding: "0"
  band-label:
    backgroundColor: "transparent"
    padding: "0"
  chip:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
  chip-hover:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
  locked:
    backgroundColor: "transparent"
    padding: "0"
  locked-dark:
    backgroundColor: "transparent"
    padding: "0"
  switch:
    backgroundColor: "rgb(229, 229, 234)"
    rounded: "{rounded.full}"
    padding: "0"
  switch-dark:
    backgroundColor: "rgb(44, 44, 46)"
    rounded: "{rounded.full}"
    padding: "0"
  modal:
    backgroundColor: "#ffffff"
    rounded: "12px"
    padding: "24px"
  modal-dark:
    backgroundColor: "{colors.dark-surface}"
    rounded: "12px"
    padding: "24px"
---

## Overview

PerData es una terminal cuantitativa institucional para la Bolsa de Valores de Lima (BVL). Su identidad visual evoca la autoridad de un reporte impreso anual: masthead tipo mosaico, título anclado a un eje vertical fijo al 42% del viewport, tipografía editorial que combina una grotesca americana pesada (Libre Franklin) con una serif transicional de lectura (Source Serif 4), y una paleta de dos tintas — botella ink (#0D2A1C) para todo el texto y amarillo (#F6E016) como única nota saturada, usada quirúrgicamente en botones primarios, una sección completa y el focus ring. No hay degradados, sombras decorativas, tarjetas flotantes ni ornamentos: la jerarquía nace de la escala tipográfica, el ritmo vertical y los bloques de color plano. La densidad de datos es alta pero escaneable; cada sección es una "página" del reporte con su propia composición, nunca una grilla de tarjetas repetida.

## Colors

- **Primary (#0d2a1c):** Tinta principal — cerca de negro botella con subtono verde. Usar para todo el texto, headings, bordes fuertes, botones primarios.
- **Secondary (#5f6b64):** Texto secundario, metadata, placeholders, estados muted.
- **Tertiary (#f6e016):** Único color saturado — amarillo mostaza. Botón primario hover, una sección completa (field), focus ring, hover states.
- **Neutral (#f7f7f7):** Fondo de página en modo claro — off-white cálido.
- **Surface (#ebebeb):** Superficies de controles, tablas, chips, segmented controls.
- **Border (#d4d4d4):** Divisores sutiles.
- **On-primary (#f6e016):** Texto sobre primary (botones primarios).
- **On-tertiary (#0d2a1c):** Texto sobre tertiary (botones acento, sección amarilla).
- **Dark variants:** Contrapartes modo oscuro. El primary se vuelve #f5f5f7, el tertiary sigue siendo #f6e016.

## Typography

- **Display / H1–H3:** Libre Franklin weight 700/600, tracking negativo progresivo (-0.06em a -0.015em), leading ajustado (0.9–1.2). Headlines en sentence case, dos líneas máx.
- **Body / Body-emphasis:** Source Serif 4 weight 400/600, leading 1.55, tracking 0. Tamaño base 1.125rem (18px).
- **Caption / Micro-label:** Libre Franklin 0.75rem (12px) weight 500, uppercase, tracking +0.08em. Para etiquetas de sección, badges, tabs.
- **Mono:** IBM Plex Mono para números, tickers, datos tabulares. Tabular-nums obligatorio vía CSS `font-variant-numeric: tabular-nums`.
- **Carga de fuentes:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400;1,600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
```

## Layout

- **Eje fijo 42%:** Todos los headings inician en column-line 42% (≈ 504px en 1200px). Zona 0–42% para side notes, figuras, o vacío.
- **Masthead:** Banda full-width 52% vh (38% móvil) como mosaico sin gutter: grid 6×2, 4 celdas foto + 2-3 color tiles, object-fit: cover, filtro grayscale(1) contrast(1.05).
- **Medida de lectura:** 34–40ch para body, 44ch para column derecha en split views.
- **Gap entre secciones:** 120–220px desktop, 80px móvil. Sin hairlines entre secciones — separación por cambio de ground o espacio.
- **Container max:** 1200px centrado.
- **Responsive:** En móvil el eje colapsa a margen izquierdo 16px; side notes se vuelven inline arriba de su párrafo.

## Shapes

- **Radio estándar:** 6px (md) para botones, inputs, selects, cards.
- **Radio sutil:** 4px (sm) para chips, segmented controls, badges.
- **Pill (9999px):** Solo para switch toggle, status dots — nunca en botones de acción primaria.
- **Sin bordes hairline, sin sombras en reposo.** Separación por espacio o cambio de ground.

## Components

### Botones
- **Primario:** fondo primary, texto on-primary. Hover: tertiary / on-tertiary.
- **Ghost:** transparente, texto primary, border sutil (via shadow). Hover: surface + border fuerte.
- **Acento:** fondo tertiary, texto on-tertiary. Para CTA único en sección amarilla.
- **Underline-grow feedback** (no jump): ::after scaleX(0→1) en hover.

### Controles segmentados (Range/Horizon)
- Contenedor `.seg`: surface + border sutil (shadow), radius 6px, padding 2px, gap 2px.
- Botón activo: primary + on-primary. Inactivo: secondary.
- Gated (locked): opacity 0.4, muted color, pointer.

### Inputs / Selects
- Mono (IBM Plex Mono) para search, custom horizon.
- Focus: border primary + ring 3px rgba(primary, 0.07).
- Select: flecha SVG custom, apariencia none.

### Chips (atajos)
- Border sutil (shadow), surface, radius 4px, 11px/500. Hover: border primary.

### Stat strips (KPIs)
- Grid 2/4/5 columnas. Hairline top + left dividers (border color via shadow).
- Valor: mono 15px/700/tnum. Label: micro-label 10px/700/uppercase muted.

### Tablas
- Header sticky top-0, surface bg, border-bottom.
- Mono tnum para números. Row hover: surface bg.
- Columna fecha sticky left-0.

### Modal
- Centrado, max-w-2xl, max-h-[90vh], overflow-y-auto body.
- Backdrop blur + scale entrance.
- Focus trap + Escape close.

### Switch toggle
- CSS-only, 40×22px, circle 18px. Vars para temas.

## Motion

- **Entrada sección (.terminal-surface, .rise-in):** rise 14px → 0, fade, 0.55s cubic-bezier(0.22,0.61,0.36,1), staggered by DOM order.
- **Card hover:** lift -2px + shadow, 0.25s mismo easing.
- **KPI value flash:** background pulse verde 0.9s ease-out.
- **Botón underline-grow:** ::after scaleX 0→1, 0.28s.
- **Controles segmentados:** transitions 0.18s suaves.
- **Search dropdown:** slide+fade 0.22s.
- **Tabla rows cascade:** primeras 15 rows stagger 0.4s.
- **Headline masked reveal:** cada línea sube desde su baseline 900ms strong ease-out, 2ª línea +110ms.
- **Reduced motion:** todo 0.01ms, respeta prefers-reduced-motion.

## Do's and Don'ts

- **Do** usar tokens `{colors.primary}`, `{colors.tertiary}` en componentes — paleta single-source.
- **Do** mantener el eje 42% exacto en todas las secciones.
- **Do** usar mosaico masthead con fotos reales (arquitectura/estructura) o tiles de paleta.
- **Do** páginas de color plano (tertiary) para secciones CTA — floor to ceiling.
- **Do** tabular-nums en TODO dato numérico.
- **Don't** introducir colores fuera de la paleta (nada de púrpura, azul, rojo decorativo).
- **Don't** usar sombras en elementos en reposo — solo en hover/focus/flotantes reales.
- **Don't** usar degradados — color plano o foto real.
- **Don't** usar border CSS en cards — box-shadow 0.5px como "hairline" + elevation.
- **Don't** usar monospace fuera de datos reales (tickers, precios, fechas, código).
- **Don't** usar label ceja (eyebrow) sobre headings — info en heading o primera frase.
- **Don't** numeración 01/02/03 — orden por posición, tamaño, palabras.
- **Don't** reglas hairline (1px) como divisores — espacio o cambio de ground.
- **Don't** glassmorphism / backdrop-blur paneles flotantes.
- **Don't** icon-topped feature cards, filas de tarjetas idénticas.
- **Don't** emoji, gradient blobs, formas decorativas, fake dashboards.
- **Don't** palabras acento estilizadas en headings (itálica, serif, color, subrayado).
- **Máx 2 tipografías** (Libre Franklin + Source Serif 4 + IBM Plex Mono = 3 familias, pero mono solo para datos).