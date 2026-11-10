# V7 · D2: variables externas que mueven el sol (módulo externos)

Descarga series diarias públicas y gratuitas desde 2005 (o desde que
existan) de FRED vía el endpoint
`https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>` (sin clave),
con el complemento opcional del portal del Tesoro de EE. UU.
(treasury.gov) documentado. Los datos viven fuera del repositorio en
`~/v7/data/externos/`; el código vive aquí. Convenciones:
`~/kathy_workspace/handoff/v7/CONVENCIONES.md`.

## Qué hace

- Descarga 24 series de FRED (dólar amplio, curva del Tesoro completa,
  spreads de tipos, inflación implícita, VIX, petróleo WTI y Brent,
  tipos de cambio regionales y de las principales divisas, y el cobre
  mensual del FMI) y las guarda como `~/v7/data/externos/<ID>.csv` con
  cabecera `fecha,valor,fecha_disponible` (CONVENCIONES).
- Valores `.` de FRED se descartan (sin dato); los CSV usan
  `repr(float)` para no perder precisión; nunca se escribe una fecha
  posterior a hoy (`END` = hoy, por corte anti-futuro del motor V7).
- `fecha_disponible` para diarias = **día hábil siguiente** a `fecha`
  (brief); para la mensual (`PCOPPUSDM`) = primer día del mes
  siguiente (el promedio mensual no se conoce hasta que el mes cierra).
- Escribe `~/v7/data/externos/_indice.csv` (`id,nombre,unidad,fuente,
  frecuencia,primera_fecha,ultima_fecha,n_puntos,rezago_disponibilidad_dias,
  nota`) y `~/v7/data/externos/_licencias.md` (fuente por serie con
  su etiqueta FRED y si puede usarse en producción comercial).
- Reanudable: cada CSV se escribe atómicamente (`<id>.csv.tmp` →
  `<id>.csv`, `os.replace`); en una corrida completa las series cuyo
  CSV ya llega a hoy se reutilizan sin volver a descargar. Descargas
  educadas: ~1 s entre peticiones, reintentos con espera creciente
  (×2, 5 intentos, 404 terminal), registro en `~/v7/logs/externos.log`.
- Solo biblioteca estándar de Python (`urllib, csv, datetime`); sin
  dependencias.

## Cómo se ejecuta

Verificación rápida de una franja reciente (~1 min):

```
~/v7-env/bin/python research/v7/externos/download_externos.py --probe
```

Descarga completa y reanudable (desde 2005 o antes, 24 series).
Se ejecuta desacoplado con `nice` y se vigila con
`tail -f ~/v7/logs/externos.log`:

```
cd /home/wagustin/kathy_workspace/wt-v7-externos
setsid nohup ~/v7-env/bin/python research/v7/externos/download_externos.py > /home/wagustin/v7/logs/externos.out 2>&1 < /dev/null &
tail -f /home/wagustin/v7/logs/externos.log
```

Para reejecutar una sola serie tras un código roto:

```
~/v7-env/bin/python research/v7/externos/download_externos.py --only DTWEXBGS,DGS10
```

Validación tras una corrida:

```
~/v7-env/bin/python -m py_compile research/v7/externos/download_externos.py
head -3 ~/v7/data/externos/DTWEXBGS.csv
cat ~/v7/data/externos/_indice.csv
```

## Formato de salida (`~/v7/data/externos/<ID>.csv`)

`fecha,valor,fecha_disponible` (fechas ISO `AAAA-MM-DD`, UTC).
Diarias: disponibilidad el día hábil siguiente (solo calendario:
si el día siguiente cae en fin de semana, se pasa al lunes; los
feriados de Perú/EE. UU. no se modelan en el día de disponibilidad,
igual que el módulo bcrp). Mensual: primer día del mes siguiente.
El índice `_indice.csv` tiene el mismo esquema que el de bcrp más
`fuente` (la fuente de la página de la serie).

## Series y cobertura (endpoint fredgraph.csv)

