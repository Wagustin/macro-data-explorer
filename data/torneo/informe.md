# Torneo del motor — ronda 2

Actualizado 2026-11-12T05:21Z · último dato 2026-11-10

Práctica 2021-2024 (ahí se eligen ajustes), examen 2025 (ajustes congelados), confirmación 2026 (no se usa para elegir).
Pinball: error del rango, menor es mejor. Razón < 1 = mejor que la referencia. p < 0,05 = la diferencia no parece azar.

## PEN · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.0769 | 86.7 | 0.82 | — | 1.014 (0.05) | 0.1012 | 79.1 | — |
| motor_actual | 0.0758 | 77.0 | 0.69 | 0.986 (0.05) | — | 0.1026 | 81.5 | — |
| fhs97_k | 0.0760 | 77.8 | 0.70 | 0.988 (0.07) | 1.002 (0.35) | 0.1035 | 83.4 | empata |
| analogos | 0.0760 | 77.0 | 0.69 | 0.989 (0.15) | 1.003 (0.34) | 0.1018 | 82.9 | empata |
| aprende_vol | 0.0766 | 80.2 | 0.73 | 0.996 (0.60) | 1.010 (0.05) | 0.1000 | 83.4 | empata |
| aprende_vol_cal | 0.0765 | 80.6 | 0.74 | 0.995 (0.51) | 1.009 (0.06) | 0.1005 | 83.4 | empata |
| aprende_vol_noticias | 0.0767 | 80.6 | 0.74 | 0.997 (0.71) | 1.011 (0.01) | 0.1007 | 82.9 | empata |
| aprende_vol_corpus | 0.0766 | 82.3 | 0.74 | 0.996 (0.62) | 1.010 (0.10) | 0.1002 | 84.4 | empata |
| aprende_vol_cruz | 0.0766 | 81.0 | 0.74 | 0.996 (0.56) | 1.009 (0.05) | 0.1009 | 84.4 | empata |
| aprende_rango_cal | 0.0765 | 78.2 | 0.67 | 0.994 (0.61) | 1.008 (0.27) | 0.1003 | 79.1 | empata |
| aprende_rango_noticias | 0.0765 | 78.6 | 0.70 | 0.995 (0.60) | 1.009 (0.19) | 0.1005 | 78.7 | empata |
| mezcla | 0.0760 | 79.8 | 0.72 | 0.988 (0.09) | 1.002 (0.42) | 0.1011 | 82.9 | empata |

- Días con noticias del corpus: práctica 452, examen 2025 239, confirmación 2026 212.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.31); el ancho del rango cambia 5.0 % en un día típico y 11.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.40); el ancho del rango cambia 4.5 % en un día típico y 10.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.86); el ancho del rango cambia 4.8 % en un día típico y 13.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.75); el ancho del rango cambia 4.9 % en un día típico y 13.1 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.78); el ancho del rango cambia 8.7 % en un día típico y 22.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.996 frente al mismo motor sin noticias (p 0.49); el ancho del rango cambia 11.0 % en un día típico y 25.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.85); el ancho del rango cambia 6.3 % en un día típico y 15.9 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.46); el ancho del rango cambia 8.1 % en un día típico y 18.0 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.34); el ancho del rango cambia 5.5 % en un día típico y 13.5 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 0.992 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 7.4 % en un día típico y 16.3 % en los días de más noticias.

## PEN · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.1905 | 92.3 | 2.26 | — | 1.021 (0.09) | 0.2607 | 77.8 | — |
| motor_actual | 0.1866 | 83.1 | 1.84 | 0.979 (0.09) | — | 0.2635 | 81.6 | — |
| fhs97_k | 0.1871 | 83.1 | 1.84 | 0.982 (0.11) | 1.002 (0.45) | 0.2667 | 82.1 | empata |
| analogos | 0.1890 | 81.5 | 1.84 | 0.992 (0.55) | 1.013 (0.00) | 0.2647 | 82.6 | empata |
| aprende_vol | 0.1886 | 85.5 | 1.94 | 0.990 (0.43) | 1.011 (0.03) | 0.2556 | 82.6 | empata |
| aprende_vol_cal | 0.1887 | 85.9 | 1.95 | 0.990 (0.45) | 1.011 (0.03) | 0.2561 | 84.5 | empata |
| aprende_vol_noticias | 0.1892 | 87.5 | 2.05 | 0.993 (0.45) | 1.014 (0.04) | 0.2554 | 86.0 | empata |
| aprende_vol_corpus | 0.1902 | 87.1 | 2.00 | 0.998 (0.85) | 1.019 (0.00) | 0.2547 | 85.0 | empata |
| aprende_vol_cruz | 0.1879 | 86.7 | 2.01 | 0.986 (0.24) | 1.007 (0.33) | 0.2545 | 85.5 | empata |
| aprende_rango_cal | 0.1950 | 74.6 | 1.64 | 1.023 (0.29) | 1.045 (0.00) | 0.2555 | 82.6 | pierde |
| aprende_rango_noticias | 0.1985 | 78.6 | 1.73 | 1.042 (0.05) | 1.064 (0.00) | 0.2646 | 83.1 | pierde |
| mezcla | 0.1874 | 85.1 | 1.90 | 0.984 (0.17) | 1.004 (0.12) | 0.2585 | 83.6 | empata |

- Días con noticias del corpus: práctica 452, examen 2025 239, confirmación 2026 212.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.58); el ancho del rango cambia 5.9 % en un día típico y 21.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.56); el ancho del rango cambia 7.4 % en un día típico y 13.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.018 frente al mismo motor sin noticias (p 0.14); el ancho del rango cambia 7.9 % en un día típico y 22.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.036 frente al mismo motor sin noticias (p 0.08); el ancho del rango cambia 8.2 % en un día típico y 21.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.008 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 5.2 % en un día típico y 15.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.26); el ancho del rango cambia 6.6 % en un día típico y 17.0 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.995 frente al mismo motor sin noticias (p 0.30); el ancho del rango cambia 6.9 % en un día típico y 16.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.994 frente al mismo motor sin noticias (p 0.38); el ancho del rango cambia 7.7 % en un día típico y 22.4 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.013 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 5.5 % en un día típico y 15.0 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.45); el ancho del rango cambia 6.7 % en un día típico y 16.3 % en los días de más noticias.

