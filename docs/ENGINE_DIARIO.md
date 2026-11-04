# PerData Engine Diario v1: Metodología, Calibración y Backtest

## 1. Contexto y Objetivos

Para responder a las necesidades de la plataforma PerData:
- **Portada:** Mostrar el tipo de cambio oficial de hoy y el pronóstico probabilístico para mañana ($h = 1$ día hábil).
- **Boletín diario:** Proyectar el rango esperado para mañana ($h = 1$), la próxima semana ($h = 5$ días hábiles) y el próximo mes.

El motor mensual preexistente (`perdata-engine-v6`) está calibrado a escala mensual (1 a 48 meses). Este documento detalla el diseño, la validación fuera de muestra y la calibración del **PerData Engine diario**, rigiéndose por el principio rector del proyecto: **solo se publica lo que el backtest riguroso respalda**.

---

## 2. Metodología Matemática: Simulación Histórica Filtrada (FHS)

Para capturar la asimetría de colas y el agrupamiento de volatilidad (*volatility clustering*) sin imponer una distribución normal teórica (que subestima sistemáticamente eventos extremos en divisas y materias primas), se implementó **Simulación Histórica Filtrada** (Filtered Historical Simulation, Hull & White, 1998).

### 2.1. Dinámica del P50 (Mediana)
Para cada día de corte $t$ y horizonte $h \in \{1, 2, \dots, 8\}$:
- **Paseo Aleatorio (Hipótesis Nula / Martingala):**
  $$P_{50} = P_t$$
- **Deriva EWMA alternativa:**
  $$\mu_t = \lambda \mu_{t-1} + (1 - \lambda) u_t, \quad P_{50}^{\text{drift}} = P_t \exp(h \cdot \mu_t)$$
  donde $u_t = \ln(P_t / P_{t-1})$ y $\lambda = 0.94$.

**Regla de decisión:** La deriva solo sustituye al paseo aleatorio si reduce el Error Absoluto Medio (MAE) en el backtest rodante. En todas las series analizadas, el paseo aleatorio superó a la deriva, por lo que $P_{50} = P_t$.

### 2.2. Volatilidad Condicional EWMA
La varianza condicional diaria $\sigma_t^2$ se estima mediante un alisado exponencial RiskMetrics ($\lambda = 0.94$):
$$\sigma_t^2 = \lambda \sigma_{t-1}^2 + (1 - \lambda) u_t^2$$
$$\sigma_t = \sqrt{\sigma_t^2}$$

### 2.3. Retornos Reescalados y Cuantiles Empíricos
Para el horizonte $h$, se extraen los retornos históricos a $h$ días en una ventana retrospectiva de 3 años ($W = 756$ días hábiles):
$$r_{\tau, h} = \ln\left(\frac{P_\tau}{P_{\tau - h}}\right), \quad \tau \in [t - W, t]$$

Cada retorno histórico se reescala por el régimen de volatilidad actual frente al régimen vigente en la fecha histórica $\tau$:
$$r^*_{\tau, h} = r_{\tau, h} \cdot \left(\frac{\sigma_t}{\sigma_\tau}\right)$$

A partir del conjunto ordenado $\{r^*_{\tau, h}\}$, se calculan los cuantiles empíricos:
$$q_{10}, \quad q_{25}, \quad q_{75}, \quad q_{90}$$

### 2.4. Calibración del Factor $K_h$
Para garantizar que la banda $P_{10} - P_{90}$ cubra exactamente el 80 % de los casos reales fuera de muestra, se calibra un factor multiplicativo $K_h \ge 1$:
$$P_{10} = P_{50} \exp(K_h \cdot q_{10})$$
$$P_{25} = P_{50} \exp(K_h \cdot q_{25})$$
$$P_{75} = P_{50} \exp(K_h \cdot q_{75})$$
$$P_{90} = P_{50} \exp(K_h \cdot q_{90})$$

Para cada corte del backtest, se calcula la holgura requerida $need_t$:
$$need_t = \begin{cases} \frac{\ln(P_{t+h} / P_{50})}{q_{90}} & \text{si } P_{t+h} \ge P_{50} \\ \frac{\ln(P_{t+h} / P_{50})}{q_{10}} & \text{si } P_{t+h} < P_{50} \end{cases}$$
$K_h$ se define como el cuantil 80 % de la distribución de $need_t$.

---

## 3. Resultados del Backtest Rodante (2019 - 2026)

El backtest se ejecutó día a día desde el 2 de enero de 2019 (2020-07-01 para WTI) hasta el 2 de noviembre de 2026 (cero fuga de información hacia el futuro, solo usando datos disponibles al cierre de cada jornada $t$).

### 3.1. Calibración en Muestra Completa (Producción)

