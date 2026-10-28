# Muestra de Arbitraje Humano (80 Titulares)

Este documento contiene la muestra oficial de 80 titulares seleccionados para el arbitraje ciego:
- **60 titulares** con discrepancias marcadas entre Laya v1 y el modelo de lenguaje.
- **20 titulares** de control donde ambos modelos coincidieron.

## Instrucciones para el Árbitro (Agustín)

Puedes etiquetar de dos formas:

### Opción A (Recomendada): Editar directamente esta tabla Markdown
Rellena las cuatro columnas vacías de cada fila según las reglas:
1. **Relevancia:** Escribe exactamente `ALTA`, `MEDIA`, `BAJA` o `NINGUNA`.
   - *ALTA:* Mueve mercados peruanos (dólar, bolsa, metales, tasas) o globales (Fed, EE.UU., China, inflación global).
   - *MEDIA:* Presupuesto, impuestos, inversiones corporativas, comercio sectorial.
   - *BAJA:* Impacto económico marginal o indirecto.
   - *NINGUNA:* Sin efecto económico (policial, farándula, deportes, procesiones).
2. **Tema:** Uno de: `Dólar y BCRP`, `Economía y fiscal`, `Minería y metales`, `Bolsa y empresas`, `Energía`, `Mundo`.
3. **Sentimiento:** `POSITIVO`, `NEGATIVO` o `NEUTRO` para la economía y mercados peruanos (no para la persona de la noticia). Subida de inflación o caída del cobre = NEGATIVO. Aumento de inversión o exportaciones = POSITIVO.
4. **Empresas:** Nemónicos separados por coma (ej. `ALICORC1`, `BAP`, `SCCO`) o dejar en blanco si no aplica.

### Opción B: Crear o editar el archivo `eval/clasificador/etiquetas.jsonl`
Si prefieres formato estructurado, escribe en `eval/clasificador/etiquetas.jsonl` una línea JSON por titular:
```json
{"id": "...", "relevancia": "ALTA", "tema": "Economía y fiscal", "sentimiento": "POSITIVO", "empresas": ["ALICORC1"]}
```

Una vez rellenadas las filas, ejecuta:
```bash
node scripts/eval-classifiers.mjs --eval
```
O lanza el workflow de GitHub Actions **Competición Clasificadores: Laya vs LLM**.

---

## Tabla de Etiquetado