## PEN · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3748 | 88.3 | 4.71 | — | 1.052 (0.00) | 0.4559 | 79.1 | — |
| motor_actual | 0.3563 | 82.3 | 3.83 | 0.951 (0.00) | — | 0.5234 | 78.5 | — |
| fhs97_k | 0.3593 | 83.9 | 4.12 | 0.959 (0.00) | 1.009 (0.20) | 0.5159 | 84.3 | empata |
| analogos | 0.3550 | 85.5 | 3.90 | 0.947 (0.00) | 0.996 (0.51) | 0.5270 | 77.5 | empata |
| aprende_vol | 0.3643 | 86.3 | 4.27 | 0.972 (0.00) | 1.022 (0.02) | 0.4920 | 85.3 | empata |
| aprende_vol_cal | 0.3647 | 85.1 | 4.24 | 0.973 (0.01) | 1.024 (0.01) | 0.5064 | 84.3 | empata |
| aprende_vol_noticias | 0.3637 | 88.3 | 4.34 | 0.970 (0.00) | 1.021 (0.21) | 0.5006 | 82.7 | empata |
| aprende_vol_corpus | 0.3662 | 87.1 | 4.36 | 0.977 (0.00) | 1.028 (0.02) | 0.5030 | 82.7 | empata |
| aprende_vol_cruz | 0.3749 | 85.5 | 4.20 | 1.000 (0.99) | 1.052 (0.00) | 0.5106 | 87.4 | empata |
| aprende_rango_cal | 0.3990 | 73.0 | 3.44 | 1.065 (0.12) | 1.120 (0.00) | 0.5303 | 78.0 | pierde |
| aprende_rango_noticias | 0.4297 | 71.4 | 3.63 | 1.147 (0.03) | 1.206 (0.00) | 0.5329 | 74.9 | pierde |
| mezcla | 0.3600 | 83.9 | 4.07 | 0.961 (0.00) | 1.011 (0.02) | 0.5127 | 81.7 | empata |

- Días con noticias del corpus: práctica 452, examen 2025 239, confirmación 2026 212.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.79); el ancho del rango cambia 6.0 % en un día típico y 15.6 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.989 frente al mismo motor sin noticias (p 0.29); el ancho del rango cambia 9.0 % en un día típico y 22.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.077 frente al mismo motor sin noticias (p 0.07); el ancho del rango cambia 7.7 % en un día típico y 20.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.95); el ancho del rango cambia 11.8 % en un día típico y 29.7 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.004 frente al mismo motor sin noticias (p 0.42); el ancho del rango cambia 5.0 % en un día típico y 12.7 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.993 frente al mismo motor sin noticias (p 0.24); el ancho del rango cambia 4.5 % en un día típico y 10.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.028 frente al mismo motor sin noticias (p 0.04); el ancho del rango cambia 6.5 % en un día típico y 16.4 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.008 frente al mismo motor sin noticias (p 0.80); el ancho del rango cambia 15.4 % en un día típico y 73.5 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.996 frente al mismo motor sin noticias (p 0.51); el ancho del rango cambia 7.5 % en un día típico y 18.7 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.007 frente al mismo motor sin noticias (p 0.31); el ancho del rango cambia 9.2 % en un día típico y 16.9 % en los días de más noticias.

## COBRE · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3028 | 86.2 | 2.82 | — | 0.995 (0.52) | 0.3556 | 73.9 | — |
| motor_actual | 0.3044 | 81.6 | 2.51 | 1.005 (0.52) | — | 0.3547 | 77.0 | — |
| fhs97_k | 0.3035 | 82.8 | 2.47 | 1.002 (0.71) | 0.997 (0.39) | 0.3557 | 77.5 | empata |
| analogos | 0.3041 | 80.1 | 2.51 | 1.004 (0.64) | 0.999 (0.74) | 0.3551 | 76.1 | empata |
| aprende_vol | 0.3014 | 83.9 | 2.61 | 0.995 (0.58) | 0.990 (0.14) | 0.3512 | 76.6 | empata |
| aprende_vol_cal | 0.3022 | 83.9 | 2.63 | 0.998 (0.82) | 0.993 (0.27) | 0.3521 | 76.6 | empata |
| aprende_vol_noticias | 0.3021 | 83.1 | 2.59 | 0.998 (0.76) | 0.993 (0.22) | 0.3543 | 77.0 | empata |
| aprende_vol_corpus | 0.3031 | 81.2 | 2.61 | 1.001 (0.93) | 0.996 (0.61) | 0.3569 | 74.3 | empata |
| aprende_vol_cruz | 0.3010 | 84.7 | 2.54 | 0.994 (0.51) | 0.989 (0.07) | 0.3588 | 77.5 | empata |
| aprende_rango_cal | 0.3026 | 82.0 | 2.60 | 0.999 (0.92) | 0.994 (0.45) | 0.3556 | 77.0 | empata |
| aprende_rango_noticias | 0.3030 | 82.4 | 2.64 | 1.001 (0.95) | 0.995 (0.55) | 0.3561 | 77.9 | empata |
| mezcla | 0.3024 | 83.1 | 2.57 | 0.999 (0.86) | 0.994 (0.04) | 0.3521 | 76.6 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.000 frente al mismo motor sin noticias (p 0.91); el ancho del rango cambia 7.4 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 8.2 % en un día típico y 18.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.71); el ancho del rango cambia 5.3 % en un día típico y 13.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.80); el ancho del rango cambia 5.4 % en un día típico y 14.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 14.5 % en un día típico y 38.0 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.014 frente al mismo motor sin noticias (p 0.04); el ancho del rango cambia 15.5 % en un día típico y 35.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.996 frente al mismo motor sin noticias (p 0.27); el ancho del rango cambia 9.1 % en un día típico y 23.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.019 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 10.2 % en un día típico y 27.9 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.999 frente al mismo motor sin noticias (p 0.74); el ancho del rango cambia 5.2 % en un día típico y 14.8 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.72); el ancho del rango cambia 7.2 % en un día típico y 16.3 % en los días de más noticias.

