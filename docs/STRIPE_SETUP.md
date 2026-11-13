# Pagos con Stripe: configuración

Planes de pago: **Pro** y **Boletín**. Los cobros van por Stripe Checkout y el portal de clientes de Stripe. La prueba de 7 días va solo con el plan Boletín (ver `docs/PRUEBA_7_DIAS.md`).

## Planes y precios

| Plan | Mensual | Anual | Ids de precio |
|------|---------|-------|---------------|
| Boletín | US$ 1.99 | US$ 15 | `STRIPE_PRICE_ID_BOLETIN_MONTHLY`, `STRIPE_PRICE_ID_BOLETIN_YEARLY` |
| Pro | por confirmar en el panel de Stripe | por confirmar en el panel de Stripe | `STRIPE_PRICE_ID_MONTHLY` (o `STRIPE_PRICE_ID`), `STRIPE_PRICE_ID_YEARLY` |

- Los ids de precio van en `wrangler.jsonc`, en `vars`. Los ids del Boletín también tienen valor por defecto en `api/_lib/stripe.js`; la variable de entorno lo sobrescribe.
- Los precios no son secretos.

## Variables y secretos

En `wrangler.jsonc` (`vars`):
- `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_PRICE_ID_BOLETIN_MONTHLY`, `STRIPE_PRICE_ID_BOLETIN_YEARLY`
- `STRIPE_PORTAL_CONFIG_ID`: configuración del portal de clientes que usa el código.
- `APP_URL`: `https://perdata.site`.

Secretos del Worker (solo el nombre, el valor no va en el repo):
- `STRIPE_SECRET_KEY`: clave secreta de la API. Sin ella, y sin el id mensual del Pro, los pagos quedan deshabilitados.
- `STRIPE_WEBHOOK_SECRET`: firma del endpoint del webhook.

Opcional:
- `STRIPE_TRIAL_DAYS`: si tiene un número mayor que 0, da prueba a las compras que no son del Boletín. No está en `wrangler.jsonc`.

## Webhook

- URL del endpoint: `https://perdata.site/api/stripe-webhook`
- Eventos que el código maneja (en `api/stripe-webhook.js`):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
- El valor de `STRIPE_WEBHOOK_SECRET` debe ser el signing secret de ese endpoint. Si se regenera, hay que actualizar el secreto.

## Ajustes en el panel de Stripe

- **Portal de clientes**: activarlo y usar la misma configuración que `STRIPE_PORTAL_CONFIG_ID`. Ubicación exacta en el menú: por confirmar.
- **Recibos por correo**: activar el envío de recibos a los clientes. Ubicación exacta: por confirmar.
- **Aviso de pago fallido**: activar los correos al cliente cuando un cobro falla (reintentos y avisos). Ubicación exacta: por confirmar. El código no envía estos avisos; los manda Stripe.

## Lista de prueba final

Hacerla en modo test antes de cobrar en real.

1. Comprar un plan desde `/precios` con una tarjeta de prueba de Stripe. Comprobar que vuelve a `/cuenta` y que el plan aparece activo.
2. Intentar comprar otro plan con la misma cuenta. Debe salir el aviso de suscripción en curso (409).
3. Cancelar desde «Gestionar suscripción» en Mi cuenta. Comprobar que, al terminar el periodo pagado, la cuenta vuelve a Gratis (evento `customer.subscription.deleted`).
4. Si se reembolsa un cobro desde el panel de Stripe, cancelar también la suscripción. El reembolso no cancela la suscripción por sí solo.
5. Revisar en Stripe que el webhook recibe los cinco eventos sin errores.
