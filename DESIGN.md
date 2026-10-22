---
version: alpha
name: PerData
description: "Terminal cuantitativa y publicación financiera para la Bolsa de Valores de Lima (BVL). Estética sobria basada en azul marino y azul sobre neutros fríos: fondo papel (#F7F8FA / #0A1422), tarjeta (#FFFFFF / #0F1C2E), tinta (#0E1A2B / #E9EEF4), azul marino (#002244), acento azul (#1414D2 / #93B7F8) y filetes de 1px (#DCE1E8 / #22344B). Tipografía: Libre Franklin (headings/UI), Source Serif 4 (lectura) e IBM Plex Mono (datos y tickers con tabular-nums)."
colors:
  primary: "#002244"
  secondary: "#556170"
  tertiary: "#1414D2"
  surface: "#EEF1F5"
  border: "#DCE1E8"
  on-primary: "#FFFFFF"
  on-tertiary: "#FFFFFF"
typography:
  display:
    fontFamily: "Libre Franklin"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  h1:
    fontFamily: "Libre Franklin"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  h2:
    fontFamily: "Libre Franklin"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  h3:
    fontFamily: "Libre Franklin"
    fontSize: "1.5rem"
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
    fontSize: "0.6875rem"
    fontWeight: 700
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
  md: 4px
  lg: 4px
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
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-accent:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  segmented-control:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "3px"
  segmented-btn:
    rounded: "{rounded.sm}"
    padding: "0 12px"
  segmented-btn-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
  input:
    backgroundColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 14px"
  input-focus:
    backgroundColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 14px"
  select:
    backgroundColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 30px 0 10px"
  card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.sm}"
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
  table-row:
    backgroundColor: "transparent"
    padding: "10px 16px"
  table-row-hover:
    backgroundColor: "{colors.surface}"
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
  switch:
    backgroundColor: "rgb(228, 225, 218)"
    rounded: "{rounded.full}"
    padding: "0"
  modal:
    backgroundColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "24px"
---

## Overview