## COBRE · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.6882 | 81.6 | 6.29 | — | 0.990 (0.38) | 0.7752 | 74.3 | — |
| motor_actual | 0.6949 | 76.2 | 5.54 | 1.010 (0.38) | — | 0.7726 | 76.1 | — |
| fhs97_k | 0.6957 | 78.9 | 5.49 | 1.011 (0.19) | 1.001 (0.80) | 0.7676 | 79.4 | empata |
| analogos | 0.6974 | 76.6 | 5.44 | 1.013 (0.29) | 1.004 (0.38) | 0.7761 | 76.1 | empata |
| aprende_vol | 0.6861 | 80.8 | 5.91 | 0.997 (0.73) | 0.987 (0.16) | 0.7743 | 75.2 | empata |
| aprende_vol_cal | 0.6873 | 78.5 | 5.82 | 0.999 (0.89) | 0.989 (0.21) | 0.7746 | 75.2 | empata |
| aprende_vol_noticias | 0.6914 | 77.0 | 5.60 | 1.005 (0.61) | 0.995 (0.61) | 0.7705 | 75.2 | empata |
| aprende_vol_corpus | 0.6901 | 76.6 | 5.52 | 1.003 (0.81) | 0.993 (0.48) | 0.7765 | 75.2 | empata |
| aprende_vol_cruz | 0.6876 | 77.4 | 5.67 | 0.999 (0.93) | 0.990 (0.25) | 0.7750 | 76.6 | empata |
| aprende_rango_cal | 0.7021 | 72.0 | 5.64 | 1.020 (0.32) | 1.010 (0.63) | 0.7870 | 74.3 | empata |
| aprende_rango_noticias | 0.6999 | 74.3 | 5.49 | 1.017 (0.24) | 1.007 (0.66) | 0.7936 | 72.0 | empata |
| mezcla | 0.6892 | 77.8 | 5.59 | 1.001 (0.87) | 0.992 (0.06) | 0.7710 | 77.1 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.07); el ancho del rango cambia 5.3 % en un día típico y 11.2 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.14); el ancho del rango cambia 6.3 % en un día típico y 14.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.84); el ancho del rango cambia 9.4 % en un día típico y 20.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.008 frente al mismo motor sin noticias (p 0.62); el ancho del rango cambia 7.8 % en un día típico y 16.9 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.004 frente al mismo motor sin noticias (p 0.51); el ancho del rango cambia 8.2 % en un día típico y 22.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.75); el ancho del rango cambia 11.5 % en un día típico y 25.0 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.000 frente al mismo motor sin noticias (p 0.88); el ancho del rango cambia 4.5 % en un día típico y 11.7 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.92); el ancho del rango cambia 5.6 % en un día típico y 15.6 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.004 frente al mismo motor sin noticias (p 0.38); el ancho del rango cambia 8.4 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.26); el ancho del rango cambia 6.7 % en un día típico y 16.3 % en los días de más noticias.

## COBRE · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.4860 | 73.9 | 12.46 | — | 0.960 (0.12) | 1.2050 | 86.1 | — |
| motor_actual | 1.5478 | 68.6 | 10.88 | 1.042 (0.12) | — | 1.2214 | 93.1 | — |
| fhs97_k | 1.5290 | 69.7 | 11.49 | 1.029 (0.10) | 0.988 (0.23) | 1.2267 | 94.6 | empata |
| analogos | 1.5492 | 68.6 | 10.54 | 1.043 (0.15) | 1.001 (0.87) | 1.2334 | 92.1 | empata |
| aprende_vol | 1.4869 | 71.3 | 12.34 | 1.001 (0.97) | 0.961 (0.10) | 1.2162 | 93.6 | empata |
| aprende_vol_cal | 1.4933 | 72.4 | 12.32 | 1.005 (0.63) | 0.965 (0.11) | 1.2090 | 92.6 | empata |
| aprende_vol_noticias | 1.4810 | 70.9 | 12.17 | 0.997 (0.76) | 0.957 (0.08) | 1.2057 | 91.1 | empata |
| aprende_vol_corpus | 1.5026 | 76.2 | 12.98 | 1.011 (0.25) | 0.971 (0.31) | 1.2177 | 90.1 | empata |
| aprende_vol_cruz | 1.4974 | 72.4 | 12.12 | 1.008 (0.34) | 0.967 (0.12) | 1.1956 | 92.6 | empata |
| aprende_rango_cal | 1.5828 | 70.5 | 12.24 | 1.065 (0.05) | 1.023 (0.48) | 1.2018 | 81.2 | empata |
| aprende_rango_noticias | 1.5880 | 66.3 | 11.32 | 1.069 (0.09) | 1.026 (0.44) | 1.2091 | 84.7 | empata |
| mezcla | 1.5141 | 70.5 | 11.45 | 1.019 (0.22) | 0.978 (0.07) | 1.2093 | 92.6 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.992 frente al mismo motor sin noticias (p 0.35); el ancho del rango cambia 9.9 % en un día típico y 20.4 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.74); el ancho del rango cambia 6.5 % en un día típico y 14.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.94); el ancho del rango cambia 15.1 % en un día típico y 31.0 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.88); el ancho del rango cambia 12.6 % en un día típico y 32.5 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 10.8 % en un día típico y 24.7 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.007 frente al mismo motor sin noticias (p 0.45); el ancho del rango cambia 10.5 % en un día típico y 23.9 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.70); el ancho del rango cambia 7.2 % en un día típico y 17.7 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.989 frente al mismo motor sin noticias (p 0.10); el ancho del rango cambia 6.8 % en un día típico y 14.6 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.87); el ancho del rango cambia 6.4 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.010 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 6.1 % en un día típico y 16.3 % en los días de más noticias.

## ORO · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.3237 | 72.8 | 2.23 | — | 1.018 (0.14) | 0.5103 | 60.8 | — |
| motor_actual | 0.3180 | 77.8 | 2.37 | 0.982 (0.14) | — | 0.4881 | 80.6 | — |
| fhs97_k | 0.3191 | 79.3 | 2.63 | 0.986 (0.14) | 1.003 (0.38) | 0.4904 | 81.1 | empata |
| analogos | 0.3189 | 77.4 | 2.39 | 0.985 (0.21) | 1.003 (0.26) | 0.4895 | 79.3 | empata |
| aprende_vol | 0.3163 | 78.2 | 2.59 | 0.977 (0.02) | 0.995 (0.28) | 0.4912 | 76.6 | empata |
| aprende_vol_cal | 0.3167 | 78.5 | 2.56 | 0.979 (0.03) | 0.996 (0.45) | 0.4892 | 77.5 | empata |
| aprende_vol_noticias | 0.3193 | 77.4 | 2.60 | 0.986 (0.18) | 1.004 (0.44) | 0.4906 | 77.5 | empata |
| aprende_vol_corpus | 0.3202 | 78.9 | 2.69 | 0.989 (0.30) | 1.007 (0.27) | 0.4934 | 78.8 | empata |
| aprende_vol_cruz | 0.3173 | 79.3 | 2.63 | 0.980 (0.07) | 0.998 (0.70) | 0.4912 | 76.6 | empata |
| aprende_rango_cal | 0.3187 | 76.2 | 2.44 | 0.985 (0.22) | 1.002 (0.83) | 0.4871 | 73.0 | empata |
| aprende_rango_noticias | 0.3195 | 75.9 | 2.35 | 0.987 (0.20) | 1.005 (0.59) | 0.4863 | 73.9 | empata |
| mezcla | 0.3168 | 78.9 | 2.43 | 0.979 (0.05) | 0.996 (0.15) | 0.4857 | 80.2 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.008 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 5.6 % en un día típico y 14.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.43); el ancho del rango cambia 6.6 % en un día típico y 19.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.68); el ancho del rango cambia 6.2 % en un día típico y 13.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.998 frente al mismo motor sin noticias (p 0.80); el ancho del rango cambia 6.6 % en un día típico y 16.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.011 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 9.7 % en un día típico y 25.9 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.009 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 8.4 % en un día típico y 21.9 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.72); el ancho del rango cambia 10.3 % en un día típico y 26.8 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.41); el ancho del rango cambia 11.8 % en un día típico y 31.4 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.26); el ancho del rango cambia 5.5 % en un día típico y 13.1 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.34); el ancho del rango cambia 5.3 % en un día típico y 13.9 % en los días de más noticias.

