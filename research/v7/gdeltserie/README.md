# Series diarias de tono y volumen (módulo gdeltserie)

Descarga series DIARIAS de tono (`mode=timelinetone`, "Average Tone") y volumen
(`mode=timelinevol`, "Volume Intensity") de la API DOC 2.0 de GDELT para ocho
consultas temáticas, 2017-01-01 hasta hoy. Los datos viven fuera del
repositorio en `~/v7/data/gdeltserie/`; el código vive aquí. Mira
`~/kathy_workspace/handoff/v7/CONVENCIONES.md` para las reglas comunes.

## Uso

Verificación rápida de mera muestra (una ventana mensual 2026-01 por
consulta y modo; tarda ~15 min con 5 s entre peticiones):

```
python3 research/v7/gdeltserie/download_gdeltserie.py --probe
```

Descarga completa y reanudable (8 consultas × 2 modos × ~118 ventanas
mensuales ≈ 1900 peticiones; a 5 s cada una, ~3 h de reloj sin reintentos,
más si hay 429). Se ejecuta desacoplado y continúa donde iba: cada ventana
completada se anota en `~/v7/data/gdeltserie/_progreso.json` y el CSV de una
consulta solo se escribe al cerrar su última ventana:

```
cd /home/wagustin/kathy_workspace/wt-v7-gdeltserie
setsid nohup /home/wagustin/v7-env/bin/python research/v7/gdeltserie/download_gdeltserie.py > /home/wagustin/v7/logs/gdeltserie.out 2>&1 < /dev/null &
tail -f /home/wagustin/v7/logs/gdeltserie.log
```

Para reeditar una sola consulta (siempre rehacer sus dos modos):

```
python3 research/v7/gdeltserie/download_gdeltserie.py --only dolar_tipo_cambio
```

Para rellenar huecos de una ventana fallida tras el backoff: borra su clave
de `_progreso.json` (`qid|modo|AAAA-MM-DD/AAAA-MM-DD`) y vuelve a ejecutar.

## Formato de salida (`~/v7/data/gdeltserie/<consulta>.csv`)

Cabecera `fecha,tono,volumen,fecha_disponible`. `fecha` es el día UTC del
artículo (`YYYY-MM-DD`). `fecha_disponible` = `fecha + 1 día` ("disponible el
día siguiente", según el brief; CONVENCIONES dice "día hábil siguiente" para
diarias — se sigue el brief y se documenta la diferencia). `tono` es el tono
medio GDELT (–10 a +10) y `volumen` la intensidad de volumen (0..~0.5 para
consultas amplias; consultas de nicho pueden dar 0.0000–0.01). Si un día no
tuvo cobertura en un modo, esa celda queda vacía (no se inventa el cero).

## Consultas exactas (lo que se envió a GDELT, sin parafrasear)

GDELT solo admite paréntesis alrededor de grupos OR; los `AND` son términos
planos. Las consultas son, literalmente (`research/v7/gdeltserie/download_gdeltserie.py`, tabla `QUERIES`):

| id | tema del brief | query enviada |
|---|---|---|
| `peru_economia` | Perú economía en general | `(economia OR económico OR economica OR económico) AND sourcecountry:PE` |
| `dolar_tipo_cambio` | dólar / tipo de cambio Perú | `(dolar OR "tipo de cambio") AND sourcecountry:PE` |
| `bcrp` | BCRP | `bcrp AND sourcecountry:PE` |
| `mineria_cobre` | minería / cobre Perú | `(mineria OR cobre OR minería OR "conflicto minero") AND sourcecountry:PE` |
| `elecciones_politica` | elecciones / política Perú | `(elecciones OR congreso OR "política económica" OR politica OR eleccion) AND sourcecountry:PE` |
| `fed_tasas` | Reserva Federal y tasas | `("Reserva Federal" OR "Federal Reserve" OR Powell OR "tasa de interés" OR "tasa de interes")` |
| `aranceles_eeuu_china` | aranceles y comercio EE. UU.–China | `(aranceles OR arancel OR "guerra comercial" OR "comercio exterior" OR aduana)` |
| `riesgo_global` | riesgo global (crisis, guerra) | `(guerra OR crisis OR conflicto OR "crisis económica" OR recesión)` |

