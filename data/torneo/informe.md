# Torneo del motor — ronda 1

Actualizado 2026-11-10T11:42Z · último dato 2026-11-06

Práctica 2021-2024 (ahí se eligen ajustes), examen 2025 (ajustes congelados), confirmación 2026 (no se usa para elegir).
Pinball: error del rango, menor es mejor. Razón < 1 = mejor que la referencia. p < 0,05 = la diferencia no parece azar.

## PEN · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.0769 | 86.7 | 0.82 | — | 1.014 (0.05) | 0.1013 | 79.4 | — |
| motor_actual | 0.0758 | 77.0 | 0.69 | 0.986 (0.05) | — | 0.1027 | 81.8 | — |
| fhs97_k | 0.0760 | 77.8 | 0.70 | 0.988 (0.07) | 1.002 (0.35) | 0.1037 | 83.7 | empata |
| aprende_vol | 0.0766 | 80.2 | 0.73 | 0.996 (0.60) | 1.010 (0.05) | 0.1001 | 83.7 | empata |
| aprende_vol_cal | 0.0765 | 80.6 | 0.74 | 0.995 (0.51) | 1.009 (0.06) | 0.1006 | 83.7 | empata |
| aprende_vol_noticias | 0.0767 | 80.6 | 0.74 | 0.997 (0.71) | 1.011 (0.01) | 0.1008 | 83.3 | empata |
| aprende_rango_cal | 0.0765 | 78.2 | 0.67 | 0.994 (0.61) | 1.008 (0.27) | 0.1005 | 78.9 | empata |
| aprende_rango_noticias | 0.0765 | 78.6 | 0.70 | 0.995 (0.60) | 1.009 (0.19) | 0.1006 | 78.9 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.31); el ancho del rango cambia 5.0 % en un día típico y 11.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.41); el ancho del rango cambia 4.5 % en un día típico y 10.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.86); el ancho del rango cambia 4.8 % en un día típico y 13.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.76); el ancho del rango cambia 5.0 % en un día típico y 13.1 % en los días de más noticias.

## PEN · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.1905 | 92.3 | 2.26 | — | 1.021 (0.09) | 0.2591 | 78.5 | — |
| motor_actual | 0.1866 | 83.1 | 1.84 | 0.979 (0.09) | — | 0.2614 | 82.4 | — |
| fhs97_k | 0.1871 | 83.1 | 1.84 | 0.982 (0.11) | 1.002 (0.45) | 0.2649 | 82.9 | empata |
| aprende_vol | 0.1886 | 85.5 | 1.94 | 0.990 (0.43) | 1.011 (0.03) | 0.2532 | 83.4 | empata |
| aprende_vol_cal | 0.1887 | 85.9 | 1.95 | 0.990 (0.45) | 1.011 (0.03) | 0.2536 | 85.4 | empata |
| aprende_vol_noticias | 0.1892 | 87.5 | 2.05 | 0.993 (0.45) | 1.014 (0.04) | 0.2527 | 86.8 | empata |
| aprende_rango_cal | 0.1950 | 74.6 | 1.64 | 1.023 (0.29) | 1.045 (0.00) | 0.2531 | 83.4 | pierde |
| aprende_rango_noticias | 0.1985 | 78.6 | 1.73 | 1.042 (0.05) | 1.064 (0.00) | 0.2623 | 83.9 | pierde |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.58); el ancho del rango cambia 5.9 % en un día típico y 21.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.996 frente al mismo motor sin noticias (p 0.45); el ancho del rango cambia 7.4 % en un día típico y 13.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.018 frente al mismo motor sin noticias (p 0.14); el ancho del rango cambia 7.9 % en un día típico y 22.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.036 frente al mismo motor sin noticias (p 0.08); el ancho del rango cambia 8.2 % en un día típico y 21.7 % en los días de más noticias.

