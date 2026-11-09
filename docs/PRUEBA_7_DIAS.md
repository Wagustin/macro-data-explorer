# Prueba gratuita de 7 días del plan Boletín

Prueba gratuita de 7 días con tarjeta para el plan Boletín (mensual y anual). Hoy no se cobra nada; a los 7 días se cobra automáticamente salvo que el usuario cancele antes. Verificación de tarjeta para que no se creen cuentas para usar la prueba y descartarlas: una tarjeta solo puede usar una prueba, registrada por huella (fingerprint de Stripe).

Solo el plan Boletín lleva prueba. El plan Pro no lleva prueba.

## Qué hace el código

- `api/billing.js`: en el checkout del plan `boletin`, si el usuario es elegible (`users.trial_usado = false` y sin `stripe_subscription_id`), la sesión de Stripe lleva `subscription_data[trial_period_days]=7`, `payment_method_collection=always` y el aviso «Pruebas el plan Boletín 7 días gratis. Hoy no se cobra nada. Si no cancelas antes del día 8, se cobrará US$ 1.99 al mes (o US$ 15 al año) hasta que canceles. Cancela cuando quieras desde Mi cuenta.» Si la lectura de `trial_usado` falla (migración sin aplicar o error), no se ofrece prueba.
- `api/stripe-webhook.js`: cuando llega `customer.subscription.created` o `checkout.session.completed` de una suscripción en estado `trialing`, obtiene el medio de pago por defecto (`GET /v1/subscriptions/{id}?expand[]=default_payment_method`) y su `card.fingerprint`; lo consulta en `trial_tarjetas`. Si esa huella ya está asociada a otro usuario, termina la prueba ya (`POST /v1/subscriptions/{id}` con `trial_end=now`) y registra el motivo en consola; si no existe, inserta (fingerprint, user_id). En ambos casos marca `users.trial_usado=true` y guarda `trial_hasta` (fin de la prueba). Es idempotente ante reintentos del webhook.
- Estados: una suscripción `trialing` cuenta como plan Boletín activo (`ACTIVE_STATUSES` ya incluye `trialing`); al cancelar durante la prueba, el plan vuelve a gratis al terminar el periodo, sin cobro.
- Aviso previo: `customer.subscription.trial_will_end` envía un correo transaccional con Resend (`api/_lib/email.js`): asunto «Tu prueba del plan Boletín termina pronto»; cuerpo breve con la fecha de fin, el importe que se cobrará y el enlace a `https://perdata.site/cuenta` para cancelar antes; firma «el equipo de PerData».
- `cuenta.html` (y la respuesta de `/api/auth` vía `publicUser`): si el usuario está en prueba, muestra «Estás en prueba gratuita hasta el <fecha>. Después se cobrará US$ <importe>. Puedes cancelar antes.» junto al botón de gestión de la suscripción.

## Pasos manuales de Agustín

### 1. Ejecutar la migración 0014 en el SQL Editor de Supabase

1. En el panel de Supabase (perdata), abre SQL Editor → New query.
2. Pega el contenido de `supabase/migrations/0014_prueba_7_dias.sql` y ejecuta (Run).
3. Verifica que `public.users` tiene las columnas `trial_usado` y `trial_hasta`, y que existe la tabla `public.trial_tarjetas` con RLS activado y sin políticas (solo la clave de servicio accede).
4. La migración es idempotente: se puede volver a ejecutar sin error.

### 2. Añadir los eventos al endpoint del webhook en el panel de Stripe

1. En Stripe → Developers → Webhooks → selecciona el endpoint que apunta a `https://perdata.site/api/stripe-webhook` (o el que ya sirve webhooks).
2. En Enabled events, asegúrate de que están suscritos:
   - `customer.subscription.trial_will_end` (añadir si no está)
   - `customer.subscription.created` (comprobar que está)
   - Además de los ya suscritos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
3. Guarda los cambios y confirma que el signing secret del endpoint sigue siendo el mismo que en la secreto `STRIPE_WEBHOOK_SECRET` del Worker. Si se regenera, actualiza la variable.

### 3. Cómo comprobarlo sin pagar

1. Inicia sesión en https://perdata.site con una cuenta nueva o con `trial_usado = false`.
2. Ve a /precios y elige el plan Boletín (mensual o anual).
3. Abre el checkout y verifica que se muestra «7 días gratis» (o el aviso de 7 días gratis) sin completar el pago.
4. Cierra el checkout sin pagar: no se creó ningún cargo ni suscripción.
5. En el panel de Stripe (modo test), confirma que no aparece ningún pago para esa cuenta.

### 4. Notas sobre Stripe Checkout

Stripe Checkout aplica 3-D Secure y Radar de forma automática: no hay que activar nada adicional para la verificación de la tarjeta. La prueba pide la tarjeta con `payment_method_collection=always`, así que la tarjeta queda guardada para el cobro automático al terminar la prueba, y el control de «una prueba por tarjeta» se aplica por la huella (fingerprint) registrada en `trial_tarjetas`.