Las tres últimas son globales por brief (sin `sourcecountry`, porque el
tema no es peruano). Las grafías con y sin tilde se listan porque GDELT
trata `economia`/`economía` de forma distinta al emparejar texto acentuado
(el módulo titulares llegó a la misma conclusión con su `QUERY_LONG`).

## Huecos y limitaciones documentadas

- **Shadowing de consultas con `AND` (hallazgo probado en vivo, 2026-11-09).**
  Fijar la fuente con `sourcecountry:PE` funciona como filtro para términos
  raros (`bcrp AND sourcecountry:PE` devolvió datos diarios razonables), pero
  para `dolar AND sourcecountry:PE` el API respondió una vez `{}` vacío y
  otra vez tono llenado de ceros en 2019-01-01..20, donde la palabra sola
  (`dolar`) sí trae series con valores no nulos. Un filtro ámbito+tema puede
  quedar vacío aunque el término solo tenga cobertura: los huecos que dejen
  estas consultas se anotan en el log (`VACIA …`) y en la tabla de
  cobertura de abajo; no se rellena con la serie sin ámbito.
- **Resolución: día vs hora.** Cada respuesta trae
  `query_details.date_resolution`. Las consultas amplias (p. ej.
  `sourcecountry:PE` sola o `peru` sola) devuelven **hora** en ventanas
  cortas (5 días → 120 puntos horarios) y solo pasan a **día** en ventanas
  largas; las consultas de nicho devuelven día casi siempre. El loader usa
  ventanas mensuales (2017-01-01..hoy) y, si alguna ventana mensual viene en
  hora, la trocea por días y promedia cada día (brief: "trocéala por años
  o meses y agrega a diario"). Una petición de década completa a
  `sourcecountry:PE` también devolvió día (3553 puntos,
  20170101T000000Z..20261109T000000Z), por lo que las ventanas mensuales son
  un compromiso entre huecos y coste.
- **Rate-limit agresivo y compartido.** GDELT busca 1 petición cada 5 s por
  IP, pero en este servidor se solapa con el downloader de titulares
  (`sourcecountry:PE`, `mode=artlist`); ambos compiten por la misma cuota y
  los 429 se alargan (se observó un racha de forzados `429` con backoff
  15 s→300 s). El loader espera ≥5 s por petición, reintenta con espera
  creciente honrando `Retry-After`, y reanuda por ventana. Si el
  downloader de titulares sigue corriendo, la descarga de series será más
  lenta, pero no incorrecta: los huecos quedan anotados para reintentarlos
  luego.
- **Sin cruz con `data/official/gdelt-daily.json`.** Esa serie (`pe_tono_diario`,
  `sourcecountry:PE / peru`, 2019-01-02..2026-11-02, solo días hábiles,
  sin volúmenes) se generó con una consulta indistinta de esta; no se usa
  como fuente ni de validación cruzada aquí, solo se enriquece con estas
  ocho consultas temáticas diarias desde 2017.
- **No hay volumen para la serie original**: `timelinevol` es un modo nuevo
  para GDELT en este proyecto; los valores de volumen son intensidad
  (cuota del corpus en la ventana), no conteos de artículos.
- **Pesado para GitHub Actions**: con ~1900 peticiones 5 s a la vez, la
  descarga completa da (>3 h), dentro del coste de esta descarga. La
  política de cómputo de CONVENCIONES (red ligero en el servidor, pesado en
  Actions) se cumple: es red, no CPU, y el trabajo larga se lanza
  desacoplado con `nice -n 10` (ver CONVENCIONES).

## Cobertura (a rellenar tras la descarga; se genera con el propio CSV)

| id | primera | última | nº filas | filas tono | filas volumen | notas |
|---|---|---|---|---|---|---|
| peru_economia | — | — | — | — | — | — |
| dolar_tipo_cambio | — | — | — | — | — | huecos `VACIA` del log |
| bcrp | — | — | — | — | — | — |
| mineria_cobre | — | — | — | — | — | — |
| elecciones_politica | — | — | — | — | — | — |
| fed_tasas | — | — | — | — | — | global |
| aranceles_eeuu_china | — | — | — | — | — | global |
| riesgo_global | — | — | — | — | — | global |

## Licencia

Ver `~/v7/data/gdeltserie/_licencias.md` (GDELT 2.0 DOC API, uso libre con
cita; producción comercial: hay que revisar).