| N° | ID | Titular | Fuente | Fecha | Relevancia | Tema | Sentimiento | Empresas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `andina-0d3c478379` | CADE Ejecutivos 2026 reunirá a inversionistas para impulsar capitales en regiones | Agencia Andina | 2026-10-27 |  |  |  |  |
| 2 | `andina-25ff393818` | CCL destaca intervención del Gobierno contra la criminalidad organizada desde los penales | Agencia Andina | 2026-10-27 |  |  |  |  |
| 3 | `andina-33dfdb9ef5` | Perupetro otorga buena pro del lote 207 con inversiones del orden de los US$ 400 millones | Agencia Andina | 2026-10-27 |  |  |  |  |
| 4 | `andina-3de9fd3e64` | Productores agrarios cuentan con Seguro Agrícola Catastrófico: cubre S/1,000 por hectárea | Agencia Andina | 2026-10-27 |  |  |  |  |
| 5 | `andina-7fdf0915cb` | Sunarp amplía inscripción digital a vehículos fabricados y ensamblados en el Perú | Agencia Andina | 2026-10-27 |  |  |  |  |
| 6 | `andina-8293d287c1` | Exportaciones peruanas romperían la barrera de los US$ 110,000 millones en el 2026 | Agencia Andina | 2026-10-27 |  |  |  |  |
| 7 | `andina-85b8cabcc4` | Cronograma de pagos 2026 de sueldos en el Estado peruano | Agencia Andina | 2026-10-27 |  |  |  |  |
| 8 | `andina-918a9c26af` | Fondepes acelera desembarcadero de Pucusana y garantiza entrega a fines de noviembre | Agencia Andina | 2026-10-27 |  |  |  |  |
| 9 | `andina-9f5b4573d3` | Gobierno transfiere más de 71,000 m2 de terrenos para modernizar puerto de Chimbote | Agencia Andina | 2026-10-27 |  |  |  |  |
| 10 | `andina-b2f1e2e8ad` | Midagri: bajan precios de alimentos en mercado mayorista de Lima ante mayor abastecimiento | Agencia Andina | 2026-10-27 |  |  |  |  |
| 11 | `andina-c23cd1f56d` | Gobierno publica proyecto de reglamento de turismo de aventura | Agencia Andina | 2026-10-27 |  |  |  |  |
| 12 | `andina-c4fb9459e2` | Halloween y Día de la Canción Criolla: celebraciones duplicarían pedidos por delivery | Agencia Andina | 2026-10-27 |  |  |  |  |
| 13 | `andina-f4bbc05c7f` | Bolsa de Valores de Lima presenta índices mixtos al inicio al igual que Wall Street | Agencia Andina | 2026-10-27 |  |  |  |  |
| 14 | `bloomberg_linea-2073f10197` | Detalles que debe saber si quiere invertir en Anthropic tras su salida al Nasdaq | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 15 | `bloomberg_linea-6fddd629fa` | Estados Unidos concederá visados a Flávio Bolsonaro y su familia tras huir de Brasil | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 16 | `bloomberg_linea-81004c48bd` | Pedidos de bienes duraderos en EE.UU. suben 1,8% en septiembre por repunte de aviones | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 17 | `bloomberg_linea-875ac9467b` | Google presenta Genie 4, una versión mejorada de su IA para crear mundos virtuales | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 18 | `bloomberg_linea-8a573a28c1` | Lula ganó las elecciones de Brasil y estos son los ajustes que deberá hacer desde 2027 | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 19 | `bloomberg_linea-9bd99286a2` | Confianza del consumidor en EE.UU. aumenta por primera vez en cuatro meses | Bloomberg Línea | 2026-10-27 |  |  |  |  |
| 20 | `el_comercio-02dfe06955` | ProInversión en inPerú: “El plan específico para Talara se presentará en enero de 2027” | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 21 | `el_comercio-11a729f1ae` | Smart Fit: “Vamos a abrir un nuevo Bio Ritmo, nuestro gimnasio premium, en San Isidro y ampliaremos Smart Fit en Cusco” | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 22 | `el_comercio-181b6292c9` | Precio del dólar del martes 27 de octubre: cuál fue el cierre del tipo de cambio | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 23 | `el_comercio-266822c978` | Perú-Petro otorga buena pro del Lote 207 con inversiones del orden en los US$400 millones | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 24 | `el_comercio-3eac40bf26` | Sky y GOL amplían la conectividad entre Perú, Chile y Brasil con acuerdo de código compartido | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 25 | `el_comercio-4bd90560e9` | La inexorable aritmética fiscal | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 26 | `el_comercio-53fc475117` | Air Canada retoma sus vuelos directos entre Lima, Toronto y Montreal con cuatro frecuencias semanales | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 27 | `el_comercio-6482cb4620` | InPerú: ProInversión se reúne con bonistas de Petro-Perú | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 28 | `el_comercio-8a356c8953` | El dólar abre a la baja en S/3,43 pero repunta ante mayor demanda en el mercado local | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 29 | `el_comercio-9cc1286a70` | Negocios aumentan hasta 20% su inversión para Halloween y el Día de la Canción Criolla, ¿será una buena campaña de ‘dulce o truco’ y jarana? | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 30 | `el_comercio-9f9e17a2f4` | DLA Piper: “Este es un momento sin precedentes para el sistema financiero” | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 31 | `el_comercio-b32302d3ca` | CTS de noviembre: conoce quiénes la reciben, cómo se calcula y hasta cuándo se puede retirar | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 32 | `el_comercio-b8a9d21103` | Wall Street abre mixto con el Dow Jones plano y avances del Nasdaq | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 33 | `el_comercio-e453bfb5c3` | Cafeína, el nuevo proyecto de un conocido grupo gastronómico peruano, va por su cuarto local en el Boulevard de Asia: así alista su expansión y cómo se prepara ante El Niño | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 34 | `el_comercio-ed65b95a66` | La 60ª Asamblea Anual de Felaban en Lima reunirá a más de 2.000 líderes financieros de 54 países | El Comercio Economía | 2026-10-27 |  |  |  |  |
| 35 | `gestion-008bc01672` | Mercados e indicadores – Hoy martes 27 de octubre | Gestión | 2026-10-27 |  |  |  |  |
| 36 | `gestion-0a80d96769` | Tipo de cambio hoy en Perú: ¿en cuánto cerró el dólar este martes 27 de octubre? | Gestión | 2026-10-27 |  |  |  |  |
| 37 | `gestion-1c84750ba8` | Perú y Brasil: qué le vendemos al gigante sudamericano, nuestro principal socio en la región | Gestión | 2026-10-27 |  |  |  |  |
| 38 | `gestion-241826e9be` | Cadena mexicana de tecnología Steren apuesta por B2B y busca más tiendas en Perú al 2030 | Gestión | 2026-10-28 |  |  |  |  |
| 39 | `gestion-28a627515d` | ¿Paradoja del oro se “fortalece”? Producción sigue en picada, pero exportación está fuerte | Gestión | 2026-10-28 |  |  |  |  |
| 40 | `gestion-2a72b40f74` | Atún: Florida duplica su stock ante El Niño y va por récord de 2 millones de cajas | Gestión | 2026-10-27 |  |  |  |  |
| 41 | `gestion-3a234bee0f` | Del K-Beauty al K-Fragrance: la apuesta de la colombiana Recaminer para crecer en el Perú | Gestión | 2026-10-27 |  |  |  |  |
| 42 | `gestion-43bcca6bc4` | Guillermo Shinno sobre ampliación del Reinfo: “Es decisión del Congreso” | Gestión | 2026-10-27 |  |  |  |  |
| 43 | `gestion-4b8a4cf54e` | Respaldo de sistemas: ¿cuánto deben invertir las empresas para evitar paralizar sus operaciones? | Gestión | 2026-10-27 |  |  |  |  |
| 44 | `gestion-4bff3df007` | Agro en Perú “temblaría” más allá del verano 2027 por El Niño: esto alerta el Midagri | Gestión | 2026-10-27 |  |  |  |  |
| 45 | `gestion-54695633de` | Proveedor peruano de infraestructura para centros de datos apunta a crecer en Chile y Ecuador | Gestión | 2026-10-28 |  |  |  |  |
| 46 | `gestion-5ebb30c824` | Entre el cierre y éxodo: peluquerías huyen ante inseguridad y cadenas se frenan | Gestión | 2026-10-27 |  |  |  |  |
| 47 | `gestion-6c01a01d86` | Sunat apuntará a deudores tributarios por IGV: traza meta de reducir monto a la mitad al 2030 | Gestión | 2026-10-27 |  |  |  |  |
| 48 | `gestion-7d37a3a12e` | La Alcoholería se expande con nuevas tiendas y hotel | Gestión | 2026-10-28 |  |  |  |  |
| 49 | `gestion-800769fbf4` | ISA Energía alista ocho proyectos en Perú y busca ‘segundo ciclo’ para sus concesiones | Gestión | 2026-10-28 |  |  |  |  |
| 50 | `gestion-918091149f` | Leyes que elevan gasto del Estado: ¿qué dice el MEF sobre las dos que más preocupan? | Gestión | 2026-10-27 |  |  |  |  |
| 51 | `gestion-ac64eecf86` | Grupo chino Sungrow busca crecer en Perú: prevé planta solar de US$ 323 millones en Piura | Gestión | 2026-10-27 |  |  |  |  |
| 52 | `gestion-bcb513e2cd` | Visita del Papa impulsa inversión por más de S/ 6 millones en hotel casino de Chiclayo | Gestión | 2026-10-27 |  |  |  |  |
| 53 | `gestion-cf1ad6281e` | Días no laborables: ¿te pueden sancionar si faltas al trabajo por ir a ver al Papa? | Gestión | 2026-10-27 |  |  |  |  |
| 54 | `gestion-d10656c1b5` | Ley MAPE: así será incentivo para que concesionarios firmen convenios con mineros informales | Gestión | 2026-10-28 |  |  |  |  |
| 55 | `gestion-d7102fc043` | Minsur, del Grupo Breca, plantea reaprovechar relaves y nuevas exploraciones en San Rafael | Gestión | 2026-10-27 |  |  |  |  |
| 56 | `gestion-d8a1108efb` | Urbana Perú vuelve a Lima Top e invertirá S/ 100 mlls. al año en terrenos: ¿dónde? | Gestión | 2026-10-28 |  |  |  |  |
| 57 | `gestion-fae729d42d` | Mercado de videojuegos en Perú moverá US$ 382 millones en 2030: ¿qué segmento retrocede? | Gestión | 2026-10-27 |  |  |  |  |
| 58 | `infobae-34b8322a07` | Ley de gratificación CAS: TC admite demanda de inconstitucionalidad contra parte de la norma | Infobae Perú | 2026-10-27 |  |  |  |  |
| 59 | `infobae-3cf5fdd6d3` | Cautelares, arbitraje y compraventa: cómo un conflicto entre accionistas puede incidir en una operación corporativa | Infobae Perú | 2026-10-27 |  |  |  |  |
| 60 | `infobae-4694659013` | La casa más estrecha de Perú busca entrar al récord Guinness: así es la vivienda de 63 centímetros de ancho en Huaral | Infobae Perú | 2026-10-27 |  |  |  |  |
| 61 | `infobae-472d760abc` | Cronograma de pagos de noviembre 2026 del Banco de la Nación: Las fechas para remuneraciones y pensiones | Infobae Perú | 2026-10-27 |  |  |  |  |
| 62 | `infobae-5693195c3d` | ¿Qué dispositivos tecnológicos ayudan a monitorear el fenómeno El Niño? | Infobae Perú | 2026-10-27 |  |  |  |  |
| 63 | `infobae-5b04323cec` | Intoxicación masiva por rotavirus en Ate: 25 afectados por consumir alimentos en una cadena de comida rápida | Infobae Perú | 2026-10-27 |  |  |  |  |
| 64 | `infobae-5e01175f69` | Los peruanos confían más en el ChatGPT o influencers que en sus políticos, policías y jueces, según Ipsos | Infobae Perú | 2026-10-27 |  |  |  |  |
| 65 | `infobae-860027a8e3` | Melcochita en la mira de la Sunat después de comprar departamento a nombre de Heydi Amado, su novia de 22 años | Infobae Perú | 2026-10-27 |  |  |  |  |
| 66 | `infobae-8ba7110920` | La gasolina más barata y más cara de Lima este 27 de octubre | Infobae Perú | 2026-10-27 |  |  |  |  |
| 67 | `infobae-a56db6b3d3` | Denuncian presuntas larvas en conservas destinadas a escolares de Tarma: investigan el estado de los alimentos | Infobae Perú | 2026-10-27 |  |  |  |  |
| 68 | `infobae-a625ff8d74` | Bloques, voluntarios, ambulancias y puntos de hidratación: así preparan Las Palmas para recibir a 1,2 millones que verán al Papa León XIV | Infobae Perú | 2026-10-27 |  |  |  |  |
| 69 | `infobae-bde04d3781` | Reintegro 6 del Fonavi no se pagará en octubre: Aplazan pago indefinidamente por demora del MEF | Infobae Perú | 2026-10-27 |  |  |  |  |
| 70 | `infobae-c08ac0dd6b` | Fonavi: Lista 23 incluirá a prestatarios de conexiones de electricidad y saneamiento | Infobae Perú | 2026-10-27 |  |  |  |  |
| 71 | `infobae-d9d596c03f` | MINCETUR: el 45% de turistas considera inseguro el turismo de aventura en Perú y uno de cada tres se sintió en peligro | Infobae Perú | 2026-10-27 |  |  |  |  |
| 72 | `infobae-ff5d5a24fa` | Perupetro adjudica bloque a SPT Energy con inversión de USD 400 millones, ¿cuántos barriles producirá? | Infobae Perú | 2026-10-27 |  |  |  |  |
| 73 | `la_republica-165a247b64` | Agroexportaciones superan los US$8.300 millones, pero crecen 2,3%: tres frutas lideran los envíos | La República Economía | 2026-10-27 |  |  |  |  |
| 74 | `la_republica-52977df9b0` | Techo Propio: presupuesto para 2027 plantea recortar 53% los subsidios para comprar vivienda | La República Economía | 2026-10-27 |  |  |  |  |
| 75 | `rpp-160019b1bd` | Flávio Bolsonaro está camino a Estados Unidos pese a prohibición de la justicia, según medios brasileños | RPP Noticias | 2026-10-27 |  |  |  |  |
| 76 | `rpp-5c99e67b88` | Alarma en el Cercado de Lima: incendio se registró en edificio cerca del Barrio Chino [VIDEO] | RPP Noticias | 2026-10-27 |  |  |  |  |
| 77 | `rpp-64fec69e35` | Inversión en ecosistemas altoandinos: la clave para asegurar el agua y mitigar el impacto de El Niño | RPP Noticias | 2026-10-27 |  |  |  |  |
| 78 | `rpp-85846d73f1` | Argentina: dólar blue hoy a cuánto cotiza este martes 27 de octubre | RPP Noticias | 2026-10-27 |  |  |  |  |
| 79 | `rpp-c834001a30` | Donald Trump afirma que Estados Unidos recibirá un millón de barriles de petróleo de Venezuela | RPP Noticias | 2026-10-27 |  |  |  |  |
| 80 | `rpp-f255ead7db` | Fenómeno El Niño: Conveagro advierte que aumento de temperaturas pondrá en riesgo producción agrícola | RPP Noticias | 2026-10-27 |  |  |  |  |