## PEN · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3748 | 88.3 | 4.71 | — | 1.052 (0.00) | 0.4582 | 78.8 | — |
| motor_actual | 0.3563 | 82.3 | 3.83 | 0.951 (0.00) | — | 0.5264 | 78.3 | — |
| fhs97_k | 0.3593 | 83.9 | 4.12 | 0.959 (0.00) | 1.009 (0.20) | 0.5186 | 84.1 | empata |
| aprende_vol | 0.3643 | 86.3 | 4.27 | 0.972 (0.00) | 1.022 (0.02) | 0.4945 | 85.2 | empata |
| aprende_vol_cal | 0.3647 | 85.1 | 4.24 | 0.973 (0.01) | 1.024 (0.01) | 0.5090 | 84.1 | empata |
| aprende_vol_noticias | 0.3637 | 88.3 | 4.34 | 0.970 (0.00) | 1.021 (0.21) | 0.5031 | 82.5 | empata |
| aprende_rango_cal | 0.3990 | 73.0 | 3.44 | 1.065 (0.12) | 1.120 (0.00) | 0.5339 | 77.8 | pierde |
| aprende_rango_noticias | 0.4297 | 71.4 | 3.63 | 1.147 (0.03) | 1.206 (0.00) | 0.5361 | 74.6 | pierde |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.79); el ancho del rango cambia 6.0 % en un día típico y 15.6 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.988 frente al mismo motor sin noticias (p 0.29); el ancho del rango cambia 8.9 % en un día típico y 20.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.077 frente al mismo motor sin noticias (p 0.07); el ancho del rango cambia 7.7 % en un día típico y 20.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.96); el ancho del rango cambia 11.9 % en un día típico y 29.7 % en los días de más noticias.

## COBRE · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3028 | 86.2 | 2.82 | — | 0.995 (0.52) | 0.3565 | 73.8 | — |
| motor_actual | 0.3044 | 81.6 | 2.51 | 1.005 (0.52) | — | 0.3556 | 76.9 | — |
| fhs97_k | 0.3035 | 82.8 | 2.47 | 1.002 (0.71) | 0.997 (0.39) | 0.3566 | 77.4 | empata |
| aprende_vol | 0.3014 | 83.9 | 2.61 | 0.995 (0.58) | 0.990 (0.14) | 0.3521 | 76.5 | empata |
| aprende_vol_cal | 0.3022 | 83.9 | 2.63 | 0.998 (0.82) | 0.993 (0.27) | 0.3530 | 76.5 | empata |
| aprende_vol_noticias | 0.3021 | 83.1 | 2.59 | 0.998 (0.76) | 0.993 (0.22) | 0.3552 | 76.9 | empata |
| aprende_rango_cal | 0.3026 | 82.0 | 2.60 | 0.999 (0.92) | 0.994 (0.45) | 0.3564 | 76.9 | empata |
| aprende_rango_noticias | 0.3030 | 82.4 | 2.64 | 1.001 (0.95) | 0.995 (0.55) | 0.3570 | 77.8 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.000 frente al mismo motor sin noticias (p 0.91); el ancho del rango cambia 7.4 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 8.2 % en un día típico y 18.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.71); el ancho del rango cambia 5.3 % en un día típico y 13.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.79); el ancho del rango cambia 5.5 % en un día típico y 14.3 % en los días de más noticias.

## COBRE · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.6882 | 81.6 | 6.29 | — | 0.990 (0.38) | 0.7750 | 74.2 | — |
| motor_actual | 0.6949 | 76.2 | 5.54 | 1.010 (0.38) | — | 0.7721 | 76.5 | — |
| fhs97_k | 0.6957 | 78.9 | 5.49 | 1.011 (0.19) | 1.001 (0.80) | 0.7671 | 79.7 | empata |
| aprende_vol | 0.6861 | 80.8 | 5.91 | 0.997 (0.73) | 0.987 (0.16) | 0.7739 | 75.6 | empata |
| aprende_vol_cal | 0.6873 | 78.5 | 5.82 | 0.999 (0.89) | 0.989 (0.21) | 0.7742 | 75.6 | empata |
| aprende_vol_noticias | 0.6914 | 77.0 | 5.60 | 1.005 (0.61) | 0.995 (0.61) | 0.7700 | 75.6 | empata |
| aprende_rango_cal | 0.7021 | 72.0 | 5.64 | 1.020 (0.32) | 1.010 (0.63) | 0.7870 | 74.7 | empata |
| aprende_rango_noticias | 0.6999 | 74.3 | 5.49 | 1.017 (0.24) | 1.007 (0.66) | 0.7927 | 72.4 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.07); el ancho del rango cambia 5.3 % en un día típico y 11.2 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.13); el ancho del rango cambia 6.4 % en un día típico y 14.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.84); el ancho del rango cambia 9.4 % en un día típico y 20.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.007 frente al mismo motor sin noticias (p 0.67); el ancho del rango cambia 7.8 % en un día típico y 17.0 % en los días de más noticias.

