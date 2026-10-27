#!/usr/bin/env python3
"""
scripts/classify_news.py

Clasificación de noticias financieras y macroeconómicas de PerData mediante Laya
(convaiinnovations/laya, subfolder="typed-decisions").

Determina para cada titular:
- relevancia: ALTA, MEDIA o BAJA (para un inversionista que sigue la economía peruana y la BVL)
- tema: Dólar y BCRP, Economía y fiscal, Minería y metales, Bolsa y empresas, Energía, Mundo, Otros
- sentimiento: POSITIVO, NEUTRO o NEGATIVO
- empresas: Nemónicos bursátiles BVL detectados en el titular (sin LLM)

Caché persistente por id en data/noticias-laya.json.
"""

import os
import sys
import json
import time
import re
import argparse
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

# Paths del repositorio
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
NOTICIAS_FILE = DATA_DIR / "noticias.json"
NOTICIAS_LAYA_FILE = DATA_DIR / "noticias-laya.json"
EMPRESAS_FILE = DATA_DIR / "empresas.json"

MODEL_ID = "convaiinnovations/laya"
SUBFOLDER = "typed-decisions"
MODEL_NAME_TAG = "convaiinnovations/laya (typed-decisions)"

# Palabras genéricas y stopwords para filtrado de nombres cortos de empresas
STOPWORDS = {
    "banco", "compania", "sociedad", "empresa", "corporacion", "grupo", "fondo",
    "peru", "peruana", "peruano", "peruanas", "peruanos", "lima", "nacional", "internacional",
    "general", "universal", "central", "america", "inversiones", "servicios", "comercial",
    "industrial", "desarrollo", "valores", "capital", "finanzas", "financiera", "seguros",
    "pensiones", "administradora", "fondos", "titulizadora", "patrimonio", "fideicomiso",
    "minera", "minas", "energia", "electrica", "generacion", "distribucion", "transmision",
    "norte", "sur", "este", "oeste", "centro", "nuevo", "nueva", "gran", "grande",
    "asociacion", "federacion", "instituto", "caja", "municipal", "regional"
}

GENERIC_WORDS = {
    "bolsa", "editora", "agricola", "electro", "holding", "corporativas", "vivir",
    "centenario", "corona", "siglo", "liberty", "efectiva", "crecer", "futuro",
    "progreso", "vida", "total", "popular", "union", "confianza", "real", "comercio",
    "america", "dunas", "tradi", "copen"
}

# Alias canónicos solicitados expresamente en el brief
ALIAS_MAP = {
    "bcp": "CREDITC1",
    "banco de credito": "CREDITC1",
    "credicorp": "BAP",
    "buenaventura": "BVN",
    "minas buenaventura": "BVN",
    "southern": "SCCO",
    "southern copper": "SCCO",
    "southern peru": "SCCO",
    "alicorp": "ALICORC1",
    "volcan": "VOLCABC1",
    "ferreycorp": "FERREYC1",
    "ferreyros": "FERREYC1",
    "minsur": "MINSURI1",
    "cerro verde": "CVERDEC1",
    "backus": "BACKUSI1",
    "unacem": "UNACEMC1",
    "union andina de cementos": "UNACEMC1",
    "inretail": "INRETC1",
    "interbank": "INTERBC1",
    "ifs": "IFS",
    "intercorp": "IFS",
    "petroperu": "PETROBC1",
    "petro peru": "PETROBC1",
    "petroleos del peru": "PETROBC1",
    "bbva": "BBVAC1",
    "banco continental": "BBVAC1",
    "scotiabank": "SCOTIAC1",
    "aenza": "AENZAC1",
    "grana y montero": "AENZAC1",
    "aceros arequipa": "CORAREI1",
    "siderperu": "SIDERC1",
    "sider peru": "SIDERC1",
    "pacasmayo": "CPAC",
    "cementos pacasmayo": "CPAC",
    "luz del sur": "LUZSURC1",
    "engie": "ENGPEC1"
}

