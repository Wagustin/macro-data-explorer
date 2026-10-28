# Marcador Oficial: Competición de Clasificadores

**Estado:** Pendiente de arbitraje humano.

El dataset histórico y la muestra oficial de 80 titulares para arbitraje han sido generados exitosamente:
- **Dataset histórico:** `eval/clasificador/historico.jsonl` (434 titulares clasificados originalmente por Laya v1).
- **Predicciones LLM:** `eval/clasificador/llm.jsonl` (116 clasificaciones paritarias con NVIDIA Nemotron / Gemini).
- **Reporte de discrepancias:** `eval/clasificador/discrepancias.md` (tasa de acuerdo y matriz de confusión).
- **Muestra para arbitraje:** `eval/clasificador/etiquetar.md` (60 discrepancias marcadas + 20 de control).
- **Clave ciega:** `eval/clasificador/clave.jsonl` (80 registros con las predicciones ocultas).
- **Criterios Laya v2:** `config/laya-criterios.json` (Versión: 2.0.0).

## Próximos pasos para completar la competición

1. **Rellenar etiquetas:** Agustín puede abrir `eval/clasificador/etiquetar.md` y completar las columnas [Relevancia, Tema, Sentimiento, Empresas], o crear `eval/clasificador/etiquetas.jsonl`.
2. **Calcular marcador:** Ejecutar localmente:
   ```bash
   node scripts/eval-classifiers.mjs --eval
   ```
   o lanzar el workflow de GitHub Actions **Competición Clasificadores: Laya vs LLM**.
3. **Resultado:** Este archivo se actualizará automáticamente con la tabla oficial de Accuracy y F1 Macro por campo, el modelo ganador y la comparación de costes y latencias.
