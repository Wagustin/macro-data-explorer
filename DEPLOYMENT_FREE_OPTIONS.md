# Matriz de Opciones de Despliegue Gratuito — PerData Terminal

A continuación se detalla la comparativa técnica y operativa de proveedores con nivel gratuito (Free Tier permanente) para desplegar PerData Terminal (Node.js API + Static Frontend + Edge Functions).

---

## 1. Vercel (Producción Actual — Recomendado para Frontend + Serverless)
- **Costo:** $0 / mes (Hobby Tier).
- **Límites:** 100 GB ancho de banda/mes, 100,000 ejecuciones serverless/día.
- **Ventajas:** Despliegue nativo con `vercel --prod` usando el token persistente en `~/.hermes/.vercel_token`. Soporta tanto los archivos estáticos HTML/JS como las funciones serverless en `/api/*.js` con cero configuración adicional vía `vercel.json`.
- **Compatibilidad con PerData:** 100% nativa.

---

## 2. Cloudflare Pages + Workers (Alta Disponibilidad Global)
- **Costo:** $0 / mes.
- **Límites:** 100,000 peticiones/día en Workers, sitios estáticos ilimitados y ancho de banda gratuito sin límite en Pages.
- **Ventajas:** CDN global ultra-rápido, latencia mínima en Latinoamérica/España.
- **Configuración:**
  - Frontend: Desplegado directamente vía Cloudflare Pages conectado al repositorio GitHub (`Wagustin/macro-data-explorer`).
  - API: Portada a Cloudflare Workers o enrutada a las Edge Functions existentes en Supabase.
- **Compatibilidad con PerData:** Excelente para el frontend y caché perimetral.

---

## 3. Render (Web Service Gratuito)
- **Costo:** $0 / mes.
- **Límites:** 750 horas de cómputo gratuitas al mes, 512 MB RAM.
- **Ventajas:** Soporta correr directamente `node server.js` como un servidor HTTP nativo sin adaptar a serverless.
- **Desventaja / Consideración:** Entra en suspensión tras 15 minutos de inactividad (spin-down de ~30s al despertar). Se mitiga fácilmente con un ping programado.
- **Compatibilidad con PerData:** Requiere solo configurar comando de inicio `npm start`.

---

## 4. Netlify
- **Costo:** $0 / mes.
- **Límites:** 100 GB ancho de banda/mes, 300 minutos de compilación.
- **Ventajas:** Soporte directo para funciones serverless en Node.js y reescrituras similares a `vercel.json` vía `netlify.toml`.
- **Compatibilidad con PerData:** Requiere mapear `/api/*` a Netlify Functions.

---

## 5. Supabase Edge Functions (Deno Runtime — Ya Integrado)
- **Costo:** $0 / mes.
- **Límites:** 500,000 invocaciones/mes gratuitas.
- **Ventajas:** La función unificada ya existe en `supabase/functions/macro-explorer/index.ts` y sirve tanto la API como la interfaz gráfica completa en una sola URL perimetral.
- **Mitigación requerida:** Cronjob cada 24 horas para evitar pausa del proyecto tras 7 días de inactividad.

---

## Resumen Ejecutivo y Recomendación
1. **Primario (Oficial):** Mantener **Vercel** (`macro-data-explorer.vercel.app`), ya que la cuenta y token persistente de Agustín están totalmente funcionales y sin costo.
2. **Respaldo Inmediato (Espejo):** **Supabase Edge Function** (`https://<project-ref>.supabase.co/functions/v1/macro-explorer`) sirve todo el sistema de forma redundante y gratuita.