## ORO · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.7328 | 65.9 | 4.87 | — | 1.001 (0.94) | 1.1065 | 57.3 | — |
| motor_actual | 0.7320 | 73.6 | 5.47 | 0.999 (0.94) | — | 1.1261 | 78.0 | — |
| fhs97_k | 0.7300 | 79.7 | 6.21 | 0.996 (0.78) | 0.997 (0.68) | 1.1193 | 82.1 | empata |
| analogos | 0.7294 | 74.7 | 5.46 | 0.995 (0.77) | 0.996 (0.40) | 1.1269 | 77.1 | empata |
| aprende_vol | 0.7172 | 75.9 | 5.66 | 0.979 (0.10) | 0.980 (0.01) | 1.1018 | 72.5 | empata |
| aprende_vol_cal | 0.7182 | 75.9 | 5.70 | 0.980 (0.11) | 0.981 (0.01) | 1.1019 | 71.6 | empata |
| aprende_vol_noticias | 0.7234 | 73.2 | 5.66 | 0.987 (0.20) | 0.988 (0.20) | 1.1026 | 72.9 | empata |
| aprende_vol_corpus | 0.7205 | 76.2 | 5.77 | 0.983 (0.22) | 0.984 (0.04) | 1.1052 | 73.9 | empata |
| aprende_vol_cruz | 0.7159 | 75.5 | 5.57 | 0.977 (0.05) | 0.978 (0.00) | 1.0940 | 72.9 | empata |
| aprende_rango_cal | 0.7518 | 68.6 | 5.34 | 1.026 (0.27) | 1.027 (0.25) | 1.0628 | 71.1 | empata |
| aprende_rango_noticias | 0.7305 | 66.3 | 5.08 | 0.997 (0.81) | 0.998 (0.91) | 1.1203 | 66.5 | empata |
| mezcla | 0.7232 | 75.9 | 5.51 | 0.987 (0.35) | 0.988 (0.00) | 1.1079 | 76.6 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.007 frente al mismo motor sin noticias (p 0.23); el ancho del rango cambia 7.2 % en un día típico y 17.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.88); el ancho del rango cambia 7.9 % en un día típico y 18.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.972 frente al mismo motor sin noticias (p 0.17); el ancho del rango cambia 9.8 % en un día típico y 18.5 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.054 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 11.4 % en un día típico y 30.3 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.39); el ancho del rango cambia 5.5 % en un día típico y 13.7 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.47); el ancho del rango cambia 7.0 % en un día típico y 17.0 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.33); el ancho del rango cambia 4.2 % en un día típico y 11.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.993 frente al mismo motor sin noticias (p 0.06); el ancho del rango cambia 6.3 % en un día típico y 14.2 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.996 frente al mismo motor sin noticias (p 0.40); el ancho del rango cambia 6.0 % en un día típico y 16.2 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.86); el ancho del rango cambia 6.5 % en un día típico y 15.9 % en los días de más noticias.

## ORO · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.5023 | 69.0 | 10.58 | — | 0.924 (0.01) | 2.4187 | 41.6 | — |
| motor_actual | 1.6252 | 68.2 | 11.28 | 1.082 (0.01) | — | 2.5868 | 65.8 | — |
| fhs97_k | 1.5624 | 75.1 | 12.99 | 1.040 (0.20) | 0.961 (0.01) | 2.6038 | 68.8 | empata |
| analogos | 1.6206 | 69.0 | 12.31 | 1.079 (0.01) | 0.997 (0.66) | 2.6033 | 67.3 | empata |
| aprende_vol | 1.4506 | 80.1 | 12.68 | 0.966 (0.47) | 0.893 (0.01) | 2.4930 | 55.4 | empata |
| aprende_vol_cal | 1.4646 | 80.1 | 12.45 | 0.975 (0.63) | 0.901 (0.03) | 2.4627 | 55.0 | empata |
| aprende_vol_noticias | 1.5026 | 72.4 | 11.81 | 1.000 (0.99) | 0.925 (0.00) | 2.4504 | 57.9 | empata |
| aprende_vol_corpus | 1.4764 | 78.9 | 13.23 | 0.983 (0.63) | 0.908 (0.00) | 2.5113 | 64.9 | empata |
| aprende_vol_cruz | 1.5000 | 74.3 | 12.57 | 0.998 (0.96) | 0.923 (0.00) | 2.4292 | 61.4 | empata |
| aprende_rango_cal | 1.8662 | 52.5 | 9.88 | 1.242 (0.00) | 1.148 (0.09) | 2.2226 | 62.4 | pierde |
| aprende_rango_noticias | 1.6636 | 51.3 | 8.19 | 1.107 (0.02) | 1.024 (0.68) | 2.6449 | 39.6 | pierde |
| mezcla | 1.5316 | 72.8 | 12.17 | 1.020 (0.61) | 0.942 (0.03) | 2.5126 | 60.4 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.026 frente al mismo motor sin noticias (p 0.51); el ancho del rango cambia 12.7 % en un día típico y 26.5 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.70); el ancho del rango cambia 16.4 % en un día típico y 37.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.891 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 17.7 % en un día típico y 30.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.190 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 16.9 % en un día típico y 38.5 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.008 frente al mismo motor sin noticias (p 0.74); el ancho del rango cambia 9.5 % en un día típico y 21.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.020 frente al mismo motor sin noticias (p 0.15); el ancho del rango cambia 21.9 % en un día típico y 56.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.024 frente al mismo motor sin noticias (p 0.49); el ancho del rango cambia 9.9 % en un día típico y 28.1 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.986 frente al mismo motor sin noticias (p 0.09); el ancho del rango cambia 13.9 % en un día típico y 30.0 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 8.9 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.37); el ancho del rango cambia 9.0 % en un día típico y 16.8 % en los días de más noticias.

