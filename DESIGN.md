---
version: alpha
name: PerData
description: "Terminal cuantitativa y publicación financiera para la Bolsa de Valores de Lima (BVL). Estética papel y tinta inspirada en publicaciones financieras institucionales (Financial Times, Our World in Data, informes BCRP). Paleta sobria basada en fondo papel (#FAF9F6 / #121211), tinta (#141414 / #EDEBE6), verde tinta brand (#0D2A1C / #E8E4D8), divisores en filete (#E4E1DA / #2E2D2A) y amarillo resaltador (#F6E016) de uso quirúrgico. Tipografía: Libre Franklin (headings/UI), Source Serif 4 (lectura) e IBM Plex Mono (datos y tickers con tabular-nums)."
colors:
  primary: "#0D2A1C"
  secondary: "#5C5A55"
  tertiary: "#F6E016"
  surface: "#F2F0EB"
  border: "#E4E1DA"
  on-primary: "#FFFFFF"
  on-tertiary: "#0D2A1C"
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
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
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
    textColor: "{colors.primary}"
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

PerData es una publicación financiera seria y terminal cuantitativa para la Bolsa de Valores de Lima (BVL) y mercados macrofinancieros andinos. Su identidad visual evoca la autoridad y sobriedad de un informe impreso o diario de referencia (Financial Times, Our World in Data, reportes BCRP): maquetación editorial alineada a la izquierda, tipografía que combina Libre Franklin para titulares y controles con Source Serif 4 para lectura reposada, y una paleta sobria de papel (#FAF9F6) y tinta (#141414), con verde tinta brand (#0D2A1C), filetes de separación de 1px (#E4E1DA) y un uso estrictamente delimitado de amarillo resaltador (#F6E016) para el logotipo, el subrayado de una palabra clave del hero y el badge de descuento.

No hay degradados, sombras decorativas en reposo, bordes con radio superior a 4px, ni rejillas de tarjetas flotantes: la jerarquía visual nace del ritmo tipográfico, filetes limpios y datos numéricos tabulares de alta legibilidad.

## Colors

- **Primary (#0D2A1C):** Verde tinta institucional — usado en botones primarios, marca y acentos tipográficos.
- **Secondary (#5C5A55):** Tinta suave — texto secundario, explicaciones, metadatos y etiquetas.
- **Tertiary (#F6E016):** Amarillo resaltador — reservado exclusivamente para el logo, el resaltado de palabra clave en el hero y el badge «2 meses gratis».
- **Paper (#FAF9F6):** Fondo de lectura en modo claro (en modo oscuro: #121211).
- **Surface (#F2F0EB):** Superficie para controles, tablas y fondos sutiles (en modo oscuro: #222220).
- **Border / Rule (#E4E1DA):** Filete de 1px para delimitar secciones, listas y tablas (en modo oscuro: #2E2D2A).
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

- **Radio máximo:** 4px para botones, inputs, modales y tarjetas.
- **Pill (9999px):** Reservado únicamente para interruptores (switches) y status dots, nunca en botones de acción.

## Components

### Botones
- **Primario:** Fondo `--pd-brand` (#0D2A1C) con texto blanco en claro; fondo #EDEBE6 con texto #121211 en oscuro. Radio de 4px y sin sombra.
- **Secundario / Ghost:** Fondo transparente con borde de 1px en ink y texto en ink. Hover a surface.
- **Sin hover-lift ni sombras.**

### Tablas de Datos
- Encabezado con fondo `--pd-surface` y borde inferior de 1px.
- Cifras en IBM Plex Mono con alineación derecha y tabular-nums.
- Filete horizontal entre filas y hover sutil a `--pd-surface`.

### Resaltador
- Subrayado grueso de marcador (`.pd-highlight`) usando `#F6E016` únicamente sobre la palabra clave del titular.

## Do's and Don'ts

- **Do** usar filetes de 1px para estructurar la página en lugar de cajas y tarjetas.
- **Do** alinear el contenido a la izquierda con escala tipográfica clara.
- **Do** emplear IBM Plex Mono y tabular-nums en todo dato cuantitativo.
- **Do** mantener el amarillo `#F6E016` estrictamente limitado a logo, resaltador de palabra y badge de descuento.
- **Don't** incluir gradientes, sombras flotantes, resplandores ni pulsos animados.
- **Don't** usar emojis en interfaces públicas ni dashboards.
- **Don't** crear tarjetas centradas en rejilla de 4 para listas de elementos.
- **Don't** usar azul ni estilos ornamentales en enlaces dentro de párrafos de texto.