| Símbolo | Horizonte | Cortes Evaluados | MAE P50 (RW) | MAE P50 (Deriva) | ¿Gana Deriva? | Cobertura Real 80% (P10-P90) | Cobertura Real 50% (P25-P75) | Ancho Medio Banda (%) | Factor $K$ Calibrado |
|---|---|---|---|---|---|---|---|---|---|
| **PEN** | $h = 1$ | 1,954 | 0.0100 | 0.0101 | **No** | **80.04 %** | 51.54 % | 0.88 % | 1.0180 |
| **PEN** | $h = 5$ | 1,950 | 0.0258 | 0.0280 | **No** | **80.05 %** | 51.28 % | 2.33 % | 1.0182 |
| **COBRE** | $h = 1$ | 2,042 | 0.0374 | 0.0381 | **No** | **80.02 %** | 50.34 % | 3.01 % | 1.0055 |
| **COBRE** | $h = 5$ | 2,038 | 0.0836 | 0.0910 | **No** | **80.03 %** | 52.50 % | 6.90 % | 1.0489 |
| **ORO** | $h = 1$ | 2,042 | 20.0176 | 20.3473 | **No** | **80.02 %** | 50.69 % | 2.52 % | 1.0096 |
| **ORO** | $h = 5$ | 2,038 | 45.9318 | 48.6519 | **No** | **80.03 %** | 52.80 % | 5.97 % | 1.0346 |
| **PLATA** | $h = 1$ | 2,042 | 0.5250 | 0.5363 | **No** | **80.02 %** | 52.15 % | 4.74 % | 1.0291 |
| **PLATA** | $h = 5$ | 2,038 | 1.2609 | 1.3327 | **No** | **80.03 %** | 52.85 % | 11.89 % | 1.0607 |
| **ZINC** | $h = 1$ | 2,042 | 0.0163 | 0.0166 | **No** | **80.02 %** | 52.55 % | 4.13 % | 1.0392 |
| **ZINC** | $h = 5$ | 2,038 | 0.0362 | 0.0399 | **No** | **79.98 %** | 52.40 % | 9.11 % | 1.0206 |
| **WTI** | $h = 1$ | 1,653 | 1.3892 | 1.4222 | **No** | **80.04 %** | 49.79 % | 6.06 % | 1.0412 |
| **WTI** | $h = 5$ | 1,649 | 3.1222 | 3.3900 | **No** | **80.05 %** | 49.18 % | 13.21 % | 1.0251 |

### 3.2. Calibración y Cobertura Fuera de Muestra (Entrenamiento 2019–2023, Prueba 2024–2026)

Para contrastar la validez de los cuantiles fuera de muestra y evitar el sobreajuste, se calibró el factor $K$ exclusivamente sobre los cortes anteriores al 2024 ($K_{\text{train}}$) y se midió la cobertura en la ventana estricta 2024–2026. Además, se evaluó la versión **K expansivo**, donde en cada corte $t$ de prueba, $K$ se calibra con los `need` acumulados hasta $t-1$.

| Símbolo | Horizonte | Cortes Prueba (2024-2026) | Factor $K$ Entrenado (2019-2023) | Cobertura 80% OOS ($K$ Fijo) | Cobertura 50% OOS ($K$ Fijo) | Ancho Medio OOS (%) | MAE P50 OOS | Cobertura 80% ($K$ Expansivo) | Cobertura 50% ($K$ Expansivo) | Ancho Medio ($K$ Expansivo) |
|---|---|---|---|---|---|---|---|---|---|---|
| **PEN** | $h = 1$ | 699 | 1.0183 | **80.40 %** | 51.36 % | 0.83 % | 0.0089 | **80.69 %** | 51.50 % | 0.83 % |
| **PEN** | $h = 5$ | 695 | 1.0650 | **84.46 %** | 53.81 % | 2.34 % | 0.0224 | **83.60 %** | 53.38 % | 2.30 % |
| **COBRE** | $h = 1$ | 740 | 1.0083 | **80.54 %** | 50.54 % | 2.78 % | 0.0424 | **80.41 %** | 49.86 % | 2.78 % |
| **COBRE** | $h = 5$ | 736 | 0.9908 | **74.73 %** | 47.01 % | 6.08 % | 0.1006 | **76.36 %** | 49.32 % | 6.39 % |
| **ORO** | $h = 1$ | 740 | 1.0021 | **79.05 %** | 49.86 % | 3.02 % | 34.9994 | **79.46 %** | 50.54 % | 3.06 % |
| **ORO** | $h = 5$ | 736 | 1.0120 | **77.31 %** | 51.63 % | 7.06 % | 79.5774 | **77.72 %** | 51.90 % | 7.16 % |
| **PLATA** | $h = 1$ | 740 | 1.0139 | **78.92 %** | 50.41 % | 5.89 % | 0.9809 | **79.05 %** | 50.68 % | 5.97 % |
| **PLATA** | $h = 5$ | 736 | 1.0917 | **82.34 %** | 55.03 % | 15.57 % | 2.3525 | **82.07 %** | 53.80 % | 15.25 % |
| **ZINC** | $h = 1$ | 740 | 1.0151 | **77.84 %** | 51.22 % | 3.87 % | 0.0162 | **78.92 %** | 51.35 % | 3.93 % |
| **ZINC** | $h = 5$ | 736 | 1.0096 | **79.08 %** | 52.04 % | 8.57 % | 0.0347 | **79.76 %** | 52.58 % | 8.73 % |
| **WTI** | $h = 1$ | 740 | 1.0485 | **80.27 %** | 53.24 % | 6.02 % | 1.4004 | **80.27 %** | 52.97 % | 6.01 % |
| **WTI** | $h = 5$ | 736 | 1.0162 | **78.80 %** | 48.23 % | 13.00 % | 3.2477 | **79.35 %** | 48.37 % | 13.08 % |