## PLATA · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.5271 | 76.2 | 3.89 | — | 1.019 (0.08) | 1.0940 | 58.6 | — |
| motor_actual | 0.5172 | 77.4 | 3.47 | 0.981 (0.08) | — | 1.0270 | 80.6 | — |
| fhs97_k | 0.5179 | 77.4 | 3.70 | 0.983 (0.03) | 1.001 (0.70) | 1.0353 | 83.8 | empata |
| analogos | 0.5234 | 75.1 | 3.59 | 0.993 (0.54) | 1.012 (0.02) | 1.0418 | 79.7 | empata |
| aprende_vol | 0.5176 | 81.6 | 4.34 | 0.982 (0.13) | 1.001 (0.92) | 1.0455 | 80.6 | empata |
| aprende_vol_cal | 0.5181 | 82.4 | 4.33 | 0.983 (0.13) | 1.002 (0.81) | 1.0418 | 77.9 | empata |
| aprende_vol_noticias | 0.5181 | 83.9 | 4.29 | 0.983 (0.13) | 1.002 (0.79) | 1.0464 | 80.6 | empata |
| aprende_vol_corpus | 0.5292 | 82.8 | 4.64 | 1.004 (0.78) | 1.023 (0.06) | 1.0576 | 78.8 | empata |
| aprende_vol_cruz | 0.5177 | 82.4 | 4.18 | 0.982 (0.10) | 1.001 (0.89) | 1.0322 | 82.0 | empata |
| aprende_rango_cal | 0.5255 | 74.3 | 3.78 | 0.997 (0.78) | 1.016 (0.03) | 1.0309 | 74.3 | empata |
| aprende_rango_noticias | 0.5221 | 76.2 | 3.76 | 0.990 (0.30) | 1.009 (0.19) | 1.0309 | 77.0 | empata |
| mezcla | 0.5150 | 80.8 | 3.96 | 0.977 (0.02) | 0.996 (0.29) | 1.0252 | 81.1 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.000 frente al mismo motor sin noticias (p 1.00); el ancho del rango cambia 8.3 % en un día típico y 23.4 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.32); el ancho del rango cambia 10.8 % en un día típico y 30.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.993 frente al mismo motor sin noticias (p 0.11); el ancho del rango cambia 6.1 % en un día típico y 15.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.000 frente al mismo motor sin noticias (p 0.99); el ancho del rango cambia 6.4 % en un día típico y 20.1 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.021 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 20.5 % en un día típico y 58.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.015 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 14.7 % en un día típico y 48.7 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.999 frente al mismo motor sin noticias (p 0.85); el ancho del rango cambia 10.6 % en un día típico y 27.0 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.991 frente al mismo motor sin noticias (p 0.04); el ancho del rango cambia 10.5 % en un día típico y 24.9 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.012 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 12.7 % en un día típico y 29.9 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.014 frente al mismo motor sin noticias (p 0.03); el ancho del rango cambia 12.3 % en un día típico y 29.3 % en los días de más noticias.

## PLATA · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.2224 | 78.2 | 10.38 | — | 1.024 (0.15) | 2.5203 | 57.8 | — |
| motor_actual | 1.1939 | 79.7 | 8.72 | 0.977 (0.15) | — | 2.4371 | 79.8 | — |
| fhs97_k | 1.1985 | 80.5 | 9.56 | 0.980 (0.15) | 1.004 (0.40) | 2.4747 | 83.9 | empata |
| analogos | 1.2015 | 76.2 | 8.75 | 0.983 (0.30) | 1.006 (0.10) | 2.4294 | 79.4 | empata |
| aprende_vol | 1.1863 | 81.2 | 10.69 | 0.970 (0.01) | 0.994 (0.58) | 2.4360 | 68.8 | empata |
| aprende_vol_cal | 1.1962 | 81.2 | 10.70 | 0.979 (0.05) | 1.002 (0.86) | 2.4463 | 68.3 | empata |
| aprende_vol_noticias | 1.1976 | 80.8 | 10.55 | 0.980 (0.05) | 1.003 (0.80) | 2.4215 | 70.2 | empata |
| aprende_vol_corpus | 1.1976 | 80.5 | 10.51 | 0.980 (0.13) | 1.003 (0.80) | 2.4535 | 73.9 | empata |
| aprende_vol_cruz | 1.1849 | 81.2 | 9.89 | 0.969 (0.01) | 0.992 (0.56) | 2.4222 | 71.6 | empata |
| aprende_rango_cal | 1.3224 | 71.6 | 9.31 | 1.082 (0.00) | 1.108 (0.00) | 2.4117 | 68.3 | pierde |
| aprende_rango_noticias | 1.2703 | 72.0 | 9.29 | 1.039 (0.01) | 1.064 (0.00) | 2.4862 | 70.2 | pierde |
| mezcla | 1.1920 | 80.8 | 9.79 | 0.975 (0.05) | 0.998 (0.78) | 2.4066 | 76.6 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.78); el ancho del rango cambia 5.6 % en un día típico y 14.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.990 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 7.6 % en un día típico y 18.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.961 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 7.0 % en un día típico y 15.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.031 frente al mismo motor sin noticias (p 0.09); el ancho del rango cambia 10.8 % en un día típico y 35.1 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.86); el ancho del rango cambia 11.6 % en un día típico y 24.9 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.70); el ancho del rango cambia 13.2 % en un día típico y 32.8 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.991 frente al mismo motor sin noticias (p 0.20); el ancho del rango cambia 11.6 % en un día típico y 27.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.990 frente al mismo motor sin noticias (p 0.28); el ancho del rango cambia 9.4 % en un día típico y 23.2 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.10); el ancho del rango cambia 6.6 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.35); el ancho del rango cambia 6.1 % en un día típico y 15.9 % en los días de más noticias.

## PLATA · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 3.4069 | 68.6 | 18.57 | — | 1.062 (0.31) | 4.4449 | 52.0 | — |
| motor_actual | 3.2092 | 65.1 | 16.82 | 0.942 (0.31) | — | 4.9522 | 70.3 | — |
| fhs97_k | 3.2529 | 66.7 | 17.71 | 0.955 (0.30) | 1.014 (0.36) | 5.0471 | 71.8 | empata |
| analogos | 3.2000 | 63.6 | 16.58 | 0.939 (0.31) | 0.997 (0.52) | 4.9898 | 68.8 | empata |
| aprende_vol | 3.3424 | 67.0 | 19.02 | 0.981 (0.54) | 1.042 (0.16) | 4.5106 | 60.4 | empata |
| aprende_vol_cal | 3.3545 | 66.3 | 19.03 | 0.985 (0.58) | 1.045 (0.17) | 4.5144 | 60.9 | empata |
| aprende_vol_noticias | 3.4050 | 67.0 | 18.91 | 0.999 (0.97) | 1.061 (0.16) | 4.4618 | 61.9 | empata |
| aprende_vol_corpus | 3.3457 | 67.4 | 18.76 | 0.982 (0.54) | 1.043 (0.18) | 4.5733 | 63.9 | empata |
| aprende_vol_cruz | 3.3426 | 65.9 | 18.92 | 0.981 (0.57) | 1.042 (0.15) | 4.5047 | 62.4 | empata |
| aprende_rango_cal | 3.8692 | 59.4 | 18.11 | 1.136 (0.00) | 1.206 (0.01) | 4.6495 | 54.0 | pierde |
| aprende_rango_noticias | 3.5767 | 62.1 | 15.93 | 1.050 (0.16) | 1.115 (0.10) | 5.3597 | 51.5 | empata |
| mezcla | 3.2754 | 67.4 | 18.24 | 0.961 (0.36) | 1.021 (0.21) | 4.6864 | 65.8 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.015 frente al mismo motor sin noticias (p 0.23); el ancho del rango cambia 5.1 % en un día típico y 13.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.988 frente al mismo motor sin noticias (p 0.05); el ancho del rango cambia 7.9 % en un día típico y 16.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.924 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 17.6 % en un día típico y 32.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.153 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 18.2 % en un día típico y 54.8 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.42); el ancho del rango cambia 2.6 % en un día típico y 8.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.013 frente al mismo motor sin noticias (p 0.06); el ancho del rango cambia 7.9 % en un día típico y 20.3 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.996 frente al mismo motor sin noticias (p 0.65); el ancho del rango cambia 5.0 % en un día típico y 10.2 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.998 frente al mismo motor sin noticias (p 0.67); el ancho del rango cambia 9.8 % en un día típico y 21.2 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.52); el ancho del rango cambia 4.7 % en un día típico y 13.0 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.008 frente al mismo motor sin noticias (p 0.12); el ancho del rango cambia 8.7 % en un día típico y 16.9 % en los días de más noticias.