| id | Frecuencia | Cobertura encontrada |
|---|---|---|
| DTWEXBGS (índice amplio del dólar, Fed H.10) | diaria | 2006-01-02–hoy |
| DGS10, DGS2, DGS1, DGS5, DGS7, DGS20, DGS30 (curva del Tesoro, Fed H.15) | diaria | 1962–hoy (desde 2005 en este módulo) |
| T10Y2Y (spread 10a-2a, St. Louis) | diaria | 1976–hoy |
| DFF (tasa efectiva Fed, Fed H.15) | diaria | 1954–hoy |
| DFII10 (tasa real 10a, Fed H.15) | diaria | 2003–hoy |
| T10YIE (breakeven 10a, St. Louis) | diaria | 2003–hoy |
| VIXCLS (VIX, CBOE) | diaria | 1990–hoy |
| DCOILWTICO, DCOILBRENTEU (WTI y Brent spot, EIA) | diaria | 1986 / 1987–hoy |
| DEXBZUS, DEXMXUS (reales y pesos, Fed H.10) | diaria | 1995-01-02 / 1993-11-08–hoy |
| DEXCAUS, DEXCHUS, DEXINUS, DEXJPUS, DEXUSUK, DEXNOUS, DEXUSNZ (Fed H.10) | diaria | 1971–hoy según serie |
| PCOPPUSDM (cobre global, FMI) | mensual | 1992-01-01–mes en curso |

Las 13 series del brief están todas; las 11 extra (resto de la
curva del Tesoro, DFII10 y los pares G7/regional faltantes de H.10) se añaden porque comparten la misma fuente
pública y porque la curva completa y el par chino/candiense son las
covariables con más sentido para un sol peruano. Criterio: ~1-2 s
entre peticiones; todo lo que FRED sirve de forma estable entra,
lo demás queda documentado abajo.

## Tesoro de EE. UU. (complemento de dominio público)

Las yield curves diarias del portal de Interest Rate Statistics de
treasury.gov son obra del Gobierno de EE. UU. (dominio público,
17 U.S.C. § 105) con cita. FRED H.15 republica exactamente esa misma
curva (metodología del Tesoro vía la Fed de Nueva York), así que
este módulo no duplica la descarga — H.15 ya es la vía de dominio
público. La tentativa directa al portal se probó en sesión:
`home.treasury.gov` falla con tiempo de espera (404/timeout) y
`data.treasury.gov` sirve una página renderizada con JavaScript sin
CSV estable (sin `<table>` ni enlace de descarga en el HTML
recibido), por lo que un fetch directo fiable tardaría en
mantener un scraper frágil. Se documenta como resultado negativo,
no como serie descargada.

## Limitaciones documentadas (resultados negativos)

- **Sin spread de mercados emergentes en FRED con licencia libre:**
  no existe en FRED (sin clave) un EMBI/spread EM de dominio público
  con cobertura desde 2005. Los candidatos con spread crediticio
  (ICE BofA, p. ej. BAMLC0A0CM) son de Ice Data Indices con
  «Copyrighted: Pre-approval required», y además FRED aviso que
  desde abril de 2026 la serie conserva 3 años (2023-11-07–hoy,
  795 puntos, inútil para 2005–hoy). Por eso queda excluido con
  fila en `_indice.csv` y entrada en `_licencias.md`, sin CSV.
- **T5YIFR (5-Year, 5-Year Forward Inflation Expectation Rate)**
  existe en FRED (St. Louis, citation required), pero es redundante
  con T10YIE para el motor: documentado sin descargar, con fila en
  `_indice.csv` y nota, para que no se confunda con un olvido.
- **Valores `.` (missing) de FRED**: se descartan; por eso las
  diarias tienen huecos reales en feriados de EE. UU. y en períodos
  sin publicación (p. ej. T10Y2Y/DFF tienen ~700-1000 días `.` en su
  historia larga). La validación compara «días hábiles sin dato»
  contra un umbral de 60/año para marcar solo huecos sospechosos.
- **Licencias restrictivas**: FRED es «Citation required» para
  VIXCLS (CBOE) y PCOPPUSDM (FMI) con aviso de copyright de
  terceros en la nota de la serie — ver `_licencias.md`. Se
  descargan para investigación, pero el motor de producción no
  debe usarlas hasta revisar el permiso del titular.
- **DTWEXBGS empieza en 2006-01-02** (no hay 2005): la serie
  actual del índice amplio del dólar comienza ahí y se toma desde
  el primer dato disponible del endpoint.
- **Términos de FRED**: la descarga usa el endpoint público
  `fredgraph.csv` (el mismo que ofrece la propia FRED para
  descargar CSV sin clave), con User-Agent identificado y ritmo
  educado (~1 s/req, 25 peticiones en total). Los términos en
  https://fred.stlouisfed.org/legal/ prohíben la minería/extracción
  masiva y el uso «in connection with the development or training
  of any software program or system or machine learning»; el motor
  V7 debe revisarlo antes de producción (ver `_licencias.md`).

## Licencia

Ver `~/v7/data/externos/_licencias.md` (verificado el 2026-11-09
en cada página de serie y en fred.stlouisfed.org/legal/).
