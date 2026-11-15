# Laboratorio en la caja InstaBox

Lo pesado que no conviene correr en el servidor ni en el repo público va a la caja `agustin-box`.
Usuario `wagustin`, HOME `/data/home` (persistente). Trae git, Python 3.13, Node 22, Docker y Chromium (`/usr/bin/chromium`).

## Qué hay en la caja

| Ruta | Qué es | Tamaño aprox. |
|---|---|---|
| `/data/home/perdata-lab/repo` | Clon público de `Wagustin/macro-data-explorer` | 25 MB |
| `/data/home/perdata-lab/venv` | Entorno Python con numpy y lightgbm (lo que instala `torneo.yml`) | 235 MB |
| `/data/home/perdata-lab/noticias` | Copia del archivo de titulares en bruto (`gal/peru`, `gal/mundo`, índices). Solo en la caja, nunca al repo | 4,2 GB |
| `/data/home/perdata-lab/qa` | Playwright 1.64.1, el último `public/` y los informes de la QA (`out/`) | 33 MB |
| `/data/home/perdata-lab/ramas/<rama>` | Ramas probadas con `probar-rama.sh` (p. ej. `main`: con `node_modules`) | 85 MB |
| `/data/home/perdata-lab/salida-corta` | Salida de la corrida corta del torneo | 36 KB |

El corpus copiado llega hasta el 2026-11-09: es lo que tenía el archivo del servidor. Las filas del CSV de rasgos de los días posteriores no se pueden reproducir desde él.

## Scripts (en `scripts/lab/`)

### `qa-completo.sh`
QA pesado de las páginas públicas. Hace el build (`node scripts/build-cf.js`) en el servidor, sube `public/` y `qa-pagina.mjs` a la caja, sirve `public/` en local allí y recorre las páginas del sitemap sin fichas más 8 fichas de empresa, a 1440 y 390 px. Mide desborde horizontal, errores de consola, CLS, imágenes rotas, respuestas HTTP de error y enlaces internos rotos.
El informe se baja a `/home/wagustin/kathy_workspace/qa/qa-AAAA-MM-DD.md`. Los errores de `/api/` salen aparte, porque la API no está en la caja.

```bash
scripts/lab/qa-completo.sh
```

### `probar-rama.sh <rama>`
Prueba una rama en la caja: `npm ci`, `npm test` y `node scripts/build-cf.js`. Si la rama existe en GitHub la clona. Si no, copia la rama local: el worktree si es la rama actual (incluye cambios sin commit) o `git archive` de la rama. Nunca copia `.env`, claves ni tokens.

```bash
scripts/lab/probar-rama.sh main
```

## Operativa

- La caja se duerme tras 30 min sin uso. Un `exec` la despierta en unos 3 s.
- Cada `exec` se corta a los 60 s, aunque sea con `--stream`: lo probamos y el proceso murió. Para lo largo, lánzalo con `nohup` dentro de la caja y consulta un log o un marcador de fin (así lo hacen `qa-completo.sh` y `probar-rama.sh`).
- Las subidas de más de 1 GiB comprimido se rechazan. Para corpus grandes, empaqueta en trozos y sube cada uno con `cp`.

## Secretos

- No se copia a la caja ningún `.env`, clave, token ni credencial. El corpus se revisó antes de copiarlo y no tiene ninguno.
- Los scripts excluyen esos archivos al empaquetar ramas locales.

## Qué vuelve al repo

Solo números: `data/torneo/marcador.json` e `informe.md`, como hace el workflow. Los titulares, el corpus, los informes de QA con datos y las salidas de prueba se quedan fuera del repo.
