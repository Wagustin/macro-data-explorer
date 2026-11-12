#!/usr/bin/env python3
"""Tabla diaria de temas de noticias para el torneo de motores (solo números).

Lee el corpus local de noticias (una noticia por línea, JSON) y cuenta, por día, cuántas noticias hubo de cada tema de
`temas.json`. Al repositorio solo entra la tabla de cuentas: ningún titular, resumen ni dirección.

Uso:
  python3 research/torneo/rasgos_noticias.py [--corpus DIR] [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD] [--salida CSV]
  python3 research/torneo/rasgos_noticias.py --autoprueba
"""
import argparse, csv, datetime as dt, json, re, unicodedata
from pathlib import Path

AQUI = Path(__file__).resolve().parent
CORPUS = "/home/wagustin/storage/perdata/noticias"
SALIDA = "data/torneo/noticias-rasgos.csv"


def limpio(s):
    """Minúsculas y sin tildes, para que «Inflación» cumpla un patrón que busca `inflacion`."""
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")


def columnas(temas):
    return ["dia", "pe_total"] + list(temas["peru"]) + list(temas["combinados"]) + ["mu_total"] + list(temas["mundo"])


def dia_de(visto):
    """Día D de una noticia: fecha de (visto + 14 h). D junta lo publicado hasta las 10:00 UTC (05:00 de Lima) de D."""
    return (dt.datetime.strptime((visto or "")[:19], "%Y-%m-%dT%H:%M:%S") + dt.timedelta(hours=14)).date().isoformat()


def contar(corpus, temas, desde="0000-00-00", hasta="9999-99-99"):
    """Devuelve {dia: {columna: cuenta}}. Un día sin ninguna noticia contada no aparece."""
    corpus = Path(corpus)
    cols = columnas(temas)[1:]
    pat = {g: {t: re.compile(p) for t, p in temas[g].items()} for g in ("peru", "mundo")}
    hechos = set()
    for linea in open(corpus / "gal/dias.jsonl", encoding="utf-8"):
        try:
            hechos.add(json.loads(linea)["dia"])
        except Exception:
            pass
    # solo hacen falta los meses desde el de (desde - 1 día) hasta el de hasta
    try:
        mes_ini = (dt.date.fromisoformat(desde) - dt.timedelta(days=1)).isoformat()[:7]
    except ValueError:
        mes_ini = "0000-00"
    tabla = {}
    for grupo, pref in (("peru", "pe"), ("mundo", "mu")):
        vistos = set()
        for archivo in sorted((corpus / "gal" / grupo).glob("*.jsonl")):
            if archivo.stem < mes_ini or archivo.stem > hasta[:7]:
                continue
            for linea in open(archivo, encoding="utf-8", errors="replace"):
                try:
                    n = json.loads(linea)
                    d = dia_de(n.get("visto"))
                except Exception:
                    continue  # línea rota o fecha ilegible
                if not (desde <= d <= hasta) or d not in hechos:
                    continue
                if (dt.date.fromisoformat(d) - dt.timedelta(days=1)).isoformat() not in hechos:
                    continue
                if not (n.get("titulo") or "").strip():
                    continue
                clave = (d, n.get("url"))
                if clave in vistos:
                    continue
                vistos.add(clave)
                texto = limpio(n.get("titulo")) + " " + limpio(n.get("resumen"))
                fila = tabla.setdefault(d, {c: 0 for c in cols})
                fila[f"{pref}_total"] += 1
                cumple = {t for t, p in pat[grupo].items() if p.search(texto)}
                for t in cumple:
                    fila[t] += 1
                if grupo == "peru":
                    for t, regla in temas["combinados"].items():
                        if all(x in cumple for x in regla["todos"]) and any(x in cumple for x in regla["alguno"]):
                            fila[t] += 1
    return tabla


