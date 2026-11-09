"""Synthetic sanity tests for the V7 harness (unittest, also runnable with pytest).

Covers the brief item 6:
 1. A synthetic series with known drift (geometric Brownian motion with
    drift) — drift model must beat the random walk on MAE.
 2. A pure random walk — no model may beat the random walk beyond the
    DM 5% threshold (in expectation): the bracket we test is on metrics
    wiring, not on claiming significance.
 3. ``walk_forward`` never calls the model with data whose
    ``fecha_disponible`` is after the cut (spy model records every
    history length and the harness verifies ``fecha_disponible``).
 4. ``cargar_serie`` keeps only rows with ``fecha_disponible <= como_de``.
 5. Diebold-Mariano wiring: known variance advantage is detected.
 6. Pinball loss is minimised at true quantiles (metrics wiring).
"""
from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from .datos import cargar_serie
from .walk_forward import (
    diebold_mariano,
    modelo_deriva,
    modelo_paseo_aleatorio,
    walk_forward,
)


def _fechas_diarias(n: int, inicio: str = "2019-01-02") -> list[str]:
    return pd.bdate_range(inicio, periods=n).strftime("%Y-%m-%d").tolist()


def _serie_sintetica(precio: np.ndarray, inicio: str = "2019-01-02",
                     fecha_disponible_siguiente_habil: bool = True) -> pd.DataFrame:
    fechas = _fechas_diarias(len(precio), inicio)
    disp = pd.Series(fechas)
    if fecha_disponible_siguiente_habil:
        disp = (pd.to_datetime(disp) + pd.offsets.BDay(1)).dt.strftime("%Y-%m-%d")
    return pd.DataFrame({"fecha": fechas, "valor": precio, "fecha_disponible": disp})


def _gbm_con_deriva(n: int = 1500, semilla: int = 7) -> np.ndarray:
    rng = np.random.default_rng(semilla)
    deriva_diaria = 0.0008  # ~0.08% per business day, clearly positive
    sigma = 0.004
    ret = rng.normal(deriva_diaria, sigma, n)
    precio = 3.30 * np.exp(np.cumsum(ret))
    return precio


def _paseo_aleatorio_puro(n: int = 1500, semilla: int = 7) -> np.ndarray:
    rng = np.random.default_rng(semilla)
    ret = rng.normal(0.0, 0.006, n)
    precio = 3.30 * np.exp(np.cumsum(ret))
    return precio


class TestCargarSerie(unittest.TestCase):
    def test_fallback_dolar_sin_mirar_futuro(self):
        # mientras no exista ~/v7/data/bcrp/PD04640PD.csv, PEN usa el respaldo
        df = cargar_serie("PEN", como_de="2020-06-30")
        self.assertTrue(len(df) > 0)
        self.assertTrue((df["fecha_disponible"] <= "2020-06-30").all())
        self.assertEqual(list(df.columns), ["fecha", "valor", "fecha_disponible"])

    def test_corte_mas_reciente_incluye_hasta_disponible(self):
        df_todo = cargar_serie("PEN")
        corte = "2024-12-31"
        df_corte = cargar_serie("PEN", como_de=corte)
        # toda fila devuelta en el corte estaba disponible en el corte
        self.assertTrue((df_corte["fecha_disponible"] <= corte).all())
        self.assertLessEqual(len(df_corte), len(df_todo))


class TestWalkForwardSinFuturo(unittest.TestCase):
    def test_modelo_nunca_ve_datos_posteriores_al_corte(self):
        n = 300
        precio = _gbm_con_deriva(n)
        df = _serie_sintetica(precio)
        longitudes = []

        def espi(modelo_historia):
            # contexto: len(historia) valores disponibles hasta el corte
            longitudes.append(len(modelo_historia))
            return modelo_historia

        def modelo_espia(historia, h, covariables_hasta_corte=None):
            espi(historia)
            rw = modelo_paseo_aleatorio()(historia, h, covariables_hasta_corte)
            return rw

        res = walk_forward(modelo_espia, df, inicio="2019-01-02", horizontes=(1,), nombre="espia")
        self.assertGreater(len(res), 100)
        # El corte es fecha <= inicio+horizonte; la historia no puede superar
        # el índice del corte entre fechas del DataFrame.
        fechas = df["fecha"].to_numpy()
        disponibilidad = df["fecha_disponible"].to_numpy()
        for i, fila in enumerate(res.itertuples()):
            corte = fila.corte
            idx_corte = int(np.where(fechas == corte)[0][0])
            # número de filas disponibles hasta el corte:
            # disponibilidad <= corte y fecha <= corte
            disponibles = int(np.sum((disponibilidad <= corte) & (fechas <= corte)))
            self.assertLessEqual(longitudes[i], disponibles)

    def test_modelo_con_futuro_en_covariables_no_se_permite(self):
        # El harness pasa None como covariables; el modelo solo recibe
        # historia + Horizonte. Aquí lo comprobamos con un modelo que
        # registra si alguna vez aparece una fecha > corte en el historial
        # vía el espía de índices.
        df = _serie_sintetica(_paseo_aleatorio_puro(200))
        vistas = []

        def espia(historia, h, cov=None):
            vistas.append((len(historia), cov))
            return modelo_paseo_aleatorio()(historia, h, cov)

        walk_forward(espia, df, inicio="2019-01-02", horizontes=(5,), nombre="espia")
        for L, cov in vistas:
            self.assertIsNone(cov)
            self.assertLessEqual(L, 200)


