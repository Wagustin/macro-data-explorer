#!/usr/bin/env python3
"""Coverage by month for ~/v7/data/titulares/AAAA-MM.jsonl.

Counts lines per file and writes ~/v7/data/titulares/_cobertura.csv with
columns mes,n_titulares (sorted). Runs standalone after the download finishes;
also safe to run on partial data.

Usage:
    python3 research/v7/titulares/cobertura.py
    python3 research/v7/titulares/cobertura.py --data-dir ~/v7/data/titulares

Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys

DATA_DIR = os.environ.get("TITULARES_DATA_DIR", "/home/wagustin/v7/data/titulares")
OUT_NAME = "_cobertura.csv"


def count_month(path: str) -> int:
    n = 0
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    n += 1
    except OSError:
        return 0
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=DATA_DIR)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if not os.path.isdir(args.data_dir):
        print(f"no es directorio: {args.data_dir}", file=sys.stderr)
        return 1

    months: dict[str, int] = {}
    for name in sorted(os.listdir(args.data_dir)):
        if not re.match(r"^\d{4}-\d{2}\.jsonl$", name):
            continue
        months[name[:-6]] = count_month(os.path.join(args.data_dir, name))

    out = args.out or os.path.join(args.data_dir, OUT_NAME)
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["mes", "n_titulares"])
        for mes in sorted(months):
            w.writerow([mes, months[mes]])

    total = sum(months.values())
    print(f"cobertura: {len(months)} meses, {total} titulares -> {out}")
    for mes in sorted(months):
        print(f"  {mes}: {months[mes]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
