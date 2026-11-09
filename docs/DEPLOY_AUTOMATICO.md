# Despliegue automático del Worker

## Para qué sirve

Los workflows diarios regeneran `/dolar`, las fichas de empresa y las notas semanales y las suben a `main`, pero producción solo se actualizaba cuando el despliegue se ejecutaba a mano. El workflow «Despliegue del Worker» publica el Worker `perdata-cf` en Cloudflare tras cada corrida exitosa de «Datos oficiales (BCRP, EIA, Banco Mundial, SUNAT, Reserva Federal)», «Cotizaciones de Lima (SMV)» o «Boletín diario», y como respaldo de lunes a sábado a las 23:30 UTC.

## Crear el token en Cloudflare

1. En Cloudflare, ve a **Mi perfil → Tokens de API → Crear token**.
2. Elige la plantilla **«Editar Cloudflare Workers»**.
3. En **Permisos**, deja las entradas de la plantilla y, en **Recursos de cuenta**, limita el token a la cuenta de PerData y, en **Recursos de zona y otros**, al Worker `perdata-cf`.
4. Crea el token y cópialo en el momento (solo se muestra una vez).

## Guardarlo en GitHub

1. En el repositorio, ve a **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `CLOUDFLARE_API_TOKEN`. Valor: el token creado en Cloudflare.
3. Guarda el secreto. A partir de ahí, el workflow «Despliegue del Worker» desplegará el Worker tras cada workflow diario exitoso y ejecutará el smoke test contra `https://perdata.site` (el run falla si el smoke falla).

## Cómo probarlo

En el repositorio, ve a **Actions → Despliegue del Worker → Run workflow** y ejecútalo. Si el secreto existe, el run despliega y pasa el smoke; si no existe, se omite sin errores.

## Mientras el secreto no exista

Mientras no se guarde el secreto `CLOUDFLARE_API_TOKEN`, el workflow «Despliegue del Worker» se omite sin errores: escribe «Falta el secreto CLOUDFLARE_API_TOKEN: despliegue omitido» en el resumen del run y termina con éxito. Los cambios de producción siguen haciéndose con el despliegue manual.
