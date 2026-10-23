---
version: alpha
name: PerData
description: "Terminal cuantitativa y publicación financiera para el mercado peruano (Bolsa de Valores de Lima, dólar interbancario US$/PEN y materias primas). Identidad sobria y rigurosa basada en papel hueso (#F5F1E8 / #141311), tinta (#1B1916 / #EDE8DC) y acento de identidad rojo Perú (#C8102E / #E0384F) reservado exclusivamente a la marca."
colors:
  primary: "#1B1916"
  secondary: "#5E584E"
  tertiary: "#C8102E"
  neutral: "#F5F1E8"
  surface: "#ECE6D9"
  card: "#FBF9F4"
  border: "#DCD4C4"
  sky: "#B9AF9A"
  on-primary: "#F5F1E8"
  on-tertiary: "#FFFFFF"
typography:
  display:
    fontFamily: "Source Serif 4"
    fontSize: "3.5rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  h1:
    fontFamily: "Source Serif 4"
    fontSize: "2.75rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  h2:
    fontFamily: "Source Serif 4"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  h3:
    fontFamily: "Libre Franklin"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Source Serif 4"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  body-ui:
    fontFamily: "Libre Franklin"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.45
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
  mono-sm:
    fontFamily: "IBM Plex Mono"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
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
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "#000000"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
  header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: "14px 24px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "24px"
  surface-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    padding: "18px 16px"
  flag-badge:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    padding: "2px 6px"
  sky-fan:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.primary}"
  border-line:
    backgroundColor: "{colors.border}"
    textColor: "{colors.primary}"
---

## Overview

### 1. Qué es PerData y para quién
PerData es una terminal cuantitativa y publicación financiera independiente para el mercado peruano. Cubre la Bolsa de Valores de Lima (BVL), el tipo de cambio interbancario US$/PEN y materias primas estratégicas como cobre y oro. Está dirigida a tesoreros corporativos, directores financieros, analistas cuantitativos, inversionistas y profesionales del sector financiero que requieren análisis objetivo con rigor estadístico y sin sesgo comercial.

En PerData la veracidad y la precisión de los datos están estrictamente por encima de cualquier consideración publicitaria o de marketing. Cada visualización comunica incertidumbre real mediante distribuciones de probabilidad calibradas empíricamente.

### 2. Principios de diseño e ingeniería
- **Cada cifra es real:** Datos de mercado y fuentes oficiales sin inventos, proxies oscuros ni extrapolaciones no declaradas.
- **Nada inventado ni sellos falsos:** Cero testimonios simulados, logos de empresas ficticias o sellos de certificación engañosos.
- **El movimiento sirve a la lectura:** Animaciones funcionales y contenidas (250 ms, 8 px) orientadas a facilitar la lectura jerárquica; desactivación completa ante `prefers-reduced-motion`.
- **Español llano y directo:** Redacción sobria sin tríadas de adjetivos publicitarios ni expresiones infladas («110%», «rigurosísimo», «líder del mercado»).
- **Un solo sistema visual:** Coherencia de maquetación, proporciones y tokens entre la portada, la terminal interactiva (/explorer) y las páginas de documentación y lectura.
- **Firma institucional única:** PerData se firma como «PerData». Queda prohibido consignar nombres o datos personales del fundador en la plataforma pública.

## Colors

### 3. Color y Tokens de Identidad
La dirección visual adopta la estética de publicaciones financieras históricas de referencia («papel y tinta») combinada con la identidad sobria de la economía peruana. El fondo es un blanco hueso orgánico, la cabecera es tinta profunda casi negra y el rojo Perú se reserva de forma estricta y exclusiva para la marca institucional.

