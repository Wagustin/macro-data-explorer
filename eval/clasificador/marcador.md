# Marcador Oficial: Competición de Clasificadores

Evaluación ciega contra arbitraje humano oficial (80 titulares etiquetados a ciegas por Claude, criterio experto de referencia (no etiquetas de usuarios); la muestra incluye 60 titulares con discrepancias, por lo que las cifras no son la precisión en producción).

## 1. Tabla Comparativa de Rendimiento

| Modelo | Campo | Accuracy | F1 Macro | Muestra | Latencia Estimada | Coste Estimado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Laya v1 (Original) | relevancia | 28.7% | 21.2% | 80 | 42 ms | $0.00 (Local CPU) |
| Laya v1 (Original) | tema | 51.2% | 50.3% | 80 | 42 ms | $0.00 (Local CPU) |
| Laya v1 (Original) | sentimiento | 35.0% | 28.0% | 80 | 42 ms | $0.00 (Local CPU) |
| Laya v1 (Original) | empresas | 98.8% | 98.8% | 80 | 42 ms | $0.00 (Local CPU) |
| LLM (Nemotron / Gemini) | relevancia | 46.3% | 44.5% | 80 | 450 ms | API Cloud ($0.002 / lote) |
| LLM (Nemotron / Gemini) | tema | 51.2% | 60.4% | 80 | 450 ms | API Cloud ($0.002 / lote) |
| LLM (Nemotron / Gemini) | sentimiento | 62.5% | 75.3% | 80 | 450 ms | API Cloud ($0.002 / lote) |
| LLM (Nemotron / Gemini) | empresas | 96.3% | 96.3% | 80 | 450 ms | API Cloud ($0.002 / lote) |
| Laya v2 (Criterios v2.1.0) | relevancia | 27.5% | 26.1% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.1.0) | tema | 51.2% | 26.4% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.1.0) | sentimiento | 33.8% | 27.2% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.1.0) | empresas | 98.8% | 98.8% | 80 | 45 ms | $0.00 (Local CPU) |

## 2. Ganador por Campo de Decisión

| Campo | Modelo Ganador (por F1 Macro) |
| :--- | :--- |
| **Relevancia** | LLM (Nemotron / Gemini) |
| **Tema** | LLM (Nemotron / Gemini) |
| **Sentimiento** | LLM (Nemotron / Gemini) |
| **Empresas** | Laya v1 (Original) |

## 3. Parámetros y Configuración
- Criterios Laya v2 utilizados: `config/laya-criterios.json` (Versión: 2.1.0).
- Modelo Laya: `convaiinnovations/laya` (subfolder: `typed-decisions`).
- Modelo LLM: `nvidia/nemotron-3-ultra-550b-a55b` (fallback `models/gemini-2.5-flash`).
- Fecha de reporte: 2026-10-28.

## 3. Decisión (28-oct-2026)

Prueba limpia sobre 40 titulares reservados (criterios de Laya v2.1.0 ajustados solo con los otros 40), exactitud:

| Campo | Laya v1 | Laya v2.1 | Modelo de lenguaje |
| :--- | :--- | :--- | :--- |
| Relevancia | 30% | 30% | 50% |
| Tema | 42% | 45% | 55% |
| Sentimiento | 22% | 25% | 55% |

El modelo de lenguaje clasifica relevancia, tema y sentimiento; Laya no mejora con instrucciones y se queda sin tarea de clasificación. La detección de empresas es por nombre y da el mismo resultado en todos. Con 40 titulares la diferencia entre tema (45% y 55%) es ruido; la de sentimiento y relevancia no.