## COBRE · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.4860 | 73.9 | 12.46 | — | 0.960 (0.12) | 1.2018 | 86.1 | — |
| motor_actual | 1.5478 | 68.6 | 10.88 | 1.042 (0.12) | — | 1.2176 | 93.5 | — |
| fhs97_k | 1.5290 | 69.7 | 11.49 | 1.029 (0.10) | 0.988 (0.23) | 1.2232 | 95.0 | empata |
| aprende_vol | 1.4869 | 71.3 | 12.34 | 1.001 (0.97) | 0.961 (0.10) | 1.2127 | 94.0 | empata |
| aprende_vol_cal | 1.4933 | 72.4 | 12.32 | 1.005 (0.63) | 0.965 (0.11) | 1.2055 | 93.0 | empata |
| aprende_vol_noticias | 1.4810 | 70.9 | 12.17 | 0.997 (0.76) | 0.957 (0.08) | 1.2024 | 91.5 | empata |
| aprende_rango_cal | 1.5828 | 70.5 | 12.24 | 1.065 (0.05) | 1.023 (0.48) | 1.1979 | 81.6 | empata |
| aprende_rango_noticias | 1.5880 | 66.3 | 11.32 | 1.069 (0.09) | 1.026 (0.44) | 1.2043 | 85.1 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.992 frente al mismo motor sin noticias (p 0.35); el ancho del rango cambia 9.9 % en un día típico y 20.4 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.76); el ancho del rango cambia 6.4 % en un día típico y 14.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.94); el ancho del rango cambia 15.1 % en un día típico y 31.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.90); el ancho del rango cambia 12.8 % en un día típico y 32.6 % en los días de más noticias.

## ORO · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3237 | 72.8 | 2.23 | — | 1.018 (0.14) | 0.5105 | 61.1 | — |
| motor_actual | 0.3180 | 77.8 | 2.37 | 0.982 (0.14) | — | 0.4884 | 80.5 | — |
| fhs97_k | 0.3191 | 79.3 | 2.63 | 0.986 (0.14) | 1.003 (0.38) | 0.4907 | 81.0 | empata |
| aprende_vol | 0.3163 | 78.2 | 2.59 | 0.977 (0.02) | 0.995 (0.28) | 0.4916 | 76.5 | empata |
| aprende_vol_cal | 0.3167 | 78.5 | 2.56 | 0.979 (0.03) | 0.996 (0.45) | 0.4896 | 77.4 | empata |
| aprende_vol_noticias | 0.3193 | 77.4 | 2.60 | 0.986 (0.18) | 1.004 (0.44) | 0.4910 | 77.4 | empata |
| aprende_rango_cal | 0.3187 | 76.2 | 2.44 | 0.985 (0.22) | 1.002 (0.83) | 0.4871 | 73.3 | empata |
| aprende_rango_noticias | 0.3195 | 75.9 | 2.35 | 0.987 (0.20) | 1.005 (0.59) | 0.4867 | 73.8 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.008 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 5.6 % en un día típico y 14.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.42); el ancho del rango cambia 6.5 % en un día típico y 19.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.68); el ancho del rango cambia 6.2 % en un día típico y 13.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.999 frente al mismo motor sin noticias (p 0.89); el ancho del rango cambia 6.7 % en un día típico y 16.3 % en los días de más noticias.

## ORO · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.7328 | 65.9 | 4.87 | — | 1.001 (0.94) | 1.1048 | 57.6 | — |
| motor_actual | 0.7320 | 73.6 | 5.47 | 0.999 (0.94) | — | 1.1260 | 77.9 | — |
| fhs97_k | 0.7300 | 79.7 | 6.21 | 0.996 (0.78) | 0.997 (0.68) | 1.1190 | 82.0 | empata |
| aprende_vol | 0.7172 | 75.9 | 5.66 | 0.979 (0.10) | 0.980 (0.01) | 1.1014 | 72.4 | empata |
| aprende_vol_cal | 0.7182 | 75.9 | 5.70 | 0.980 (0.11) | 0.981 (0.01) | 1.1015 | 71.4 | empata |
| aprende_vol_noticias | 0.7234 | 73.2 | 5.66 | 0.987 (0.20) | 0.988 (0.20) | 1.1024 | 72.8 | empata |
| aprende_rango_cal | 0.7518 | 68.6 | 5.34 | 1.026 (0.27) | 1.027 (0.25) | 1.0606 | 71.4 | empata |
| aprende_rango_noticias | 0.7305 | 66.3 | 5.08 | 0.997 (0.81) | 0.998 (0.91) | 1.1189 | 66.8 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.007 frente al mismo motor sin noticias (p 0.23); el ancho del rango cambia 7.2 % en un día típico y 17.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.86); el ancho del rango cambia 7.9 % en un día típico y 18.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.972 frente al mismo motor sin noticias (p 0.17); el ancho del rango cambia 9.8 % en un día típico y 18.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.055 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 11.5 % en un día típico y 30.3 % en los días de más noticias.

