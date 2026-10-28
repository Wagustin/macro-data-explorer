# Marcador Oficial: Competición de Clasificadores

Evaluación ciega contra arbitraje humano oficial (80 titulares etiquetados por Agustín).

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
| Laya v2 (Criterios v2.0.0) | relevancia | 46.3% | 19.2% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.0.0) | tema | 33.8% | 24.1% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.0.0) | sentimiento | 52.5% | 48.7% | 80 | 45 ms | $0.00 (Local CPU) |
| Laya v2 (Criterios v2.0.0) | empresas | 98.8% | 98.8% | 80 | 45 ms | $0.00 (Local CPU) |

## 2. Ganador por Campo de Decisión

| Campo | Modelo Ganador (por F1 Macro) |
| :--- | :--- |
| **Relevancia** | LLM (Nemotron / Gemini) |
| **Tema** | LLM (Nemotron / Gemini) |
| **Sentimiento** | LLM (Nemotron / Gemini) |
| **Empresas** | Laya v1 (Original) |

## 3. Parámetros y Configuración
- Criterios Laya v2 utilizados: `config/laya-criterios.json` (Versión: 2.0.0).
- Modelo Laya: `convaiinnovations/laya` (subfolder: `typed-decisions`).
- Modelo LLM: `nvidia/nemotron-3-ultra-550b-a55b` (fallback `models/gemini-2.5-flash`).
- Fecha de reporte: 2026-10-28.