## ZINC · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.4058 | 87.0 | 4.24 | — | 1.009 (0.31) | 0.4014 | 81.5 | — |
| motor_actual | 0.4021 | 76.6 | 3.30 | 0.991 (0.31) | — | 0.4022 | 77.0 | — |
| fhs97_k | 0.4014 | 78.5 | 3.42 | 0.989 (0.14) | 0.998 (0.58) | 0.4014 | 80.2 | empata |
| analogos | 0.4008 | 75.5 | 3.31 | 0.988 (0.19) | 0.997 (0.19) | 0.4043 | 78.4 | empata |
| aprende_vol | 0.4035 | 81.6 | 3.93 | 0.994 (0.49) | 1.004 (0.54) | 0.4025 | 81.5 | empata |
| aprende_vol_cal | 0.4040 | 82.0 | 3.97 | 0.996 (0.58) | 1.005 (0.44) | 0.4017 | 81.1 | empata |
| aprende_vol_noticias | 0.4014 | 82.0 | 4.23 | 0.989 (0.18) | 0.998 (0.81) | 0.4042 | 79.3 | empata |
| aprende_vol_corpus | 0.4076 | 82.0 | 4.12 | 1.005 (0.64) | 1.014 (0.17) | 0.4084 | 80.6 | empata |
| aprende_vol_cruz | 0.4031 | 81.2 | 3.94 | 0.993 (0.38) | 1.002 (0.76) | 0.4111 | 78.4 | empata |
| aprende_rango_cal | 0.4022 | 77.4 | 3.34 | 0.991 (0.30) | 1.000 (0.98) | 0.4008 | 77.5 | empata |
| aprende_rango_noticias | 0.4003 | 78.5 | 3.42 | 0.986 (0.13) | 0.995 (0.49) | 0.4035 | 76.6 | empata |
| mezcla | 0.4017 | 79.3 | 3.63 | 0.990 (0.19) | 0.999 (0.73) | 0.4005 | 82.0 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.993 frente al mismo motor sin noticias (p 0.15); el ancho del rango cambia 10.4 % en un día típico y 22.3 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.006 frente al mismo motor sin noticias (p 0.11); el ancho del rango cambia 7.8 % en un día típico y 21.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.995 frente al mismo motor sin noticias (p 0.29); el ancho del rango cambia 3.7 % en un día típico y 9.7 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.007 frente al mismo motor sin noticias (p 0.26); el ancho del rango cambia 3.9 % en un día típico y 11.0 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.009 frente al mismo motor sin noticias (p 0.23); el ancho del rango cambia 14.9 % en un día típico y 41.0 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.017 frente al mismo motor sin noticias (p 0.02); el ancho del rango cambia 13.8 % en un día típico y 37.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.998 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 10.0 % en un día típico y 28.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.023 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 9.9 % en un día típico y 29.4 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.19); el ancho del rango cambia 5.3 % en un día típico y 12.2 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.08); el ancho del rango cambia 5.8 % en un día típico y 13.1 % en los días de más noticias.

## ZINC · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.8282 | 89.7 | 9.55 | — | 1.009 (0.57) | 0.8401 | 82.1 | — |
| motor_actual | 0.8210 | 80.5 | 7.53 | 0.991 (0.57) | — | 0.8448 | 78.9 | — |
| fhs97_k | 0.8130 | 81.2 | 7.77 | 0.982 (0.15) | 0.990 (0.02) | 0.8401 | 82.1 | empata |
| analogos | 0.8223 | 80.5 | 7.51 | 0.993 (0.66) | 1.002 (0.74) | 0.8424 | 79.8 | empata |
| aprende_vol | 0.8174 | 83.9 | 8.36 | 0.987 (0.18) | 0.996 (0.56) | 0.8370 | 80.3 | empata |
| aprende_vol_cal | 0.8164 | 84.3 | 8.43 | 0.986 (0.13) | 0.994 (0.48) | 0.8366 | 79.8 | empata |
| aprende_vol_noticias | 0.8181 | 87.7 | 8.66 | 0.988 (0.14) | 0.996 (0.72) | 0.8408 | 77.1 | empata |
| aprende_vol_corpus | 0.8179 | 83.9 | 8.54 | 0.988 (0.16) | 0.996 (0.69) | 0.8349 | 78.4 | empata |
| aprende_vol_cruz | 0.8138 | 84.7 | 8.58 | 0.983 (0.03) | 0.991 (0.36) | 0.8395 | 81.2 | empata |
| aprende_rango_cal | 0.8177 | 80.8 | 7.88 | 0.987 (0.54) | 0.996 (0.81) | 0.8253 | 79.8 | empata |
| aprende_rango_noticias | 0.8420 | 80.5 | 7.46 | 1.017 (0.59) | 1.026 (0.34) | 0.8498 | 73.4 | empata |
| mezcla | 0.8176 | 83.1 | 8.06 | 0.987 (0.29) | 0.996 (0.30) | 0.8402 | 79.8 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.59); el ancho del rango cambia 5.0 % en un día típico y 11.2 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.005 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 5.2 % en un día típico y 11.3 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.030 frente al mismo motor sin noticias (p 0.10); el ancho del rango cambia 8.4 % en un día típico y 22.1 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.030 frente al mismo motor sin noticias (p 0.18); el ancho del rango cambia 10.9 % en un día típico y 27.6 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.62); el ancho del rango cambia 6.6 % en un día típico y 16.8 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.998 frente al mismo motor sin noticias (p 0.64); el ancho del rango cambia 7.8 % en un día típico y 16.1 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.37); el ancho del rango cambia 5.1 % en un día típico y 13.7 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.19); el ancho del rango cambia 4.3 % en un día típico y 8.8 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.002 frente al mismo motor sin noticias (p 0.74); el ancho del rango cambia 6.1 % en un día típico y 15.4 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.56); el ancho del rango cambia 7.0 % en un día típico y 16.3 % en los días de más noticias.