QUESTIONS = {
    "relevancia": {
        "type": "choice",
        "instructions": "Evalúa la relevancia de esta noticia para un inversionista que sigue la economía, las finanzas y la bolsa del Perú:",
        "criteria": {
            "ALTA": "BCRP, tipo de cambio, minería y precios de metales, resultados, dividendos, emisiones, regulación que afecta empresas listadas, PBI, inflación o política fiscal.",
            "MEDIA": "Noticias económicas o sectoriales generales, comercio, empleo, obras públicas, consumo o finanzas con impacto moderado o indirecto.",
            "BAJA": "Sucesos, crónica policial, consejos de consumo, farándula, política sin impacto económico, entretenimiento o temas no financieros."
        }
    },
    "tema": {
        "type": "choice",
        "instructions": "Clasifica el tema principal de la noticia en una de las siguientes categorías:",
        "criteria": {
            "Dólar y BCRP": "Política monetaria, tasas de interés, tipo de cambio, reservas internacionales o BCRP.",
            "Economía y fiscal": "PBI, recaudación tributaria, presupuesto, inflación, empleo formal o política fiscal.",
            "Minería y metales": "Producción minera, exportaciones de cobre, oro, plata, cotización de metales o canon.",
            "Bolsa y empresas": "BVL, acciones, dividendos, utilidades trimestrales, emisiones corporativas o fusiones.",
            "Energía": "Hidrocarburos, petróleo, gas natural de Camisea, electricidad o tarifas energéticas.",
            "Mundo": "Hechos internacionales que mueven los mercados: guerras, EE. UU. y China, Reserva Federal, aranceles, OPEP, inteligencia artificial y tecnología.",
            "Otros": "Cualquier otro tema no cubierto por las categorías anteriores."
        }
    },
    "sentimiento": {
        "type": "choice",
        "instructions": "Determina el sentimiento o impacto de esta noticia para el mercado peruano:",
        "criteria": {
            "POSITIVO": "Favorable para el mercado peruano: crecimiento, inversión, utilidades, superávit o estabilidad.",
            "NEUTRO": "Informativo, en línea con lo esperado, balanceado o sin variación sustancial.",
            "NEGATIVO": "Desfavorable: riesgos macroeconómicos, pérdidas, incertidumbre, desaceleración o crisis."
        }
    }
}


def normalize(text: str) -> str:
    """Normaliza texto: sin diacríticos/tildes, minúsculas, alfanumérico limpio."""
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    return re.sub(r"[^a-z0-9\s]", " ", text)


def pick_best_nemonico(valores: list) -> str | None:
    """Selecciona el nemónico bursátil más representativo (priorizando ADR/foreign, RV1 y RV2 comunes)."""
    if not valores:
        return None
    foreign_tickers = ["BAP", "BVN", "SCCO", "IFS", "CPAC", "AUNA"]
    for v in valores:
        nem = v.get("nemonico")
        if nem in foreign_tickers:
            return nem
    for v in valores:
        nem = v.get("nemonico", "")
        if nem.endswith("C1") or v.get("segmento") == "RV1":
            return nem
    for v in valores:
        nem = v.get("nemonico", "")
        if nem.endswith("I1"):
            return nem
    return valores[0].get("nemonico")


def build_company_map(empresas_path: Path) -> dict[str, str]:
    """Construye diccionario de búsqueda nombre_corto -> nemonico a partir de empresas.json y alias."""
    company_map: dict[str, str] = {}
    if empresas_path.exists():
        try:
            with open(empresas_path, "r", encoding="utf-8") as f:
                empresas_data = json.load(f)
            for em in empresas_data.get("emisores", []):
                nem = pick_best_nemonico(em.get("valores", []))
                if not nem:
                    continue
                rz = em.get("razonSocial", "")
                clean_rz = re.sub(r"\(.*?\)", "", rz)
                norm = normalize(clean_rz)
                norm = re.sub(r"\b(s\s*a\s*a|s\s*a\s*c|s\s*a|s\s*r\s*l|corp|ltd|inc|sucursal del peru)\b", " ", norm)
                words = [w for w in norm.split() if w not in STOPWORDS and len(w) > 2]
                if words:
                    if len(words) == 1 and words[0] in GENERIC_WORDS:
                        continue
                    short_name = " ".join(words)
                    if len(short_name) >= 4 and short_name not in GENERIC_WORDS:
                        company_map[short_name] = nem
        except Exception as e:
            print(f"Advertencia cargando {empresas_path}: {e}", file=sys.stderr)

    # Inyectar alias canónicos con máxima prioridad
    for alias, nem in ALIAS_MAP.items():
        company_map[alias] = nem

    return company_map


def detect_companies(headline: str, company_map: dict[str, str]) -> list[str]:
    """Detecta nemónicos bursátiles mencionados en el titular por coincidencia exacta de palabras."""
    norm_t = " " + normalize(headline) + " "
    found = set()
    for name, nem in company_map.items():
        pattern = r"\b" + re.escape(name) + r"\b"
        if re.search(pattern, norm_t):
            found.add(nem)
    return sorted(list(found))


