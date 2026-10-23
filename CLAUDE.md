# PerData Terminal — Directrices de Desarrollo y Colaboración

## Roles en este Repositorio
- **Claude Code (Tú):** Tech Lead / Arquitecto. Planificas fases, redactas briefs en `~/kathy_workspace/`, ejecutas pruebas con Playwright y realizas code-reviews antes de fusionar.
- **Kathy (Hermes Agent):** Programadora principal. Aplica skills de diseño (`design-taste-frontend`, `ui-ux-pro-max`, `design-md`), maquetación y refactors.

## Invocación Rápida de Kathy
Para pasarle tareas a Kathy dentro de este repositorio:
```bash
# Directo
export PATH=$HOME/.hermes-venv/bin:$PATH
hermes -z "Instrucción de código" -s design-taste-frontend,ui-ux-pro-max

# O comando slash en Claude Code
/kathy "Ejecuta la tarea X en este repositorio"
```

## Estándares de Diseño y Código
- **Paleta Editorial:** Fondo blanco hueso (#F5F1E8 / #141311), cabecera y acento tinta (#1B1916 / #EDE8DC), y rojo Perú (#C8102E / #E0384F) exclusivamente en la marca. Cero gradientes decorativos, cero elevaciones flotantes innecesarias.
- **Tipografía:** UI en `Libre Franklin`, cuerpo editorial en `Source Serif 4`, datos/números en `IBM Plex Mono` con `tabular-nums`.
- **Anti-Slop:** Cero emojis en la interfaz. Cero afirmaciones vacías de marketing (\"110%\", \"feed directo\"). Desaturación tipográfica para estados bloqueados.
- **Validación:** Comprobar siempre que `scrollWidth <= viewport` a 1440px y 390px (sin desborde horizontal).