## ORO · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.5023 | 69.0 | 10.58 | — | 0.924 (0.01) | 2.4257 | 41.3 | — |
| motor_actual | 1.6252 | 68.2 | 11.28 | 1.082 (0.01) | — | 2.5937 | 65.7 | — |
| fhs97_k | 1.5624 | 75.1 | 12.99 | 1.040 (0.20) | 0.961 (0.01) | 2.6103 | 68.7 | empata |
| aprende_vol | 1.4506 | 80.1 | 12.68 | 0.966 (0.47) | 0.893 (0.01) | 2.4993 | 55.2 | empata |
| aprende_vol_cal | 1.4646 | 80.1 | 12.45 | 0.975 (0.63) | 0.901 (0.03) | 2.4690 | 54.7 | empata |
| aprende_vol_noticias | 1.5026 | 72.4 | 11.81 | 1.000 (0.99) | 0.925 (0.00) | 2.4556 | 57.7 | empata |
| aprende_rango_cal | 1.8662 | 52.5 | 9.88 | 1.242 (0.00) | 1.148 (0.09) | 2.2301 | 62.2 | pierde |
| aprende_rango_noticias | 1.6636 | 51.3 | 8.19 | 1.107 (0.02) | 1.024 (0.68) | 2.6547 | 39.3 | pierde |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.026 frente al mismo motor sin noticias (p 0.51); el ancho del rango cambia 12.7 % en un día típico y 26.5 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.68); el ancho del rango cambia 16.4 % en un día típico y 37.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.891 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 17.7 % en un día típico y 30.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.190 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 16.9 % en un día típico y 38.6 % en los días de más noticias.

## PLATA · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.5271 | 76.2 | 3.89 | — | 1.019 (0.08) | 1.0952 | 58.4 | — |
| motor_actual | 0.5172 | 77.4 | 3.47 | 0.981 (0.08) | — | 1.0282 | 80.5 | — |
| fhs97_k | 0.5179 | 77.4 | 3.70 | 0.983 (0.03) | 1.001 (0.70) | 1.0365 | 83.7 | empata |
| aprende_vol | 0.5176 | 81.6 | 4.34 | 0.982 (0.13) | 1.001 (0.92) | 1.0466 | 80.5 | empata |
| aprende_vol_cal | 0.5181 | 82.4 | 4.33 | 0.983 (0.13) | 1.002 (0.81) | 1.0429 | 77.8 | empata |
| aprende_vol_noticias | 0.5181 | 83.9 | 4.29 | 0.983 (0.13) | 1.002 (0.79) | 1.0477 | 80.5 | empata |
| aprende_rango_cal | 0.5255 | 74.3 | 3.78 | 0.997 (0.78) | 1.016 (0.03) | 1.0315 | 74.7 | empata |
| aprende_rango_noticias | 0.5221 | 76.2 | 3.76 | 0.990 (0.30) | 1.009 (0.19) | 1.0319 | 76.9 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.000 frente al mismo motor sin noticias (p 1.00); el ancho del rango cambia 8.3 % en un día típico y 23.4 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.30); el ancho del rango cambia 10.7 % en un día típico y 30.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.993 frente al mismo motor sin noticias (p 0.11); el ancho del rango cambia 6.1 % en un día típico y 15.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.000 frente al mismo motor sin noticias (p 0.95); el ancho del rango cambia 6.3 % en un día típico y 20.1 % en los días de más noticias.