def escribir(tabla, temas, salida):
    cols = columnas(temas)
    Path(salida).parent.mkdir(parents=True, exist_ok=True)
    with open(salida, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for d in sorted(tabla):
            w.writerow([d] + [tabla[d][c] for c in cols[1:]])


def autoprueba():
    """Prueba con un corpus diminuto inventado en una carpeta temporal."""
    import tempfile

    # temas propios y mínimos: los nombres de "combinados" deben existir en "peru"
    temas = {
        "peru": {"pe_economia": r"\beconomia\b", "pe_incert": r"incert", "pe_inflacion": r"\binflacion\b",
                 "pe_politica": r"\bpolitica\b", "pe_elecciones": r"\belecciones\b"},
        "mundo": {"mu_fed": r"\bfed\b"},
        "combinados": {"pe_epu": {"todos": ["pe_economia", "pe_incert"], "alguno": ["pe_politica", "pe_elecciones"]}},
    }
    # noticias inventadas: "visto" es UTC y el día sale de (visto + 14 h)
    peru = [
        ("2024-01-02T09:59:00Z", "Inflación anual", "Precios al alza", "u1"),            # 09:59 en su día
        ("2024-01-02T10:00:00Z", "Economía e incertidumbre", "Panorama", "u2"),        # 10:00 al siguiente
        ("2024-01-03T09:59:00Z", "Política y economía con incertidumbre", "Debate", "u3"),  # sí pe_epu
        ("2024-01-02T10:00:00Z", "Repetida", "Otra vez", "u2"),                        # url repetida
        ("2024-01-03T05:00:00Z", "   ", "Sin título", "u4"),                          # título vacío
        ("2024-01-05T05:00:00Z", "No descargado", "Fuera", "u5"),                     # día no descargado
        ("2024-01-06T05:00:00Z", "Sin ayer", "Fuera", "u6"),                          # sin día anterior
        ("2024-01-03T05:00:00Z", "Política de gobierno", "Solo política", "u8"),      # no pe_epu
        ("2024-01-02T05:00:00Z", "Fed local", "Mención a la Fed", "u9"),              # el mundo no cruza
        ("basura", "Fecha ilegible", "Fuera", "u7"),                                  # fecha ilegible
    ]
    mundo = [
        ("2024-01-03T05:00:00Z", "Fed baja tasas", "Decisión", "m1"),
        ("2024-01-03T05:00:00Z", "Fed otra vez", "Repetida", "m1"),                   # url repetida
        ("2024-01-02T05:00:00Z", "Oro al alza", "Precios", "m2"),
    ]
    dias = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-06"]
    with tempfile.TemporaryDirectory() as tmp:
        corpus = Path(tmp)
        (corpus / "gal/peru").mkdir(parents=True)
        (corpus / "gal/mundo").mkdir(parents=True)
        with open(corpus / "gal/dias.jsonl", "w", encoding="utf-8") as fh:
            for d in dias:
                fh.write(json.dumps({"dia": d}) + "\n")
        for grupo, noticias in (("peru", peru), ("mundo", mundo)):
            with open(corpus / f"gal/{grupo}/2024-01.jsonl", "w", encoding="utf-8") as fh:
                for n in noticias:
                    fh.write(json.dumps({"visto": n[0], "titulo": n[1], "resumen": n[2], "url": n[3]}) + "\n")
                fh.write('{"visto": "2024-01-03T05:00:00Z", "titulo": "Rota\n')  # línea rota al final
        tabla = contar(corpus, temas)

    # el corte de las 10:00 UTC: 09:59 sigue en su día y 10:00 pasa al siguiente
    assert dia_de("2024-01-02T09:59:00Z") == "2024-01-02"
    assert dia_de("2024-01-02T10:00:00Z") == "2024-01-03"
    # solo salen los dos días con noticias contadas: ni el día vacío, ni el no descargado,
    # ni el que no tiene el día anterior en dias.jsonl
    assert set(tabla) == {"2024-01-02", "2024-01-03"}, sorted(tabla)
    d2, d3 = tabla["2024-01-02"], tabla["2024-01-03"]
    # la url repetida cuenta una vez, y el título vacío, la línea rota y la fecha ilegible no cuentan
    assert d2["pe_total"] == 2 and d3["pe_total"] == 3, (d2["pe_total"], d3["pe_total"])
    # las tildes no importan y los temas del mundo no se buscan en las noticias de Perú
    assert d2["pe_inflacion"] == 1, d2["pe_inflacion"]
    assert d3["mu_total"] == 1 and d3["mu_fed"] == 1 and d2["mu_fed"] == 0
    # pe_epu cuenta la noticia que cumple todos y alguno; la que solo tiene política no
    assert d3["pe_epu"] == 1 and d2["pe_epu"] == 0, (d2["pe_epu"], d3["pe_epu"])
    assert d3["pe_economia"] == 2 and d3["pe_incert"] == 2 and d3["pe_politica"] == 2
    print("autoprueba: bien")


def main():
    ap = argparse.ArgumentParser(description="Tabla diaria de temas de noticias (solo números).")
    ap.add_argument("--corpus", default=CORPUS)
    ap.add_argument("--desde", default="0000-00-00")
    ap.add_argument("--hasta", default="9999-99-99")
    ap.add_argument("--salida", default=SALIDA)
    ap.add_argument("--autoprueba", action="store_true")
    a = ap.parse_args()
    if a.autoprueba:
        return autoprueba()
    temas = json.load(open(AQUI / "temas.json", encoding="utf-8"))
    tabla = contar(a.corpus, temas, a.desde, a.hasta)
    escribir(tabla, temas, a.salida)
    dias = sorted(tabla)
    print(f"días: {len(dias)}  primero: {dias[0] if dias else '-'}  último: {dias[-1] if dias else '-'}")
    print(f"noticias contadas: peru {sum(f['pe_total'] for f in tabla.values())}  mundo {sum(f['mu_total'] for f in tabla.values())}")


if __name__ == "__main__":
    main()