PerData es una publicación financiera seria y terminal cuantitativa para la Bolsa de Valores de Lima (BVL) y mercados macrofinancieros andinos. Su identidad visual evoca la autoridad y sobriedad de un informe impreso o diario de referencia: maquetación editorial alineada a la izquierda, tipografía que combina Libre Franklin para titulares y controles con Source Serif 4 para lectura reposada, y una paleta sobria basada en azul marino y azul sobre neutros fríos (papel #F7F8FA, tarjeta #FFFFFF y tinta #0E1A2B), con azul marino (#002244), acento azul (#1414D2 / #93B7F8), filetes de separación de 1px (#DCE1E8 / #22344B) y azul cielo (#93B7F8) para subrayado.

No hay degradados, sombras decorativas en reposo, bordes con radio superior a 4px, ni rejillas de tarjetas flotantes: la jerarquía visual nace del ritmo tipográfico, filetes limpios y datos numéricos tabulares de alta legibilidad.

## Colors

- **Primary (#002244):** Azul marino institucional — usado en cabecera persistente, marca y acentos de navegación.
- **Secondary (#556170):** Tinta suave — texto secundario, explicaciones, metadatos y etiquetas.
- **Tertiary (#1414D2):** Azul vivo de acción — reservado con moderación para botones primarios, enlaces activos, filete Pro y badges.
- **Sky (#93B7F8):** Azul claro — subrayado técnico de 3px de la palabra clave en el hero y enlaces activos de navegación.
- **Paper (#F7F8FA):** Fondo general de página en modo claro (en modo oscuro: #0A1422).
- **Surface (#EEF1F5):** Superficie neutra fría para controles, tablas y fondos sutiles (en modo oscuro: #15253A).
- **Border / Rule (#DCE1E8):** Filete de 1px para delimitar secciones, listas y tablas (en modo oscuro: #22344B).
- **Positive (#1E7A46):** Cifras y variaciones al alza (en modo oscuro: #5FBF85).
- **Negative (#B3261E):** Cifras y variaciones a la baja (en modo oscuro: #F07A72).

## Typography

- **Headings & UI:** Libre Franklin (weights 600 y 700), con tracking negativo moderado (-0.025em a -0.035em) en titulares. Titulares en máximo dos líneas.
- **Reading / Body:** Source Serif 4 (weight 400 y 600), base 18px (1.125rem), line-height 1.55. Para párrafos de lectura, artículos, metodología y textos legales.
- **Mono / Data:** IBM Plex Mono con `font-variant-numeric: tabular-nums` (`tabular-nums`) para todas las cifras, fechas, porcentajes y tickers bursátiles.
- **Eyebrow / Micro-label:** Máximo un eyebrow por página, 11px mayúsculas con espaciado de 0.08em en tinta suave.

## Layout

- **Alineación a la izquierda:** Jerarquía editorial natural sin bloques centrados forzados.
- **Filetes de separación:** Filetes horizontales de 1px (`--pd-rule`) para separar secciones, listas y pasos.
- **Listas y tablas sobre tarjetas:** No usar rejillas de tarjetas flotantes para mostrar conjuntos de datos; usar tablas o listas con filete.
- **Ancho de lectura:** Contenedores calibrados (máx. 1040px–1140px) para legibilidad óptima.

## Elevation & Depth

- **Sin sombras en reposo:** Ni tarjetas, ni botones, ni barras de navegación llevan sombras proyectadas ni glows decorativos.
- **Contraste de superficie:** La elevación se expresa exclusivamente mediante el contraste sutil entre `--pd-paper`, `--pd-card` y `--pd-surface`.

## Shapes

- **Radio máximo:** 4px para botones, inputs, modales y tarjetas; 2px para badges.
- **Pill (9999px):** Reservado únicamente para interruptores (switches) y status dots, nunca en botones de acción.

## Components

### Cabecera
- Fondo azul marino `#002244` en modo claro y oscuro, con filete inferior sutil `#0B3360`. Enlaces en `rgba(255,255,255,.78)`, hover y activo en blanco puro con subrayado de 2px en azul cielo `#93B7F8`. Chip de logo blanco con la «P» en `#002244`.

### Botones
- **Primario:** Fondo `--pd-accent` (#1414D2) con texto blanco en claro (hover #002244); fondo #93B7F8 con texto #0A1422 en oscuro (hover #B9CFFA). Radio de 4px y sin sombra.
- **Secundario / Ghost:** Fondo transparente con borde de 1px en ink y texto en ink. Hover a surface y borde accent.
- **Sin hover-lift ni sombras.**

### Tablas de Datos
- Encabezado con fondo transparente o `--pd-surface` y borde inferior de 1px.
- Cifras en IBM Plex Mono con alineación derecha y tabular-nums.
- Filete horizontal entre filas y hover sutil a `--pd-surface`.

### Acento del Hero
- Subrayado de 3px en azul cielo (`--pd-sky`: `#93B7F8`) con offset de 6px y texto en `--pd-accent`, sin fondo de resaltador ni amarillo.

## Do's and Don'ts

- **Do** usar filetes de 1px para estructurar la página en lugar de cajas y tarjetas.
- **Do** alinear el contenido a la izquierda con escala tipográfica clara.
- **Do** emplear IBM Plex Mono y tabular-nums en todo dato cuantitativo.
- **Do** reservar el azul vivo (`#1414D2`) con moderación para acciones clave, enlaces y badges.
- **Don't** incluir gradientes, sombras flotantes, resplandores ni pulsos animados.
- **Don't** usar emojis en interfaces públicas ni dashboards.
- **Don't** crear tarjetas centradas en rejilla de 4 para listas de elementos.
- **Don't** usar fondos fotográficos ni saturar fondos grandes con azul vivo.
