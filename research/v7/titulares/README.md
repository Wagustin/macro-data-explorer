# V7 · D3: titulares históricos de Perú (módulo titulares)

Construye el archivo histórico de titulares de la prensa peruana desde
2019-01-01 hasta hoy (`mode=artlist`, `format=json`, `maxrecords=250`) con la
API DOC 2.0 de GDELT (`https://api.gdeltproject.org/api/v2/doc/doc`).
Los datos viven fuera del repositorio en `~/v7/data/titulares/`; el código vive
aquí. Convenciones: `~/kathy_workspace/handoff/v7/CONVENCIONES.md`.

## Qué hace

- Ventanas semanales con `startdatetime`/`enddatetime` (formato
  `AAAAmmddHHMMSS`) desde hoy hacia atrás (2026 → 2019). Si una ventana
  devuelve 250 artículos (ventana llena), se divide en subventanas más
  cortas (mitades) hasta que ninguna salga llena; si un día entero sigue
  lleno, se guarda lo obtenido y se registra en el log (sin bucle).
- Fuentes de Perú (`sourcecountry:PE`) en español. La consulta real fiable
  contra el límite de GDELT es `sourcecountry:PE` (ver «Limitaciones»);
  el filtro de economía/mercados se aplica en cliente sobre el título
  (regex con los términos del brief: dólar, tipo de cambio, BCRP, inflación,
  minería, cobre, Bolsa de Valores de Lima, Reserva Federal, aranceles,
  elecciones, Congreso, política económica, ministro de Economía, más
  próximos: oro, plata, zinc, petróleo WTI/Brent, MEF, SUNAT, presupuesto,
  precios, etc.). Solo se guarda `titulo` (fáctico), `dominio` y `url`;
  nunca el cuerpo de la nota.
- Deduplica por `url` (global entre meses y dentro de cada mes).
- Guarda `~/v7/data/titulares/AAAA-MM.jsonl`, un JSON por línea
  `{"fecha","titulo","dominio","url","idioma"}` (CONVENCIONES). `fecha` es
  la fecha UTC de `seendate` (`20261106T050000Z` → `2026-11-06`).
  `idioma` es el idioma que reporta GDELT (`Spanish`).
- Reanudable: `~/v7/data/titulares/_progreso.json` (ventanas ya terminadas)
  y `~/v7/logs/titulares.log` (registro de progreso). Si se corta, continúa
  donde iba; las líneas ya escritas no se reescriben (append + seen set).
- Descargas educadas: 15 s entre peticiones por defecto (con reintentos y
  espera creciente ante 429/503, hasta 300 s, 10 intentos por ventana).
  El brief pide 5 s; el valor 15 s + backoff es lo que evita el bloqueo
  prolongado observado (ver § Limitaciones). `--delay` permite ajustar.

## Cómo se ejecuta

Prueba de una semana (mide cuántas peticiones/día hacen falta y estima el
total completo). Se ejecuta desacoplado con `nice` y se vigila con
`tail -f ~/v7/logs/titulares.log`:

```bash
# probe: una semana reciente, mide coste
~/v7-env/bin/python research/v7/titulares/download_titulares.py --probe

# probe de una semana concreta
~/v7-env/bin/python research/v7/titulares/download_titulares.py --probe --from 2026-11-02

# descarga completa desacoplada (2019-01-01 … hoy), reanudable
cd /home/wagustin/kathy_workspace/wt-v7-titulares
setsid nohup nice -n 10 ~/v7-env/bin/python research/v7/titulares/download_titulares.py > /home/wagustin/v7/logs/titulares.out 2>&1 < /dev/null &
tail -f /home/wagustin/v7/logs/titulares.log
```

`cobertura.py` se puede ejecutar luego (también tras la descarga completa)
para regenerar la cobertura mensual:

```bash
~/v7-env/bin/python research/v7/titulares/cobertura.py
```

El `README` del módulo y estos scripts son lo que lleva el commit; los datos
(`*.jsonl`, `_progreso.json`, `_cobertura.csv`) quedan en `~/v7/data/`, fuera
de git.

## Formato de salida

