#!/usr/bin/env python3
"""
scripts/laya-v2.py

Clasificador Laya v2 (convaiinnovations/laya, subfolder="typed-decisions")
con criterios afinables desde un archivo JSON (por defecto config/laya-criterios.json).

Clasifica titulares con instrucciones mejoradas para relevancia, tema y sentimiento
(orientado al impacto macroeconómico y de mercado peruano), detectando empresas
por diccionario y alias canónicos.

Salida: eval/clasificador/laya2.jsonl
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

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CRITERIOS = ROOT_DIR / "config" / "laya-criterios.json"
DEFAULT_INPUT = ROOT_DIR / "eval" / "clasificador" / "historico.jsonl"
DEFAULT_OUTPUT = ROOT_DIR / "eval" / "clasificador" / "laya2.jsonl"
EMPRESAS_FILE = ROOT_DIR / "data" / "empresas.json"

MODEL_ID = "convaiinnovations/laya"
SUBFOLDER = "typed-decisions"

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


def normalize(text: str) -> str:
    """Normaliza texto: sin diacríticos/tildes, minúsculas, alfanumérico limpio."""
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower()
    return re.sub(r"[^a-z0-9\s]", " ", text)


def pick_best_nemonico(valores: list) -> str | None:
    """Selecciona el nemónico bursátil más representativo (ADR, RV1/RV2 comunes)."""
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


def build_company_map(empresas_path: Path, alias_map: dict[str, str]) -> dict[str, str]:
    """Construye diccionario de búsqueda nombre_corto -> nemónico."""
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

    for alias, nem in alias_map.items():
        company_map[alias.lower().strip()] = nem

    return company_map


def detect_companies(headline: str, company_map: dict[str, str]) -> list[str]:
    """Detecta nemónicos bursátiles mencionados en el titular."""
    norm_t = " " + normalize(headline) + " "
    found = set()
    for name, nem in company_map.items():
        pattern = r"\b" + re.escape(name) + r"\b"
        if re.search(pattern, norm_t):
            found.add(nem)
    return sorted(list(found))


def main():
    parser = argparse.ArgumentParser(description="Clasifica titulares con Laya v2 usando criterios configurables")
    parser.add_argument("--criterios", type=str, default=str(DEFAULT_CRITERIOS), help="Ruta al archivo de criterios JSON")
    parser.add_argument("--input", type=str, default=str(DEFAULT_INPUT), help="Ruta al dataset de entrada JSONL")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT), help="Ruta para guardar laya2.jsonl")
    parser.add_argument("--limit", type=int, default=None, help="Límite de noticias a procesar (para pruebas)")
    parser.add_argument("--device", type=str, default="cpu", help="Dispositivo ('cpu' o 'cuda')")
    parser.add_argument("--threads", type=int, default=4, help="Hilos PyTorch para CPU (default: 4)")
    args = parser.parse_args()

    criterios_path = Path(args.criterios).resolve()
    if not criterios_path.exists():
        print(f"Error: {criterios_path} no encontrado.", file=sys.stderr)
        sys.exit(1)

    with open(criterios_path, "r", encoding="utf-8") as f:
        criterios_data = json.load(f)

    version = criterios_data.get("version", "2.0.0")
    print(f"Cargados criterios Laya v{version} desde {criterios_path.name}")

    questions = {}
    for key in ["relevancia", "tema", "sentimiento"]:
        cfg = criterios_data.get(key, {})
        questions[key] = {
            "type": cfg.get("type", "choice"),
            "instructions": cfg.get("instructions", ""),
            "criteria": cfg.get("criteria", {})
        }

    alias_map = criterios_data.get("empresas", {}).get("alias_map", {})
    company_map = build_company_map(EMPRESAS_FILE, alias_map)
    print(f"Mapeo de empresas: {len(company_map)} entradas")

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Error: dataset de entrada {input_path} no existe.", file=sys.stderr)
        sys.exit(1)

    items = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))

    if args.limit and args.limit > 0:
        items = items[:args.limit]

    print(f"Titulares a clasificar: {len(items)}")

    # Configuración de torch y Laya
    if args.device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""

    try:
        import torch
        if args.device == "cpu":
            torch.set_num_threads(args.threads)
        import laya
    except ImportError as e:
        print(f"Error importando dependencias de Laya: {e}", file=sys.stderr)
        print("Instale torch y laya según las instrucciones del workflow.", file=sys.stderr)
        sys.exit(2)

    print(f"Cargando modelo Laya ({MODEL_ID}, subfolder={SUBFOLDER}) en {args.device}...")
    t0_load = time.perf_counter()
    agent = laya.load(MODEL_ID, subfolder=SUBFOLDER, device=args.device)
    print(f"Modelo Laya cargado en {time.perf_counter() - t0_load:.2f} s")

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    latencies = []
    classified_records = []

    for idx, item in enumerate(items, 1):
        item_id = item.get("id")
        titulo = item.get("titulo", "")
        fuente = item.get("fuente", "")
        enlace = item.get("enlace", "")
        fecha_iso = item.get("fecha_iso", "")
        categoria_actual = item.get("categoria", "")

        empresas = detect_companies(titulo, company_map)

        state = {
            "titular": titulo,
            "fuente": fuente,
            "categoria_actual": categoria_actual
        }

        t0_inf = time.perf_counter()
        try:
            res = agent.predict(state, questions)
            ans = res.get("answers", {})
            rel_ans = ans.get("relevancia", {})
            tema_ans = ans.get("tema", {})
            sent_ans = ans.get("sentimiento", {})

            relevancia = rel_ans.get("choice", "MEDIA")
            tema = tema_ans.get("choice", "Economía y fiscal")
            sentimiento = sent_ans.get("choice", "NEUTRO")
            confianza = round(float(rel_ans.get("probabilities", {}).get(relevancia, 0.0)), 4)
        except Exception as e:
            print(f"Error prediciendo item {item_id}: {e}", file=sys.stderr)
            relevancia = "MEDIA"
            tema = "Economía y fiscal"
            sentimiento = "NEUTRO"
            confianza = 0.3333

        dur = time.perf_counter() - t0_inf
        latencies.append(dur)

        relevante = relevancia != "NINGUNA"

        record = {
            "id": item_id,
            "titulo": titulo,
            "fuente": fuente,
            "fecha_iso": fecha_iso,
            "enlace": enlace,
            "laya2": {
                "relevancia": relevancia,
                "relevante": relevante,
                "tema": tema,
                "sentimiento": sentimiento,
                "empresas": empresas,
                "confianza": confianza
            },
            "criterios_version": version
        }
        classified_records.append(record)

        if idx % 20 == 0 or idx == len(items):
            print(f"[{idx:03d}/{len(items)}] {dur*1000:5.1f} ms | Rel: {relevancia:<7} | Tema: {tema:<18} | Sent: {sentimiento:<8} | Emp: {empresas}")

    with open(output_path, "w", encoding="utf-8") as f:
        for r in classified_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    if latencies:
        avg_ms = (sum(latencies) / len(latencies)) * 1000
        print(f"Guardados {len(classified_records)} registros en {output_path}")
        print(f"Latencia promedio por titular: {avg_ms:.1f} ms")


if __name__ == "__main__":
    main()