## PLATA · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.2224 | 78.2 | 10.38 | — | 1.024 (0.15) | 2.5256 | 57.6 | — |
| motor_actual | 1.1939 | 79.7 | 8.72 | 0.977 (0.15) | — | 2.4428 | 79.7 | — |
| fhs97_k | 1.1985 | 80.5 | 9.56 | 0.980 (0.15) | 1.004 (0.40) | 2.4805 | 83.9 | empata |
| aprende_vol | 1.1863 | 81.2 | 10.69 | 0.970 (0.01) | 0.994 (0.58) | 2.4412 | 68.7 | empata |
| aprende_vol_cal | 1.1962 | 81.2 | 10.70 | 0.979 (0.05) | 1.002 (0.86) | 2.4516 | 68.2 | empata |
| aprende_vol_noticias | 1.1976 | 80.8 | 10.55 | 0.980 (0.05) | 1.003 (0.80) | 2.4269 | 70.0 | empata |
| aprende_rango_cal | 1.3224 | 71.6 | 9.31 | 1.082 (0.00) | 1.108 (0.00) | 2.4178 | 68.2 | pierde |
| aprende_rango_noticias | 1.2703 | 72.0 | 9.29 | 1.039 (0.01) | 1.064 (0.00) | 2.4928 | 70.0 | pierde |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.78); el ancho del rango cambia 5.6 % en un día típico y 14.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.990 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 7.7 % en un día típico y 18.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.961 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 7.0 % en un día típico y 15.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.031 frente al mismo motor sin noticias (p 0.09); el ancho del rango cambia 10.8 % en un día típico y 35.1 % en los días de más noticias.

## PLATA · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 3.4069 | 68.6 | 18.57 | — | 1.062 (0.31) | 4.4403 | 52.2 | — |
| motor_actual | 3.2092 | 65.1 | 16.82 | 0.942 (0.31) | — | 4.9485 | 70.6 | — |
| fhs97_k | 3.2529 | 66.7 | 17.71 | 0.955 (0.30) | 1.014 (0.36) | 5.0442 | 72.1 | empata |
| aprende_vol | 3.3424 | 67.0 | 19.02 | 0.981 (0.54) | 1.042 (0.16) | 4.5051 | 60.7 | empata |
| aprende_vol_cal | 3.3545 | 66.3 | 19.03 | 0.985 (0.58) | 1.045 (0.17) | 4.5090 | 61.2 | empata |
| aprende_vol_noticias | 3.4050 | 67.0 | 18.91 | 0.999 (0.97) | 1.061 (0.16) | 4.4570 | 62.2 | empata |
| aprende_rango_cal | 3.8692 | 59.4 | 18.11 | 1.136 (0.00) | 1.206 (0.01) | 4.6514 | 54.2 | pierde |
| aprende_rango_noticias | 3.5767 | 62.1 | 15.93 | 1.050 (0.16) | 1.115 (0.10) | 5.3612 | 51.7 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.015 frente al mismo motor sin noticias (p 0.23); el ancho del rango cambia 5.1 % en un día típico y 13.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.988 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 7.9 % en un día típico y 16.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.924 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 17.6 % en un día típico y 32.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.153 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 18.2 % en un día típico y 54.9 % en los días de más noticias.

## ZINC · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.4058 | 87.0 | 4.24 | — | 1.009 (0.31) | 0.4024 | 81.4 | — |
| motor_actual | 0.4021 | 76.6 | 3.30 | 0.991 (0.31) | — | 0.4032 | 76.9 | — |
| fhs97_k | 0.4014 | 78.5 | 3.42 | 0.989 (0.14) | 0.998 (0.58) | 0.4024 | 80.1 | empata |
| aprende_vol | 0.4035 | 81.6 | 3.93 | 0.994 (0.49) | 1.004 (0.54) | 0.4035 | 81.4 | empata |
| aprende_vol_cal | 0.4040 | 82.0 | 3.97 | 0.996 (0.58) | 1.005 (0.44) | 0.4027 | 81.0 | empata |
| aprende_vol_noticias | 0.4014 | 82.0 | 4.23 | 0.989 (0.18) | 0.998 (0.81) | 0.4052 | 79.2 | empata |
| aprende_rango_cal | 0.4022 | 77.4 | 3.34 | 0.991 (0.30) | 1.000 (0.98) | 0.4018 | 77.4 | empata |
| aprende_rango_noticias | 0.4003 | 78.5 | 3.42 | 0.986 (0.13) | 0.995 (0.49) | 0.4044 | 76.5 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.993 frente al mismo motor sin noticias (p 0.15); el ancho del rango cambia 10.4 % en un día típico y 22.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.11); el ancho del rango cambia 7.8 % en un día típico y 21.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.995 frente al mismo motor sin noticias (p 0.29); el ancho del rango cambia 3.7 % en un día típico y 9.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.28); el ancho del rango cambia 3.9 % en un día típico y 11.0 % en los días de más noticias.