## ZINC · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.5475 | 91.6 | 18.88 | — | 0.997 (0.94) | 1.4667 | 82.7 | — |
| motor_actual | 1.5516 | 79.3 | 14.83 | 1.003 (0.94) | — | 1.4884 | 82.2 | — |
| fhs97_k | 1.5467 | 83.1 | 16.04 | 0.999 (0.99) | 0.997 (0.76) | 1.4821 | 83.7 | empata |
| analogos | 1.5449 | 78.9 | 14.09 | 0.998 (0.97) | 0.996 (0.43) | 1.4879 | 80.2 | empata |
| aprende_vol | 1.5417 | 84.3 | 17.26 | 0.996 (0.86) | 0.994 (0.72) | 1.4754 | 84.2 | empata |
| aprende_vol_cal | 1.5323 | 85.1 | 16.99 | 0.990 (0.62) | 0.988 (0.59) | 1.4732 | 83.2 | empata |
| aprende_vol_noticias | 1.5229 | 92.7 | 17.87 | 0.984 (0.22) | 0.981 (0.56) | 1.4872 | 78.2 | empata |
| aprende_vol_corpus | 1.5431 | 86.2 | 17.37 | 0.997 (0.85) | 0.995 (0.86) | 1.4786 | 81.2 | empata |
| aprende_vol_cruz | 1.5178 | 90.4 | 16.97 | 0.981 (0.12) | 0.978 (0.49) | 1.4745 | 79.2 | empata |
| aprende_rango_cal | 1.4990 | 88.5 | 15.66 | 0.969 (0.59) | 0.966 (0.48) | 1.4222 | 84.2 | empata |
| aprende_rango_noticias | 1.5336 | 83.9 | 14.82 | 0.991 (0.90) | 0.988 (0.86) | 1.4835 | 87.1 | empata |
| mezcla | 1.5376 | 82.4 | 16.17 | 0.994 (0.82) | 0.991 (0.46) | 1.4787 | 82.7 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.994 frente al mismo motor sin noticias (p 0.64); el ancho del rango cambia 7.1 % en un día típico y 23.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.009 frente al mismo motor sin noticias (p 0.57); el ancho del rango cambia 8.3 % en un día típico y 17.9 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.023 frente al mismo motor sin noticias (p 0.43); el ancho del rango cambia 11.6 % en un día típico y 24.2 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 1.043 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 17.4 % en un día típico y 38.8 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.007 frente al mismo motor sin noticias (p 0.45); el ancho del rango cambia 5.6 % en un día típico y 15.1 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.004 frente al mismo motor sin noticias (p 0.67); el ancho del rango cambia 7.7 % en un día típico y 16.5 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.991 frente al mismo motor sin noticias (p 0.59); el ancho del rango cambia 12.7 % en un día típico y 36.2 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.001 frente al mismo motor sin noticias (p 0.94); el ancho del rango cambia 8.6 % en un día típico y 18.6 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 0.996 frente al mismo motor sin noticias (p 0.43); el ancho del rango cambia 7.0 % en un día típico y 16.3 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.000 frente al mismo motor sin noticias (p 0.93); el ancho del rango cambia 6.7 % en un día típico y 16.3 % en los días de más noticias.

## WTI · 1 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 0.5052 | 85.4 | 5.04 | — | 1.008 (0.31) | 1.0665 | 56.8 | — |
| motor_actual | 0.5011 | 81.2 | 4.14 | 0.992 (0.31) | — | 1.0145 | 75.2 | — |
| fhs97_k | 0.5010 | 82.4 | 4.33 | 0.992 (0.14) | 1.000 (0.93) | 1.0135 | 75.2 | empata |
| analogos | 0.5014 | 81.6 | 4.13 | 0.993 (0.37) | 1.001 (0.81) | 1.0149 | 73.0 | empata |
| aprende_vol | 0.5077 | 81.6 | 4.55 | 1.005 (0.51) | 1.013 (0.02) | 1.0339 | 76.6 | empata |
| aprende_vol_cal | 0.5047 | 82.8 | 4.47 | 0.999 (0.90) | 1.007 (0.20) | 1.0336 | 74.3 | empata |
| aprende_vol_noticias | 0.5040 | 82.4 | 4.47 | 0.998 (0.76) | 1.006 (0.30) | 1.0289 | 74.3 | empata |
| aprende_vol_corpus | 0.5148 | 84.3 | 4.80 | 1.019 (0.03) | 1.027 (0.00) | 1.0363 | 71.2 | pierde |
| aprende_vol_cruz | 0.5053 | 82.8 | 4.29 | 1.000 (0.98) | 1.008 (0.20) | 1.0292 | 74.3 | empata |
| aprende_rango_cal | 0.5005 | 82.8 | 4.36 | 0.991 (0.27) | 0.999 (0.86) | 1.0451 | 73.0 | empata |
| aprende_rango_noticias | 0.5028 | 81.6 | 4.25 | 0.995 (0.60) | 1.003 (0.63) | 1.0427 | 72.1 | empata |
| mezcla | 0.5012 | 81.6 | 4.26 | 0.992 (0.29) | 1.000 (0.94) | 1.0202 | 74.8 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 0.999 frente al mismo motor sin noticias (p 0.75); el ancho del rango cambia 7.2 % en un día típico y 18.5 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 0.995 frente al mismo motor sin noticias (p 0.14); el ancho del rango cambia 5.9 % en un día típico y 15.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.005 frente al mismo motor sin noticias (p 0.22); el ancho del rango cambia 4.1 % en un día típico y 10.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.998 frente al mismo motor sin noticias (p 0.58); el ancho del rango cambia 4.4 % en un día típico y 11.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.020 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 14.9 % en un día típico y 38.3 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.73); el ancho del rango cambia 15.9 % en un día típico y 33.9 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.85); el ancho del rango cambia 10.7 % en un día típico y 28.2 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.996 frente al mismo motor sin noticias (p 0.48); el ancho del rango cambia 13.6 % en un día típico y 28.5 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.81); el ancho del rango cambia 5.6 % en un día típico y 13.0 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.000 frente al mismo motor sin noticias (p 0.92); el ancho del rango cambia 5.9 % en un día típico y 14.9 % en los días de más noticias.