| Token | Modo Claro | Modo Oscuro | Uso Permitido | Uso Prohibido |
|---|---|---|---|---|
| `--pd-paper` | #F5F1E8 | #141311 | Fondos principales de página, lienzos generales | Prohibido en textos y trazos de datos |
| `--pd-card` | #FBF9F4 | #1C1B18 | Tarjetas de información, paneles de control, tablas | Prohibido en fondos completos de página |
| `--pd-surface` | #ECE6D9 | #24221E | Franjas métricas, bandas de indicadores, contenedores | No usar como color de texto continuo |
| `--pd-ink` | #1B1916 | #EDE8DC | Titulares principales, línea histórica del gráfico, P50 | Prohibido en fondos de pantalla completos |
| `--pd-ink-soft` | #5E584E | #A59E90 | Texto secundario, subtítulos, etiquetas de ejes, P90/P10 | Prohibido en cuerpos de lectura <14px |
| `--pd-rule` / `--pd-border` | #DCD4C4 | #33302A | Filetes divisorios de 1px, bordes de tabla | Prohibido en bordes gruesos >1px |
| `--pd-brand` | #1B1916 | #EDE8DC | Logotipo, monograma, elementos nucleares de marca | Prohibido en cifras de cotización |
| `--pd-accent` | #1B1916 | #EDE8DC | Enlaces, elementos interactivos principales | Prohibido en colores estridentes |
| `--pd-accent-hover` | #000000 | #FFFFFF | Estado hover de botones y enlaces | Prohibido en elementos en reposo |
| `--pd-sky` | #B9AF9A | #8F8672 | Abanico probabilístico futuro (P10-P90), bandas | Prohibido en texto o botones |
| `--pd-peru` | #C8102E | #E0384F | Franjas rojas de bandera, subrayado activo, filete cita | ESTRICTAMENTE PROHIBIDO en cifras, gráficos o variaciones |
| `--pd-pos` | #1E7A46 | #5FBF85 | Rendimientos positivos, variaciones al alza | Prohibido en elementos de marca o decoración |
| `--pd-neg` | #B3261E | #F07A72 | Rendimientos negativos, caídas de cotización | Prohibido confundir con el rojo de marca --pd-peru |
| `--pd-focus` | rgba(27,25,22,.35) | rgba(237,232,220,.5) | Anillos de foco accesible por teclado | Prohibido eliminar el foco visible |

**Regla clave inquebrantable:** El rojo de datos (`--pd-neg`) señala variaciones negativas del mercado. El rojo Perú (`--pd-peru`) representa exclusivamente la identidad de la marca. Nunca deben mezclarse, intercambiarse ni reutilizarse fuera de su propósito específico.

## Typography

### 4. Sistema Tipográfico
PerData implementa tres familias tipográficas con roles técnicos complementarios:
- **Source Serif 4:** Titulares editoriales y cuerpo de lectura general. Su variante cursiva (italic) se emplea de manera controlada para el wordmark de marca (`PerData`) y citas de apertura.
- **Libre Franklin:** Interfaz de usuario (UI), barras de navegación, botones y selectores. Se cargan únicamente los pesos 600 y 700 para minimizar la sobrecarga de red y optimizar First Contentful Paint.
- **IBM Plex Mono:** Cifras numéricas, cotizaciones, tickers bursátiles, tablas financieras y fechas, siempre con alineación monoespaciada tabular (`tabular-nums`).

**Escala tipográfica:**
- Display / H1: 40px - 62px (`clamp(40px, 5.4vw, 62px)`), interlineado 1.05, tracking `-0.03em`.
- H2 de sección: 28px - 46px (`clamp(28px, 3.4vw, 38px)`), interlineado 1.12, tracking `-0.02em`.
- H3 destacado: 20px - 24px, interlineado 1.25, tracking `-0.015em`.
- Cuerpo de texto editorial: 17px - 18px, interlineado 1.6, color `--pd-ink`.
- Microetiquetas y pies: 11px - 12px en IBM Plex Mono o Libre Franklin 700 con tracking espaciado `0.06em`.

## Layout

