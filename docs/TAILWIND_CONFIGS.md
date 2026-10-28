# Configuraciones Tailwind de las páginas

La compilación local sustituyó las configuraciones en línea de Tailwind CDN. Para comparar las 15 páginas se recuperaron las configuraciones que tenían justo antes de esa sustitución (`b36eda7^`).

| Configuración en línea | Páginas | `darkMode` | Colores extendidos |
| --- | --- | --- | --- |
| A | `index.html`, `explorer.html`, `news.html`, `metodologia.html`, `aprende.html`, `guia.html`, `precios.html`, `cuenta.html`, `restablecer.html`, `privacidad.html`, `terms.html`, `404.html`, `boletin.html` | `class` | `appleLight`, `appleDark`, `appleCardDark`, `appleTextDark`, `appleSubDark`, `appleBorderDark`, `appleBorderLight` |
| B | `empresa.html`, `empresas.html` | `class` | `paper`, `card`, `surface`, `ink`, `ink-soft`, `rule`, `peru`, `pos`, `neg` |

No hay conflictos de valores: las dos configuraciones extienden claves distintas. El archivo `tailwind.config.cjs` reúne la unión de ambas paletas. Las claves semánticas de la configuración B apuntan a variables CSS y se conservan junto con la paleta A.

## Clases construidas en JavaScript

El escaneo de contenido incluye todos los archivos `*.html` y `*.js` del repositorio, incluido el JavaScript embebido en las páginas. Se revisaron las plantillas `class="…${…}"` y llamadas a `classList.add(...)`: las ramas condicionales con nombres explícitos las detecta el escáner; la selección de colores de `explorer.html` se cubre además con la safelist de `text-*` y `bg-*` para tonos emerald y rose, incluyendo la variante `dark:`. El comprobador recorre reglas de `tw.css` y de las hojas de estilo propias cargadas por cada página; así reconoce clases como `pd-ad-*`, `var-pos` y `var-neg` definidas por el CSS de la aplicación.