class TestMetricasSinteticas(unittest.TestCase):
    def test_deriva_conocida_gana_al_paseo_aleatorio(self):
        df = _serie_sintetica(_gbm_con_deriva(1200, semilla=11))
        rw = walk_forward(modelo_paseo_aleatorio(), df, inicio="2019-01-02",
                          horizontes=(1, 5), nombre="paseo aleatorio")
        dr = walk_forward(modelo_deriva(), df, inicio="2019-01-02",
                          horizontes=(1, 5), nombre="deriva")
        res = pd.concat([rw, dr], ignore_index=True)
        for h in (1, 5):
            m_rw = float(np.mean(np.abs(rw[rw.horizonte == h]["p50"] - rw[rw.horizonte == h]["real"])))
            m_dr = float(np.mean(np.abs(dr[dr.horizonte == h]["p50"] - dr[dr.horizonte == h]["real"])))
            self.assertLess(
                m_dr, m_rw,
                f"h={h}: la deriva con drift conocido debería ganar (deriva={m_dr:.5f}, rw={m_rw:.5f})",
            )

    def test_paseo_aleatorio_puro_sin_ventaja_sistematica(self):
        # Sobre una RW pura ningún modelo puede tener ventaja sistemática:
        # comprobamos el cableado de Diebold-Mariano (DM finito, p en [0,1])
        # y que la dirección esté cerca del 50% (sin ilusión de acierto).
        df = _serie_sintetica(_paseo_aleatorio_puro(1200, semilla=3))
        rw = walk_forward(modelo_paseo_aleatorio(), df, inicio="2019-01-02",
                          horizontes=(1,), nombre="paseo aleatorio")
        dr = walk_forward(modelo_deriva(), df, inicio="2019-01-02",
                          horizontes=(1,), nombre="deriva")
        e_rw = rw["p50"].to_numpy() - rw["real"].to_numpy()
        e_dr = dr["p50"].to_numpy() - dr["real"].to_numpy()
        dm, p = diebold_mariano(e_dr, e_rw)
        self.assertTrue(np.isfinite(dm))
        self.assertTrue(0.0 <= p <= 1.0)
        # Dirección de la deriva (signo de mu) no debe acertar >> 55% en RW pura
        from .walk_forward import direccion_acierto

        acc, n, _ = direccion_acierto(dr, 1)
        if n > 50:
            self.assertLess(acc, 0.62, f"dirección en RW pura no debería ser alta: {acc:.3f}")


class TestDieboldMariano(unittest.TestCase):
    def test_detecta_ventaja_real(self):
        rng = np.random.default_rng(0)
        e_rw = rng.normal(0, 0.01, 2000) + 0.002 * 0
        e_mejor = e_rw * 0.60  # ventaja genuina y sostenida en la escale de e_rw
        dm, p = diebold_mariano(e_mejor, e_rw)
        self.assertLess(p, 0.05)

    def test_empate_perfecto_p_1(self):
        e = np.random.default_rng(1).normal(0, 0.01, 500)
        dm, p = diebold_mariano(e, e.copy())
        self.assertEqual(dm, 0.0)
        self.assertEqual(p, 1.0)

    def test_pinball_minimo_en_cuantiiles_reales(self):
        from .walk_forward import _pinball

        rng = np.random.default_rng(2)
        reales = rng.normal(10, 1, 2000)
        for q, pred_q in [(0.10, np.quantile(reales, 0.10)),
                          (0.90, np.quantile(reales, 0.90))]:
            p0 = _pinball(reales, q, np.full_like(reales, pred_q))
            p_desv = _pinball(reales, q, np.full_like(reales, pred_q + 0.5))
            self.assertLess(p0, p_desv)


class TestMetricasHacerReporte(unittest.TestCase):
    def test_pipeline_completo(self):
        from .informe import _resumen_con_dm, escribir_informe

        df = _serie_sintetica(_gbm_con_deriva(600, semilla=5))
        rw = walk_forward(modelo_paseo_aleatorio(), df, inicio="2019-01-02",
                          horizontes=(1, 5), nombre="paseo aleatorio")
        dr = walk_forward(modelo_deriva(), df, inicio="2019-01-02",
                          horizontes=(1, 5), nombre="deriva")
        res = pd.concat([rw, dr], ignore_index=True)
        resumen = _resumen_con_dm(res)
        self.assertEqual(len(resumen), 4)  # 2 modelos × 2 horizontes
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as td:
            out = escribir_informe(res, Path(td) / "r.md")
            self.assertTrue(out.exists())
            txt = out.read_text(encoding="utf-8")
            self.assertIn("Paseo aleatorio", txt)


if __name__ == "__main__":
    unittest.main()