### 5. Firma de Marca y Monograma
- **Wordmark oficial:** `<span class="pd-wordmark">PerData<span class="pd-flag" role="img" aria-label="Perú"><b></b><b></b><b></b></span></span>`. Configurado en Source Serif 4 cursiva 600 a 24px, complementado con la bandera del Perú de 16x11px (`border: 1px solid currentColor`) con tres franjas verticales proporcionadas (#D91023, #FFFFFF, #D91023). En cabecera se proyecta en color hueso (`var(--pd-paper)`) y en pie de página en tinta (`var(--pd-ink)`).
- **Monograma «P»:** Reservado exclusivamente como favicon multiformato (`favicon.ico`, `icon.svg`), icono táctil (`apple-touch-icon.png`) e imagen social Open Graph (`og-image.png`). Diseñado en trazo hueso sobre fondo tinta `#1B1916`.

### 6. Layout y Componentes Estructurales
- **Contenedor y cuadrícula:** Ancho máximo centrado en `max-w-6xl` (1152px) con márgenes de seguridad de 16px en móvil y 24px en escritorio.
- **Filetes de 1px:** Delimitación visual mediante filetes limpios de 1px en `var(--pd-rule)`, descartando tarjetas infladas o separadores gruesos.
- **Tablas:** Filas con borde inferior de 1px, números tabulares alineados a la derecha y encabezados en Libre Franklin con tracking sobrio.
- **Botones:** Radio de curvatura reducido (`border-radius: 4px` en UI, `2px` en landing). Botón primario en fondo tinta y texto hueso (en claro) o fondo hueso y texto tinta (en oscuro). Botón secundario con fondo transparente y filete perimetral de 1px.
- **Elevación controlada:** Cero sombras en reposo en la página. La única sombra autorizada en toda la aplicación es la tarjeta del panel terminal del gráfico (`box-shadow: 0 1px 2px rgba(27,25,22,0.10), 0 12px 32px rgba(27,25,22,0.18)`).
- **Cabecera fija:** Cabecera institucional en fondo tinta (#1B1916 en claro, #0D0C0B en oscuro) con borde inferior de 1px en #33302A, navegación en blanco hueso translúcido y subrayado de 2px en rojo Perú para la ruta activa.

### 7. Gráficos Cuantitativos (pd-chart.js)
- **Eje temporal claro:** Separación nítida entre la serie histórica y el cono de proyección a partir de la línea vertical «Hoy» anclada en el último cierre real.
- **Serie histórica:** Trazo continuo en `--pd-ink` (1.2px a 1.4px con interpolación monótona y cierres diarios para rangos ≤1 año) acompañado de un degradado vertical tenue de `--pd-sky` (12% a 0%).
- **Abanico estocástico:** Intervalos de incertidumbre P10-P90 y P25-P75 modelados con degradado horizontal difuminado hacia el horizonte futuro.
- **Mediana P50:** Trazo discontinuo (`borderDash: [4, 4]`) en `--pd-ink`.
- **Etiquetas directas y escala:** Rótulos numéricos P90 / P50 / P10 situados directamente en el extremo derecho del abanico sin interferir con la pastilla del último precio. Eje vertical ubicado a la derecha con escala limpia.
- **Panel macroeconómico:** Curva inferior sincronizada (base 100) en trazo fino de 1.2px sin cuadrículas saturadas.

### 8. Movimiento e Interacción (motion.js)
- **Cinética editorial:** Transición de entrada de 250 ms con desplazamiento vertical máximo de 8 px (`translateY(8px)`) y curva suave `cubic-bezier(0.05, 0.7, 0.1, 1)`.
- **Escalonamiento:** Revelación secuencial de filas mediante `data-stagger` con retardo de 25 ms por elemento hasta un límite de 8 filas consecutivas.
- **Propósito:** El movimiento se limita a orientar la jerarquía visual durante la carga y cambios de vista; prohibidas animaciones infinitas o decorativas.
- **Accesibilidad:** Soporte estricto para `@media (prefers-reduced-motion: reduce)` que inhibe las transiciones y sitúa los elementos de forma inmediata.

### 9. Datos, Modelos y Veracidad
- **Fuentes oficiales verificadas:** Datos de cotización obtenidos de Yahoo Finance, Banco Mundial y medios especializados (Google News).
- **Modelos estocásticos reales:** Proyecciones a 1 mes (H=1) generadas con Engine v3 calibrado; proyecciones de 3 a 36 meses (H=3..36) procesadas en batch diario con TimesFM 2.5 de Google Research.
- **Cobertura empírica:** Intervalos de incertidumbre calibrados con backtest rolling fuera de muestra con cobertura medida del 80% (rango admisible 75%-85%).
- **Límites de responsabilidad:** Prohibido emitir recomendaciones de inversión, promesas de ganancias o afirmaciones de certeza predictiva.

## Do's and Don'ts

### 10. Qué NO hacer (Anti-patrones «IA» Prohibidos)
- **NO usar azules marinos o cianes de startups de IA:** La paleta es papel hueso, tinta y rojo Perú.
- **NO usar gradientes decorativos o brillos artificiales:** Solo color plano y texturas de inspiración editorial.
- **NO usar sombras flotantes o paneles con desenfoque (glassmorphism):** Las superficies se definen por tono y filetes de 1px.
- **NO usar etiquetas repetitivas en mayúsculas diminutas (eyebrows) en cada encabezado:** La jerarquía tipográfica debe ser suficiente.
- **NO usar emojis en ninguna sección:** Prohibidos en textos, tablas, cabecera y botones.
- **NO inventar métricas, testimonios ni certificaciones:** La reputación de PerData descansa en la fidelidad estadística de sus modelos.
- **NO usar contadores animados que incrementan desde cero:** Los datos financieros se muestran firmes y completos.

### 11. Checklist Obligatorio antes de Publicar
- [ ] Ejecutar prueba de cordura integral: `npm run smoke` con 107/107 pruebas OK y 0 fallos.
- [ ] Ejecutar auditoría visual `shots.js` en 1440px y 390px, tanto en modo claro como oscuro, verificando 0 OVERFLOW y 0 ERR.
- [ ] Comprobar que los ratios de contraste WCAG AA superan ampliamente 4.5:1 en todos los textos y botones.
- [ ] Verificar que no existan patrones de texto prohibidos (nombres personales, marcas de IA, fuentes no autorizadas) en las páginas servidas.
- [ ] Validar que `DESIGN.md` satisface el linter oficial: `npx @google/design.md lint DESIGN.md` con 0 errores.
