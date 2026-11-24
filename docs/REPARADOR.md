# Reparador automático de PerData

## Qué hace

El **reparador** es un workflow de GitHub Actions (`.github/workflows/reparar.yml`) que el vigía lanza cuando detecta un fallo de **código** (no pasajero) en CI u otros workflows. Su función es:

1. Recoger el contexto del fallo (logs, archivos relevantes)
2. Pedir a un modelo Nemotron de NVIDIA NIM un parche **mínimo**
3. Validar el diff contra barreras duras
4. Si pasa todo: aplicar, testear, commitear, abrir PR, fusionar y relanzar el workflow fallido
5. Si no pasa: salir limpio con resumen «sin reparación: <motivo>»

El reparador **no rediseña, no refactoriza, no cambia textos ni diseño, no toca datos**. Solo arregla el fallo concreto con el cambio más pequeño posible.

---

## Barreras y límites

### Rutas permitidas (barrera dura, aplicada al diff)
- `scripts/**/*.js` y `scripts/**/*.mjs` **EXCEPTO**:
  - `scripts/vigia.mjs`
  - `scripts/reparador.mjs`
  - `scripts/smv-plan-b*.sh`
  - `scripts/build-cf.js`
- `api/**/*.js` **EXCEPTO**:
  - `api/billing.js`
  - `api/auth.js`
  - `api/_lib/session.js`
  - `api/_lib/stripe.js`
  - `api/_lib/mercadopago.js`
  - `api/_lib/turnstile.js`
  - `api/_lib/users.js`
- `.github/workflows/*.yml` **EXCEPTO**:
  - `deploy.yml`
  - `rollback.yml`
  - `reparar.yml`
  - `ci.yml`
- **Se pueden AÑADIR** archivos nuevos en `test/`

### Rutas PROHIBIDAS (nunca se tocan)
- `*.html`, `*.css`
- `data/**`
- `wrangler.jsonc`
- `package.json`, `package-lock.json`
- `worker.js`, `server.js`
- `docs/**` (documentación legal)
- **Borrar o modificar tests existentes** (cualquier archivo ya existente en `test/`); borrar cualquier archivo y renombrar
- Quitar o renombrar una exportación pública (`export ...`) sin volver a declararla
- Diffs binarios

### Límites cuantitativos
- **Máximo 3 archivos** modificados por reparación
- **Máximo 60 líneas** cambiadas en total (sumando `+` y `-`)
- **No cambiar nombres de exportaciones públicas**

### Límite diario
Antes de actuar, cuenta con la API de GitHub los commits de `main` de las últimas 24 h que contengan `[reparador]`. Si no puede contarlos, no repara. Si hay **2 o más**, sale con «límite diario alcanzado».

### Modelo y fallbacks
- Modelo principal: `nvidia/nemotron-3-ultra-550b-a55b` (variable `REPARADOR_MODELO`)
- Fallback 1: `nvidia/nemotron-3.5-super-vl-120b-a12b`
- Fallback 2: `minimaxai/minimax-m3.1-flash`
- Verifica IDs existentes con `GET /v1/models` antes de usar
- Temperature 0.1, max_tokens 4000, `chat_template_kwargs: { enable_thinking: false }` para Nemotron

---

## Flujo completo

1. **Inputs**: `codigo` (catálogo), `workflow` (archivo .yml), `run_id` (run fallido)
2. **Límite diario** → si ≥ 2 reparaciones en 24h: exit 0
3. **Código CI_ROJO** → modo «deshacer»: `git revert` del último commit `[reparador]`, testea, PR+merge
4. **Recoger contexto**: `gh run view --log-failed` (o jobs API), últimas 150 líneas, extrae rutas, lee hasta 5 archivos (ventana de 400 líneas centrada en la primera línea citada)
5. **Pedir parche** al modelo con prompt de sistema estricto
6. **Parsear respuesta**:
   - `NO_REPARAR\n<motivo>` → exit 0 «sin reparación: <motivo>»
   - Diff + `---MOTIVO---\n<explicación>` → continuar
   - Basura → exit 0 «sin reparación: respuesta inválida»
7. **Validar diff** (barreras duras, límites, `git apply --check`)
8. **Aplicar en rama** `reparar/<AAAA-MM-DD>-<codigo>-<run_id>`
9. `node --check` en JS cambiados + `npm test` completo
10. Si falla (aplicar, `node --check` o `npm test`): se descarta la rama y se pide **una** segunda propuesta al modelo con el error; si vuelve a fallar → exit 0 «sin reparación: tests en rojo»
11. Si pasa: commit (autor `perdata-bot`, mensaje `fix(auto): <resumen> [reparador]`, cuerpo con motivo, trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`), push, `gh pr create`, `gh pr merge --squash --delete-branch` (sin `--admin`: si main exige revisiones o checks, la fusión falla y la rama queda subida)
12. Relanzar workflow fallido (`gh workflow run <workflow>`)
13. Si tocó `api/**`: lanzar también `deploy.yml` (smoke en producción)
14. Escribir resumen en `$GITHUB_STEP_SUMMARY`

---

## Cómo pararlo

```bash
# Desactivar el workflow (no se lanzará aunque el vigía lo intente)
gh workflow disable reparar.yml

# Para reactivarlo
gh workflow enable reparar.yml
```

---

## Cómo revisar lo que hizo

- **PRs fusionados**: buscar en GitHub PRs con `[reparador]` en el título o mensaje
- **Commits en main**: `git log --oneline --grep="\\[reparador\\]" main`
- **Runs del workflow**: `gh run list --workflow=reparar.yml`
- **Resumen de cada ejecución**: visible en la pestaña "Summary" del run del workflow `reparar.yml`

---

## Variables de entorno requeridas (en el workflow)

- `NVIDIA_API_KEY`: secret `NVIDIA_API_KEY` del repositorio
- `GH_TOKEN`: `${{ github.token }}` (automático)
- `CODIGO`, `WORKFLOW`, `RUN_ID`: inputs del workflow_dispatch

---

## Tests

`timeout 120 node --test test/reparador.test.js` (94 tests, sin red, sin gh y sin git: todo se inyecta). La suite completa es `npm test`.

## Archivos del sistema

- `.github/workflows/reparar.yml` — workflow principal
- `scripts/reparador.mjs` — lógica completa (funciones puras exportadas y testeadas)
- `test/reparador.test.js` — tests unitarios (sin red, todo simulado)
- `docs/REPARADOR.md` — esta documentación