## WTI · 5 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.2109 | 85.1 | 11.67 | — | 0.999 (0.96) | 2.5276 | 47.7 | — |
| motor_actual | 1.2116 | 80.1 | 9.46 | 1.001 (0.96) | — | 2.3170 | 76.1 | — |
| fhs97_k | 1.2070 | 81.2 | 10.05 | 0.997 (0.72) | 0.996 (0.33) | 2.3050 | 77.1 | empata |
| analogos | 1.2261 | 79.3 | 9.56 | 1.013 (0.33) | 1.012 (0.00) | 2.3208 | 73.4 | pierde |
| aprende_vol | 1.2166 | 80.5 | 9.92 | 1.005 (0.62) | 1.004 (0.55) | 2.3631 | 68.3 | empata |
| aprende_vol_cal | 1.2170 | 80.8 | 9.90 | 1.005 (0.59) | 1.004 (0.49) | 2.3691 | 67.4 | empata |
| aprende_vol_noticias | 1.2210 | 80.5 | 9.58 | 1.008 (0.46) | 1.008 (0.30) | 2.3760 | 68.3 | empata |
| aprende_vol_corpus | 1.2183 | 80.5 | 9.98 | 1.006 (0.54) | 1.005 (0.44) | 2.3625 | 67.4 | empata |
| aprende_vol_cruz | 1.2162 | 80.5 | 9.37 | 1.004 (0.69) | 1.004 (0.59) | 2.3690 | 67.0 | empata |
| aprende_rango_cal | 1.1844 | 81.2 | 9.94 | 0.978 (0.11) | 0.978 (0.15) | 2.4701 | 62.8 | empata |
| aprende_rango_noticias | 1.1886 | 77.4 | 9.11 | 0.982 (0.21) | 0.981 (0.21) | 2.4674 | 59.2 | empata |
| mezcla | 1.2131 | 80.5 | 9.54 | 1.002 (0.86) | 1.001 (0.71) | 2.3352 | 73.9 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.27); el ancho del rango cambia 3.4 % en un día típico y 7.9 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.003 frente al mismo motor sin noticias (p 0.43); el ancho del rango cambia 5.3 % en un día típico y 13.9 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 1.003 frente al mismo motor sin noticias (p 0.66); el ancho del rango cambia 8.6 % en un día típico y 14.4 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.999 frente al mismo motor sin noticias (p 0.92); el ancho del rango cambia 7.9 % en un día típico y 21.4 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 1.001 frente al mismo motor sin noticias (p 0.71); el ancho del rango cambia 6.0 % en un día típico y 12.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.49); el ancho del rango cambia 7.4 % en un día típico y 16.2 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 0.999 frente al mismo motor sin noticias (p 0.83); el ancho del rango cambia 5.5 % en un día típico y 11.3 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 1.000 frente al mismo motor sin noticias (p 0.99); el ancho del rango cambia 7.8 % en un día típico y 19.5 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.012 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 6.2 % en un día típico y 15.8 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.46); el ancho del rango cambia 5.6 % en un día típico y 12.5 % en los días de más noticias.

## WTI · 21 días hábiles

| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |
|---|---|---|---|---|---|---|---|---|
| caminata | 1.7594 | 90.4 | 19.17 | — | 0.976 (0.36) | 5.5292 | 47.0 | — |
| motor_actual | 1.8028 | 83.9 | 16.42 | 1.025 (0.36) | — | 5.3550 | 66.8 | — |
| fhs97_k | 1.7881 | 86.2 | 17.27 | 1.016 (0.38) | 0.992 (0.39) | 5.3222 | 67.3 | empata |
| analogos | 1.8197 | 82.0 | 16.58 | 1.034 (0.21) | 1.009 (0.01) | 5.4052 | 65.8 | empata |
| aprende_vol | 1.7747 | 86.6 | 17.49 | 1.009 (0.48) | 0.984 (0.39) | 5.4319 | 58.9 | empata |
| aprende_vol_cal | 1.7854 | 85.8 | 17.40 | 1.015 (0.37) | 0.990 (0.56) | 5.4412 | 57.9 | empata |
| aprende_vol_noticias | 1.7955 | 84.7 | 17.20 | 1.021 (0.37) | 0.996 (0.84) | 5.4540 | 55.0 | empata |
| aprende_vol_corpus | 1.7795 | 87.0 | 17.62 | 1.011 (0.46) | 0.987 (0.39) | 5.4275 | 58.9 | empata |
| aprende_vol_cruz | 1.8129 | 83.9 | 17.38 | 1.030 (0.18) | 1.006 (0.69) | 5.3515 | 57.4 | empata |
| aprende_rango_cal | 1.8962 | 92.7 | 23.16 | 1.078 (0.19) | 1.052 (0.39) | 6.2001 | 52.5 | empata |
| aprende_rango_noticias | 1.7061 | 86.2 | 18.66 | 0.970 (0.52) | 0.946 (0.25) | 5.7018 | 48.0 | empata |
| mezcla | 1.7885 | 86.2 | 16.80 | 1.017 (0.42) | 0.992 (0.37) | 5.3657 | 64.9 | empata |

- Días con noticias del corpus: práctica 477, examen 2025 252, confirmación 2026 223.
- Noticias en `aprende_vol_noticias` (examen_2025): razón 1.006 frente al mismo motor sin noticias (p 0.52); el ancho del rango cambia 9.3 % en un día típico y 18.1 % en los días de más noticias.
- Noticias en `aprende_vol_noticias` (confirmacion_2026): razón 1.002 frente al mismo motor sin noticias (p 0.81); el ancho del rango cambia 11.4 % en un día típico y 28.6 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (examen_2025): razón 0.900 frente al mismo motor sin noticias (p 0.00); el ancho del rango cambia 22.2 % en un día típico y 33.8 % en los días de más noticias.
- Noticias en `aprende_rango_noticias` (confirmacion_2026): razón 0.920 frente al mismo motor sin noticias (p 0.04); el ancho del rango cambia 20.3 % en un día típico y 51.2 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (examen_2025): razón 0.997 frente al mismo motor sin noticias (p 0.51); el ancho del rango cambia 5.0 % en un día típico y 13.0 % en los días de más noticias.
- Noticias en `aprende_vol_corpus` (confirmacion_2026): razón 0.997 frente al mismo motor sin noticias (p 0.32); el ancho del rango cambia 4.7 % en un día típico y 13.3 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (examen_2025): razón 1.015 frente al mismo motor sin noticias (p 0.06); el ancho del rango cambia 6.1 % en un día típico y 15.6 % en los días de más noticias.
- Noticias en `aprende_vol_cruz` (confirmacion_2026): razón 0.984 frente al mismo motor sin noticias (p 0.21); el ancho del rango cambia 8.2 % en un día típico y 28.4 % en los días de más noticias.
- Noticias en `analogos` (examen_2025): razón 1.009 frente al mismo motor sin noticias (p 0.01); el ancho del rango cambia 6.2 % en un día típico y 15.0 % en los días de más noticias.
- Noticias en `analogos` (confirmacion_2026): razón 1.009 frente al mismo motor sin noticias (p 0.13); el ancho del rango cambia 7.9 % en un día típico y 16.3 % en los días de más noticias.