En producción se utiliza el factor $K$ de toda la historia disponible (columna *Factor $K$ Calibrado* de la muestra completa), respaldado por la cobertura real contrastada en la ventana fuera de muestra (entre 75 % y 85 % según el activo).

### Observaciones del Backtest
1. **Precisión del cono empírico:** El factor de calibración $K$ para USD/PEN se sitúa en $1.018$, lo que indica que el reescalamiento EWMA describe casi a la perfección la distribución condicional de colas del tipo de cambio sin necesidad de ensanchamientos artificiales.
2. **Cobertura 50 %:** Sin calibración secundaria para el rango intercuartílico, la cobertura real de $P_{25} - P_{75}$ resulta en $51.54 \%$ ($h=1$) y $51.28 \%$ ($h=5$), muy cercana al $50 \%$ nominal.
3. **Ancho promedio:** En USD/PEN, la banda al 80 % tiene un ancho promedio de $0.88 \%$ (~3 céntimos de sol) a 1 día hábil y $2.33 \%$ (~8 céntimos) a 5 días hábiles.
4. **Tratamiento de WTI:** Se excluyen los cortes con precios $\le 0$ (como la anomalía de abril de 2020) y se inicia el backtest el 2020-07-01, arrojando un ancho medio saludable de $6.06 \%$ ($h=1$) y $13.21 \%$ ($h=5$) sin distorsión de precios negativos ni anchos anómalos.

---

## 4. Prueba Experimental de Noticias GDELT

Se evaluó si la inclusión del tono mediático diario de GDELT 2.0 (`mode=timelinetone`, `sourcecountry:PE` / `peru`) y su derivada diaria ($\Delta \text{tono}_t = \text{tono}_t - \text{tono}_{t-1}$) aportan poder predictivo incremental sobre el USD/PEN.

### Protocolo Fuera de Muestra
- **Ventana de entrenamiento:** 2019-01-01 a 2023-12-31 ($1,255$ jornadas hábiles).
- **Ventana de prueba estricta:** 2024-01-01 a 2026-11-02 ($699$ jornadas en $h=1$; $695$ jornadas en $h=5$).
- **Modelo evaluado:** Desplazamiento lineal del retorno esperado $\hat{r}_{t, h} = \alpha + \beta_1 \cdot \text{tono}_t + \beta_2 \cdot \Delta \text{tono}_t$ frente al benchmark de Paseo Aleatorio ($P_{50} = P_t$).

### Resultados Comparativos

| Horizonte | Cortes Prueba | MAE Paseo Aleatorio | MAE con Noticias GDELT | Diferencia (%) | ¿Mejora Fuera de Muestra? |
|---|---|---|---|---|---|
| **$h = 1$ (Mañana)** | 699 | **0.00894** | 0.00896 | +0.33 % (peor) | **NO MEJORA** |
| **$h = 5$ (Próxima semana)** | 695 | **0.02242** | 0.02266 | +1.09 % (peor) | **NO MEJORA** |

Adicionalmente, la correlación entre el valor absoluto de la variación del tono mediático y la volatilidad realizada del tipo de cambio fue de apenas $0.013$ (estadísticamente indistinguible de cero).

### Decisión de Producción
Siguiendo la regla de veracidad de PerData: **las noticias no mejoran la precisión fuera de muestra y añaden ruido y sobreajuste**. En consecuencia, el tono noticioso **NO se incorpora** al motor diario de pronósticos en producción.

---

## 5. Lo que el Modelo NO Hace (Declaración Honesta)

1. **No es un oráculo direccional:** El modelo no sabe si el BCRP intervendrá en la mesa de dinero mañana ni anticipa anuncios sorpresivos de la Reserva Federal; en 2019-2026, ningún ajuste de tendencia mejoró al último cierre como centro.
2. **No predice cisnes negros discretos:** Un hecho inesperado puede dejar el precio fuera de la banda $P_{10} - P_{90}$. El modelo asume continuidad del proceso estocástico condicionado a la volatilidad reciente.
3. **No ofrece recomendaciones de compra/venta:** Las bandas $P_{10}-P_{90}$ representan un cono probabilístico del 80 % para gestión de tesorería y cobertura cambiaria, no una señal de especulación financiera.