## ZINC · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.8282 | 89.7 | 9.55 | — | 1.009 (0.57) | 0.8364 | 82.5 | — |
| motor_actual | 0.8210 | 80.5 | 7.53 | 0.991 (0.57) | — | 0.8408 | 79.3 | — |
| fhs97_k | 0.8130 | 81.2 | 7.77 | 0.982 (0.15) | 0.990 (0.02) | 0.8362 | 82.5 | empata |
| aprende_vol | 0.8174 | 83.9 | 8.36 | 0.987 (0.18) | 0.996 (0.56) | 0.8329 | 80.6 | empata |
| aprende_vol_cal | 0.8164 | 84.3 | 8.43 | 0.986 (0.13) | 0.994 (0.48) | 0.8325 | 80.2 | empata |
| aprende_vol_noticias | 0.8181 | 87.7 | 8.66 | 0.988 (0.14) | 0.996 (0.72) | 0.8368 | 77.4 | empata |
| aprende_rango_cal | 0.8177 | 80.8 | 7.88 | 0.987 (0.54) | 0.996 (0.81) | 0.8222 | 80.2 | empata |
| aprende_rango_noticias | 0.8420 | 80.5 | 7.46 | 1.017 (0.59) | 1.026 (0.34) | 0.8441 | 73.7 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.59); el ancho del rango cambia 5.0 % en un día típico y 11.2 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 5.1 % en un día típico y 11.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.030 frente al mismo motor sin noticias (p 0.10); el ancho del rango cambia 8.4 % en un día típico y 22.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.027 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 11.0 % en un día típico y 27.6 % en los días de más noticias.

## ZINC · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.5475 | 91.6 | 18.88 | — | 0.997 (0.94) | 1.4685 | 82.6 | — |
| motor_actual | 1.5516 | 79.3 | 14.83 | 1.003 (0.94) | — | 1.4903 | 82.1 | — |
| fhs97_k | 1.5467 | 83.1 | 16.04 | 0.999 (0.99) | 0.997 (0.76) | 1.4838 | 83.6 | empata |
| aprende_vol | 1.5417 | 84.3 | 17.26 | 0.996 (0.86) | 0.994 (0.72) | 1.4774 | 84.1 | empata |
| aprende_vol_cal | 1.5323 | 85.1 | 16.99 | 0.990 (0.62) | 0.988 (0.59) | 1.4747 | 83.1 | empata |
| aprende_vol_noticias | 1.5229 | 92.7 | 17.87 | 0.984 (0.22) | 0.981 (0.56) | 1.4889 | 78.1 | empata |
| aprende_rango_cal | 1.4990 | 88.5 | 15.66 | 0.969 (0.59) | 0.966 (0.48) | 1.4250 | 84.1 | empata |
| aprende_rango_noticias | 1.5336 | 83.9 | 14.82 | 0.991 (0.90) | 0.988 (0.86) | 1.4844 | 87.1 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.994 frente al mismo motor sin noticias (p 0.64); el ancho del rango cambia 7.1 % en un día típico y 23.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.010 frente al mismo motor sin noticias (p 0.57); el ancho del rango cambia 8.5 % en un día típico y 18.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.023 frente al mismo motor sin noticias (p 0.43); el ancho del rango cambia 11.6 % en un día típico y 24.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.042 frente al mismo motor sin noticias (p 0.24); el ancho del rango cambia 17.5 % en un día típico y 38.9 % en los días de más noticias.

