# Activar cobros con Stripe

El código de facturación ya está listo (`api/billing.js`, `api/stripe-webhook.js`).
Mientras falten las variables de Stripe, la web muestra "Disponible muy pronto" y no cobra nada.

## 1. Base de datos (una vez)

En Supabase → SQL Editor, ejecuta `supabase/migrations/0002_billing_and_lockdown.sql`.
Agrega las columnas de plan y suscripción y cierra la tabla `users` a las claves públicas.

Opcional: `scripts/migrate-legacy-users.js` copia a Supabase las cuentas del antiguo `data/users.json`
(al 21-10-2026 solo eran cuentas de prueba, así que no hace falta).

## 2. Stripe

1. **Productos** → crea "PerData Pro" con un precio recurrente mensual (y uno anual si quieres). Copia los `price_...`.
2. **Configuración → Portal de clientes**: actívalo y permite cancelar la suscripción y actualizar el método de pago.
3. **Desarrolladores → Webhooks** → agrega el endpoint `https://TU-DOMINIO/api/stripe-webhook` con estos eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copia el "Signing secret" (`whsec_...`).

## 3. Variables en Vercel (Production)

```sh
vercel env add JWT_SECRET production            # openssl rand -hex 32
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PRICE_ID_MONTHLY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add APP_URL production
```

Opcionales: `STRIPE_PRICE_ID_YEARLY`, `STRIPE_TRIAL_DAYS`. Vuelve a desplegar después de agregarlas.

> Al definir `JWT_SECRET` se cierran todas las sesiones abiertas una vez; los usuarios solo vuelven a iniciar sesión.

## 4. Correo para recuperar contraseña

Crea una cuenta en [Resend](https://resend.com), verifica tu dominio y agrega en Vercel
`RESEND_API_KEY` y `EMAIL_FROM` (por ejemplo `PerData <no-reply@tu-dominio.com>`).
Sin ellas, "¿Olvidaste tu contraseña?" responde que la recuperación aún no está activa.

## 5. Retirar la copia antigua en Supabase

La edge function `macro-explorer` servía las APIs sin límites de plan. El código ya la reemplaza por una
redirección; publícala con `supabase functions deploy macro-explorer` (o bórrala desde el panel de Supabase).

## 6. Probar en modo test

Con claves `sk_test_...`: crea una cuenta → Precios → "Mejorar a Pro" → paga con la tarjeta `4242 4242 4242 4242`.
Al volver a `/cuenta` el plan debe pasar a Pro en unos segundos. Cancela desde "Gestionar suscripción"
y confirma que, al terminar el periodo, la cuenta vuelve a Gratis.

## Planes

Los límites viven en `api/_lib/plans.js` (el navegador los recibe de `/api/billing?action=config`
y el servidor los vuelve a validar en `/api/historical` y `/api/forecast`).

| | Sin cuenta | Gratis | Pro |
|---|---|---|---|
| Historia | hasta 5 años | hasta 5 años | 10 años y máx. |
| Horizonte | 1 mes | 1–6 meses | 1–36 meses |
| Excel | — | — | Sí |
