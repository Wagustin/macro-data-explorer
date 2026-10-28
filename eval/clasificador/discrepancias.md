# Reporte de Discrepancias: Laya v1 vs. LLM

Dataset evaluado: 116 titulares clasificados concurrentemente por Laya v1 (histórico) y el modelo de lenguaje (NVIDIA Nemotron / Gemini).

## 1. Tasas de Acuerdo Global y por Campo

| Campo | Coincidencias | Total Evaluado | Tasa de Acuerdo |
| :--- | :--- | :--- | :--- |
| Relevancia | 39 | 116 | 33.6% |
| Tema | 50 | 116 | 43.1% |
| Sentimiento | 40 | 116 | 34.5% |
| Empresas detectadas | 109 | 116 | 94.0% |
| **Acuerdo total (4 campos)** | **6** | **116** | **5.2%** |

### Observaciones de Paridad
- En sentimiento, Laya v1 tendía a clasificar gran parte de las noticias como POSITIVO, mientras que el LLM discrimina con mayor rigor noticias de inflación o impacto macro negativo.
- En empresas, la tasa de coincidencia es elevada porque la mayoría de titulares no mencionan empresas cotizadas, pero cuando aparecen emisores, el LLM demostró capturar alias contextuales.
- El acuerdo total en los 4 campos es de solo 5.2%, lo que demuestra visiones marcadamente divergentes y justifica plenamente el arbitraje humano.

## 2. Matriz de Confusión de Sentimiento (Laya filas vs. LLM columnas)

| Laya v1 \ LLM | POSITIVO | NEGATIVO | NEUTRO | OTRO/NULO | Total Laya |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POSITIVO** | 32 | 4 | 41 | 9 | 86 |
| **NEGATIVO** | 4 | 3 | 10 | 3 | 20 |
| **NEUTRO** | 1 | 2 | 5 | 2 | 10 |
| **OTRO/NULO** | 0 | 0 | 0 | 0 | 0 |

## 3. Las 20 Discrepancias Más Significativas

A continuación se listan los 20 casos con mayor divergencia en relevancia y polaridad de sentimiento:

| N° | ID | Titular | Laya v1 | LLM | Severidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `infobae-ff5d5a24fa` | Perupetro adjudica bloque a SPT Energy con inversión de USD 400 millones, ¿cuántos barriles producirá? | Rel: BAJA, Sent: NEGATIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: POSITIVO, Tema: Energía | Puntos: 8 |
| 2 | `andina-8293d287c1` | Exportaciones peruanas romperían la barrera de los US$ 110,000 millones en el 2026 | Rel: BAJA, Sent: NEGATIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: POSITIVO, Tema: Economía y fiscal | Puntos: 7 |
| 3 | `la_republica-52977df9b0` | Techo Propio: presupuesto para 2027 plantea recortar 53% los subsidios para comprar vivienda | Rel: BAJA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: NEGATIVO, Tema: Economía y fiscal | Puntos: 7 |
| 4 | `gestion-bcb513e2cd` | Visita del Papa impulsa inversión por más de S/ 6 millones en hotel casino de Chiclayo | Rel: MEDIA, Sent: NEGATIVO, Tema: Otros | Rel: BAJA, Sent: POSITIVO, Tema: Economía y fiscal | Puntos: 6 |
| 5 | `andina-c23cd1f56d` | Gobierno publica proyecto de reglamento de turismo de aventura | Rel: ALTA, Sent: POSITIVO, Tema: Otros | Rel: NINGUNA, Sent: -, Tema: - | Puntos: 5 |
| 6 | `gestion-3a234bee0f` | Del K-Beauty al K-Fragrance: la apuesta de la colombiana Recaminer para crecer en el Perú | Rel: ALTA, Sent: POSITIVO, Tema: Bolsa y empresas | Rel: BAJA, Sent: NEUTRO, Tema: Economía y fiscal | Puntos: 5 |
| 7 | `gestion-918091149f` | Leyes que elevan gasto del Estado: ¿qué dice el MEF sobre las dos que más preocupan? | Rel: MEDIA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: NEGATIVO, Tema: Economía y fiscal | Puntos: 5 |
| 8 | `infobae-34b8322a07` | Ley de gratificación CAS: TC admite demanda de inconstitucionalidad contra parte de la norma | Rel: ALTA, Sent: NEGATIVO, Tema: Dólar y BCRP | Rel: NINGUNA, Sent: -, Tema: - | Puntos: 5 |
| 9 | `infobae-5b04323cec` | Intoxicación masiva por rotavirus en Ate: 25 afectados por consumir alimentos en una cadena de comida rápida | Rel: ALTA, Sent: NEGATIVO, Tema: Bolsa y empresas | Rel: NINGUNA, Sent: -, Tema: - | Puntos: 5 |
| 10 | `infobae-a56db6b3d3` | Denuncian presuntas larvas en conservas destinadas a escolares de Tarma: investigan el estado de los alimentos | Rel: ALTA, Sent: NEUTRO, Tema: Economía y fiscal | Rel: NINGUNA, Sent: -, Tema: - | Puntos: 5 |
| 11 | `la_republica-165a247b64` | Agroexportaciones superan los US$8.300 millones, pero crecen 2,3%: tres frutas lideran los envíos | Rel: MEDIA, Sent: NEGATIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: POSITIVO, Tema: Economía y fiscal | Puntos: 5 |
| 12 | `rpp-85846d73f1` | Argentina: dólar blue hoy a cuánto cotiza este martes 27 de octubre | Rel: ALTA, Sent: POSITIVO, Tema: Dólar y BCRP | Rel: BAJA, Sent: NEUTRO, Tema: Mundo | Puntos: 5 |
| 13 | `el_comercio-02dfe06955` | ProInversión en inPerú: “El plan específico para Talara se presentará en enero de 2027” | Rel: MEDIA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: NEUTRO, Tema: Energía | Puntos: 4 |
| 14 | `gestion-4b8a4cf54e` | Respaldo de sistemas: ¿cuánto deben invertir las empresas para evitar paralizar sus operaciones? | Rel: ALTA, Sent: POSITIVO, Tema: Bolsa y empresas | Rel: BAJA, Sent: NEUTRO, Tema: Bolsa y empresas | Puntos: 4 |
| 15 | `gestion-4bff3df007` | Agro en Perú “temblaría” más allá del verano 2027 por El Niño: esto alerta el Midagri | Rel: MEDIA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: MEDIA, Sent: NEGATIVO, Tema: Economía y fiscal | Puntos: 4 |
| 16 | `infobae-472d760abc` | Cronograma de pagos de noviembre 2026 del Banco de la Nación: Las fechas para remuneraciones y pensiones | Rel: ALTA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: BAJA, Sent: NEUTRO, Tema: Economía y fiscal | Puntos: 4 |
| 17 | `rpp-64fec69e35` | Inversión en ecosistemas altoandinos: la clave para asegurar el agua y mitigar el impacto de El Niño | Rel: MEDIA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: ALTA, Sent: NEUTRO, Tema: Bolsa y empresas | Puntos: 4 |
| 18 | `rpp-f255ead7db` | Fenómeno El Niño: Conveagro advierte que aumento de temperaturas pondrá en riesgo producción agrícola | Rel: MEDIA, Sent: POSITIVO, Tema: Economía y fiscal | Rel: MEDIA, Sent: NEGATIVO, Tema: Economía y fiscal | Puntos: 4 |
| 19 | `andina-3de9fd3e64` | Productores agrarios cuentan con Seguro Agrícola Catastrófico: cubre S/1,000 por hectárea | Rel: ALTA, Sent: NEGATIVO, Tema: Minería y metales | Rel: MEDIA, Sent: NEUTRO, Tema: Economía y fiscal | Puntos: 3 |
| 20 | `andina-7fdf0915cb` | Sunarp amplía inscripción digital a vehículos fabricados y ensamblados en el Perú | Rel: MEDIA, Sent: POSITIVO, Tema: Otros | Rel: NINGUNA, Sent: -, Tema: - | Puntos: 3 |
