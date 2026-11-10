# BCRP V7 — histórico completo (módulo bcrp)

Descarga el histórico completo de las series BCRPData para el motor V7.
Los datos viven fuera del repositorio en `~/v7/data/bcrp/`; el código vive aquí.

## Uso

Verificación rápida de una muestra (una franja reciente por serie, ~2 min):

```
python3 research/v7/bcrp/download_bcrp.py --probe
```

Descarga completa y reanudable (18 series, 6 s entre peticiones,
unas 2 h totales). Se ejecuta desacoplado y continúa donde iba:
cada serie se escribe solo al terminar su descarga (`<id>.csv`)
y el índice `_indice.csv` se reescribe al final:

```
cd /home/wagustin/kathy_workspace/wt-v7-bcrp
setsid nohup python3 research/v7/bcrp/download_bcrp.py > /home/wagustin/v7/logs/bcrp.out 2>&1 < /dev/null &
tail -f /home/wagustin/v7/logs/bcrp.log
```

Para reejecutar una sola serie tras un código roto:

```
python3 research/v7/bcrp/download_bcrp.py --only cdr
```

## Formato de salida (`~/v7/data/bcrp/<ID>.csv`)

Cabecera `fecha,valor,fecha_disponible` (CONVENCIONES). Diarias: disponibilidad
el día hábil siguiente; mensuales: publicación supuesta 45 días tras el cierre
del mes. El índice `_indice.csv` lleva `id,codigo,nombre,unidad,frecuencia,
primera_fecha,ultima_fecha,n_puntos,rezago_disponibilidad_dias,nota`.

## Series y cobertura real (API)

| id | código | cobertura encontrada |
|---|---|---|
| tipo_cambio | PD04640PD | 2000-01-03–hoy |
| cobre / oro / plata / zinc / wti | PD04701XD / PD04704XD / PD04702XD / PD04703XD / PD04705XD | 2000-01-04–hoy |
| rin / posicion_cambio | PD04650MD / PD04649MD | 2000-01-03–hoy |
| tasa_referencia | PD12301MD | 2003-09-05–hoy |
| intervencion_bcrp | PD04658MD | 2000-01-04–hoy |
| compras_mesa / swaps_cambiarios | PD04659MD / PD04660MD | 2000-03-03 / 2000-01-04–hoy (huecos reales: operaciones solo cuando interviene el BCRP) |
| cdr / swap_venta | PD37517TD / PD37521TD | 2014-01-02–hoy |
| inflacion_anual / subyacente | PN01273PM / PN01277PM | 1985-01 / 1993-01–hoy (mensual) |
| terminos_intercambio | PN38923BM | 1996-01–hoy |
| cobre_exportacion | PN38784BM | 1994-01–hoy |

## Limitaciones documentadas (resultados negativos)

- El API BCRPData no expone un catálogo completo en JSON de dominio público.
  Explorando códigos candidatos (tasa interbancaria, expectativas de tipo de
  cambio, EMBIG Perú, PBI mensual, balanza comercial, depósitos/retiros AFP)
  el API devuelve HTML (bot check) ante códigos inexistentes o escapa de
  consultas con la terminal de navegador: sin códigos verificados no se
  incluyen esas series. El `_indice.csv` deja `nota` para reintentarlas cuando
  se confirmen códigos.
- Los códigos inválidos devuelven HTML con 404/200 indistinguible; el
  downloader trata el HTML como error y retira con espera creciente.
- El API rellena días futuros con proyecciones numéricas (`2099-*` visible
  en la respuesta); el downloader trunca a hoy (`END`) para no filtrar
  futuro al motor V7.
- Detección de huecos: se cuentan días hábiles sin dato (sáb/dom exceptuados);
  los feriados peruanos (~15/año) se anotan como esperados y solo se marca
  hueco sospechoso si superan 60 días hábiles/año.

## Licencia

Ver `~/v7/data/bcrp/_licencias.md` (fuente BCRP, uso comercial: revisar).