`~/v7/data/titulares/AAAA-MM.jsonl` (uno por mes, ordenado por `fecha`, `url`):

```json
{"fecha": "2026-11-06", "titulo": "…", "dominio": "larepublica.pe", "url": "https://…", "idioma": "Spanish"}
```

- `fecha`: `seendate` en UTC (`AAAA-MM-DD`).
- El archivo de progreso `_progreso.json` no es dato: `done` son ventanas
  terminadas (`inicio/fin`), `last_window`/`last_error_window` indican dónde
  va y qué se rate-limtió último.

## Licencia

Ver `~/v7/data/titulares/_licencias.md` (GDELT: uso libre con cita; los
titulares son metadatos para investigación interna, no se republican).

## Medición real de esta sesión y estimación total

**Observado en esta sesión (2026-11-09):**

- Consultas amplias `sourcecountry:PE` (sin términos) con ventanas de 4 días
  y `maxrecords` 25/250 respondieron 200 con 25-68 artículos (toda la prensa,
  no solo economía).
- Consultas con términos (`sourcecountry:PE dolar`, OR-groups completas con
  `(dolar OR …)`, `language:spanish dolar`) respondieron `429 Too Many
  Requests` o `{}` vacío aun con 60-120 s de pausa entre peticiones, y el
  bloqueo persistió más de 25 min sin nuevas peticiones.
- Un probe de escritorio de 7 días (2026-11-02…08) con backoff exponencial
  5→300 s y 10 intentos nunca volvió a obtener 200: el throttle de GDELT
  opera por IP y es mucho más estricto que los «5 s» nominales cuando hay
  consultas con términos o ráfagas recientes. Resultados negativos válidos:
  documentados aquí, no silenciados.

Las cifras de coste reales quedan en `~/v7/data/titulares/_probe.json` si
el probe obtiene datos (ventanas, raw, kept, elapsed). Hasta que GDELT
vuelva a responder 200, la estimación teórica es:

- 2019-01-01 … hoy = 2 869 días = 410 semanas de 7 días.
- A 410 ventanas + splits (cada ventana llena añade +1…N peticiones) con
  15 s de spacing nominal: ≈ 410 × 15 s ≈ 1,7 h la primera pasada;
  con retries/limitación reales (60-300 s ante 429) la cifra realista es
  de **varias horas a varios días**, según el ritmo del throttle.
  `requests/día ≈ requests/semana ÷ 7`; la primera semana realista completa
  lo fija. La corrida desacoplada se deja corriendo y avanza solo cuando
  GDELT responde 200.

La forma de vigilar y reanudar está arriba. `cobertura.py` documenta la
cobertura por mes cuando la descarga termina (o en cualquier estado parcial).

## Limitaciones documentadas (resultados negativos)

1. **Throttle de GDELT por IP.** El mensaje «Please limit requests to one
   every 5 seconds…» puede significar bloqueo de horas, no 5 s. La
   estrategia por defecto (15 s + backoff hasta 300 s) está pensada para
   convivir con ello sin bloquear el servidor.
2. **Consultas con términos → 429/`{}`.** El OR-group del brief
   (`sourcecountry:PE (dolar OR …)`) no respondió en esta sesión ni con
   pausas largas. El fetch fiable es `sourcecountry:PE` y el filtro de
   economía se hace en cliente (mismo universo PHP 250 por ventana, pero
   sin pagar el coste 429 de las consultas con términos). `QUERY_LONG`
   queda documentada en el código para cuando GDELT la acepte.
3. **Ventana ancha 7 días + `maxrecords=250`.** Esas ventanas pueden
   llenarse con prensa general y diluir el filtro de economía; las
   subventanas por mitades mitigan («si llena, se divide»). El sesgo
   residual (más ruido general cuando hay pocos titulares de economía
   en una semana) se mide con la cobertura mensual, no se oculta.
4. **Idioma.** GDELT reporta `language: "Spanish"`. El filtro exige
   `Spanish` (o vacío + regex de economía en el título). Noticias en
   inglés sobre Perú quedan fuera por diseño (`sourcecountry:PE` +
   español).