## WTI · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.5052 | 85.4 | 5.04 | — | 1.008 (0.31) | 1.0636 | 57.0 | — |
| motor_actual | 0.5011 | 81.2 | 4.14 | 0.992 (0.31) | — | 1.0132 | 75.1 | — |
| fhs97_k | 0.5010 | 82.4 | 4.33 | 0.992 (0.14) | 1.000 (0.93) | 1.0118 | 75.6 | empata |
| aprende_vol | 0.5077 | 81.6 | 4.55 | 1.005 (0.51) | 1.013 (0.02) | 1.0319 | 76.9 | empata |
| aprende_vol_cal | 0.5047 | 82.8 | 4.47 | 0.999 (0.90) | 1.007 (0.20) | 1.0314 | 74.7 | empata |
| aprende_vol_noticias | 0.5040 | 82.4 | 4.47 | 0.998 (0.76) | 1.006 (0.30) | 1.0270 | 74.7 | empata |
| aprende_rango_cal | 0.5005 | 82.8 | 4.36 | 0.991 (0.27) | 0.999 (0.86) | 1.0440 | 72.9 | empata |
| aprende_rango_noticias | 0.5028 | 81.6 | 4.25 | 0.995 (0.60) | 1.003 (0.63) | 1.0410 | 71.9 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.999 frente al mismo motor sin noticias (p 0.75); el ancho del rango cambia 7.2 % en un día típico y 18.5 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.996 frente al mismo motor sin noticias (p 0.17); el ancho del rango cambia 6.0 % en un día típico y 15.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.005 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 4.1 % en un día típico y 10.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.49); el ancho del rango cambia 4.3 % en un día típico y 11.2 % en los días de más noticias.

## WTI · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.2109 | 85.1 | 11.67 | — | 0.999 (0.96) | 2.5207 | 47.9 | — |
| motor_actual | 1.2116 | 80.1 | 9.46 | 1.001 (0.96) | — | 2.3120 | 76.5 | — |
| fhs97_k | 1.2070 | 81.2 | 10.05 | 0.997 (0.72) | 0.996 (0.33) | 2.2997 | 77.4 | empata |
| aprende_vol | 1.2166 | 80.5 | 9.92 | 1.005 (0.62) | 1.004 (0.55) | 2.3570 | 68.7 | empata |
| aprende_vol_cal | 1.2170 | 80.8 | 9.90 | 1.005 (0.59) | 1.004 (0.49) | 2.3628 | 67.7 | empata |
| aprende_vol_noticias | 1.2210 | 80.5 | 9.58 | 1.008 (0.46) | 1.008 (0.30) | 2.3703 | 68.7 | empata |
| aprende_rango_cal | 1.1844 | 81.2 | 9.94 | 0.978 (0.11) | 0.978 (0.15) | 2.4625 | 63.1 | empata |
| aprende_rango_noticias | 1.1886 | 77.4 | 9.11 | 0.982 (0.21) | 0.981 (0.21) | 2.4581 | 59.4 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.27); el ancho del rango cambia 3.4 % en un día típico y 7.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.39); el ancho del rango cambia 5.3 % en un día típico y 13.9 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 8.6 % en un día típico y 14.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.998 frente al mismo motor sin noticias (p 0.87); el ancho del rango cambia 7.9 % en un día típico y 21.4 % en los días de más noticias.

## WTI · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.7594 | 90.4 | 19.17 | — | 0.976 (0.36) | 5.5494 | 46.8 | — |
| motor_actual | 1.8028 | 83.9 | 16.42 | 1.025 (0.36) | — | 5.3720 | 66.7 | — |
| fhs97_k | 1.7881 | 86.2 | 17.27 | 1.016 (0.38) | 0.992 (0.39) | 5.3387 | 67.2 | empata |
| aprende_vol | 1.7747 | 86.6 | 17.49 | 1.009 (0.48) | 0.984 (0.39) | 5.4504 | 58.7 | empata |
| aprende_vol_cal | 1.7854 | 85.8 | 17.40 | 1.015 (0.37) | 0.990 (0.56) | 5.4601 | 57.7 | empata |
| aprende_vol_noticias | 1.7955 | 84.7 | 17.20 | 1.021 (0.37) | 0.996 (0.84) | 5.4728 | 54.7 | empata |
| aprende_rango_cal | 1.8962 | 92.7 | 23.16 | 1.078 (0.19) | 1.052 (0.39) | 6.2196 | 52.2 | empata |
| aprende_rango_noticias | 1.7061 | 86.2 | 18.66 | 0.970 (0.52) | 0.946 (0.25) | 5.7219 | 47.8 | empata |

- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.52); el ancho del rango cambia 9.3 % en un día típico y 18.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.81); el ancho del rango cambia 11.4 % en un día típico y 28.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.900 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 22.2 % en un día típico y 33.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.920 frente al mismo motor sin noticias (p 0.04); el ancho del rango cambia 20.2 % en un día típico y 51.3 % en los días de más noticias.