def main():
    parser = argparse.ArgumentParser(description="Clasifica titulares financieros con Laya")
    parser.add_argument("--limit", type=int, default=None, help="Límite de noticias a procesar (para pruebas)")
    parser.add_argument("--device", type=str, default="cpu", help="Dispositivo para Laya ('cpu' o 'cuda')")
    parser.add_argument("--threads", type=int, default=4, help="Hilos PyTorch para CPU (default: 4)")
    args = parser.parse_args()

    if not NOTICIAS_FILE.exists():
        print(f"Error: {NOTICIAS_FILE} no encontrado.", file=sys.stderr)
        sys.exit(1)

    # 1. Cargar noticias origen
    with open(NOTICIAS_FILE, "r", encoding="utf-8") as f:
        noticias_data = json.load(f)
    all_noticias = noticias_data.get("noticias", [])
    print(f"Noticias totales en {NOTICIAS_FILE.name}: {len(all_noticias)}")

    # 2. Cargar caché existente de Laya
    cache_data = {}
    items: dict[str, dict] = {}
    if NOTICIAS_LAYA_FILE.exists():
        try:
            with open(NOTICIAS_LAYA_FILE, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
                items = cache_data.get("items", {})
            print(f"Caché cargada de {NOTICIAS_LAYA_FILE.name}: {len(items)} items existentes")
        except Exception as e:
            print(f"Error leyendo {NOTICIAS_LAYA_FILE}: {e}. Se recreará.", file=sys.stderr)
            items = {}

    # 3. Filtrar noticias pendientes
    pending = [n for n in all_noticias if n.get("id") and n["id"] not in items]
    print(f"Noticias pendientes de clasificación: {len(pending)}")

    if not pending:
        print("Todo al día: no hay noticias nuevas para clasificar.")
        return

    if args.limit and args.limit > 0:
        pending = pending[:args.limit]
        print(f"Limitando ejecución a {len(pending)} titulares.")

    # 4. Construir mapeo de empresas
    company_map = build_company_map(EMPRESAS_FILE)
    print(f"Mapeo de empresas cargado ({len(company_map)} entradas).")

    # 5. Cargar motor Laya
    if args.device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
    import torch
    if args.device == "cpu":
        torch.set_num_threads(args.threads)

    import laya

    print(f"Cargando modelo Laya ({MODEL_ID}, subfolder={SUBFOLDER}) en {args.device}...")
    t0_load = time.perf_counter()
    agent = laya.load(MODEL_ID, subfolder=SUBFOLDER, device=args.device)
    load_time = time.perf_counter() - t0_load
    print(f"Modelo Laya cargado exitosamente en {load_time:.2f} s")

    # 6. Clasificar noticias
    latencies = []
    for idx, item in enumerate(pending, 1):
        item_id = item["id"]
        titulo = item.get("titulo", "")
        fuente = item.get("fuente", "")
        categoria_actual = item.get("categoria", "")

        empresas = detect_companies(titulo, company_map)

        state = {
            "titular": titulo,
            "fuente": fuente,
            "categoria_actual": categoria_actual
        }

        t0_inf = time.perf_counter()
        try:
            res = agent.predict(state, QUESTIONS)
            ans = res.get("answers", {})
            rel_ans = ans.get("relevancia", {})
            tema_ans = ans.get("tema", {})
            sent_ans = ans.get("sentimiento", {})

            relevancia = rel_ans.get("choice", "MEDIA")
            tema = tema_ans.get("choice", categoria_actual or "Otros")
            sentimiento = sent_ans.get("choice", "NEUTRO")
            confianza = round(float(rel_ans.get("probabilities", {}).get(relevancia, 0.0)), 4)
        except Exception as e:
            print(f"Error prediciendo para item {item_id}: {e}", file=sys.stderr)
            relevancia = "MEDIA"
            tema = categoria_actual or "Otros"
            sentimiento = "NEUTRO"
            confianza = 0.3333

        dur = time.perf_counter() - t0_inf
        latencies.append(dur)

        items[item_id] = {
            "relevancia": relevancia,
            "tema": tema,
            "sentimiento": sentimiento,
            "empresas": empresas,
            "confianza": confianza
        }

        print(f"[{idx:02d}/{len(pending)}] {dur*1000:6.1f} ms | Rel: {relevancia:<5} ({confianza:.2f}) | Tema: {tema:<18} | Sent: {sentimiento:<8} | Emp: {empresas} | {titulo[:50]}...")

    # 7. Estadísticas de tiempo
    if latencies:
        avg_lat = sum(latencies) / len(latencies)
        print("-" * 60)
        print(f"Tiempo de carga del modelo: {load_time:.2f} s")
        print(f"Tiempo promedio por titular: {avg_lat:.2f} s ({avg_lat*1000:.1f} ms)")
        print(f"Estimación para 80 titulares: {avg_lat * 80 / 60:.2f} minutos")
        print("-" * 60)

    # 8. Guardar resultado
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    output_payload = {
        "actualizado": now_iso,
        "modelo": MODEL_NAME_TAG,
        "items": items
    }

    tmp_file = NOTICIAS_LAYA_FILE.with_suffix(".tmp")
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    tmp_file.replace(NOTICIAS_LAYA_FILE)
    print(f"Guardado exitoso en {NOTICIAS_LAYA_FILE.name} con {len(items)} noticias clasificadas.")


if __name__ == "__main__":
    main()
