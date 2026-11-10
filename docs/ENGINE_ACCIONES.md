# Engine Acciones - Rangos semanales y mensuales

Generado: 2026-11-10T07:17:01Z  
Último día calendario: 2026-11-09  
Valores totales: 60  
Publicables semana: 45  
Publicables mes: 39  

## Validación fuera de muestra (2025-2026)

| Valor | Horizonte (h) | Cortes prueba | Cobertura 80% | Ancho 80% mediano | Score 80 |
|-------|---------------|---------------|---------------|-------------------|----------|
| ALICORC1 | 5 (semana) | 439 | 82.46 | 7.13 | 0.1062 |
| ALICORC1 | 21 (mes) | 423 | 80.38 | 16.94 | 0.2757 |
| BVN | 5 (semana) | 439 | 74.72 | 14.37 | 0.2431 |
| FERREYC1 | 5 (semana) | 439 | 72.89 | 5.64 | 0.1063 |
| SCCO | 21 (mes) | 423 | 83.92 | 32.98 | 0.4242 |
| VOLCABC1 | 5 (semana) | 439 | 77.68 | 14.96 | 0.2746 |
| LUSURC1 | 21 (mes) | 423 | 86.29 | 13.66 | 0.2069 |
| BACKUBC1 | 5 (semana) | 439 | 81.09 | 5.29 | 0.1163 |

## Notas

- Todos los valores coinciden con la validación de referencia (Python) dentro de tolerancia ±0.3.
- FERREYC1 semana y LUSURC1 mes no son publicables por cobertura fuera de rango [74%, 86%].
- El motor usa EWMA λ=0.97, cuantil inverted_cdf, ventana 756 días, K expansivo sin fuga (nprev ≥ 250).
- Regla de publicación: ≥ 100 cortes de prueba Y cobertura 80% ∈ [74%, 86%].