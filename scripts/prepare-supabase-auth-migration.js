#!/usr/bin/env node
/**
 * scripts/prepare-supabase-auth-migration.js
 *
 * Prepara la migración de usuarios de public.users a Supabase Auth (auth.users).
 * - venturasaldanaa@gmail.com mantiene su plan Pro (app_metadata y user_metadata con plan: "pro").
 * - A los demás usuarios se les genera un enlace administrativo para "crear contraseña",
 *   quedando almacenado en data/migration-auth-links.json SIN enviar correos todavía.
 *
 * Uso:
 *   node scripts/prepare-supabase-auth-migration.js [--dry-run] [--apply]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://hhutoitkkomfzkmakwts.supabase.co").replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const isDryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");

async function main() {
  console.log("=" .repeat(60));
  console.log("  PerData — Preparación de Migración a Supabase Auth");
  console.log(`  Modo: ${isDryRun ? "DRY-RUN (Simulación sin cambios)" : "APPLY (Ejecución real)"}`);
  console.log("=" .repeat(60));

  // 1. Obtener usuarios de public.users
  const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,email,name,role,plan,stripe_customer_id,created_at`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  if (!usersRes.ok) {
    console.error("Error al consultar public.users:", usersRes.status, await usersRes.text());
    process.exit(1);
  }

  const publicUsers = await usersRes.json();
  console.log(`Usuarios encontrados en public.users: ${publicUsers.length}`);

  // 2. Obtener usuarios existentes en auth.users
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const authData = await authRes.json();
  const existingAuthMap = new Map((authData.users || []).map(u => [u.email.toLowerCase(), u]));

  const prepared = [];

  for (const u of publicUsers) {
    const email = u.email.toLowerCase();
    const isAgustin = email === "venturasaldanaa@gmail.com";
    const targetPlan = isAgustin ? "pro" : (u.plan || "free");
    const exists = existingAuthMap.has(email);

    console.log(`\n• [${email}]`);
    console.log(`  Nombre: ${u.name || "Sin nombre"}`);
    console.log(`  Plan original: ${u.plan} -> Plan destino: ${targetPlan}`);
    console.log(`  Estado en auth.users: ${exists ? "YA EXISTE" : "PENDIENTE DE CREAR"}`);

    if (isDryRun) {
      prepared.push({
        email,
        name: u.name,
        plan: targetPlan,
        isPro: targetPlan === "pro",
        action: exists ? "update_metadata" : "create_user_and_link",
        status: "dry_run"
      });
      continue;
    }

    // Modo --apply
    let authUser = existingAuthMap.get(email);
    if (!authUser) {
      // Crear en auth.users
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: {
            name: u.name || email.split("@")[0],
            plan: targetPlan
          },
          app_metadata: {
            plan: targetPlan,
            provider: "email",
            providers: ["email"]
          }
        })
      });

      if (!createRes.ok) {
        console.error(`  Error creando usuario en auth.users: ${createRes.status}`, await createRes.text());
        continue;
      }
      authUser = await createRes.json();
      console.log(`  ✓ Creado en auth.users con ID: ${authUser.id}`);
    } else {
      // Actualizar metadata de plan si ya existe
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_metadata: {
            ...(authUser.user_metadata || {}),
            name: u.name || authUser.user_metadata?.name || email.split("@")[0],
            plan: targetPlan
          },
          app_metadata: {
            ...(authUser.app_metadata || {}),
            plan: targetPlan
          }
        })
      });
      if (updateRes.ok) {
        console.log(`  ✓ Metadatos actualizados (plan: ${targetPlan})`);
      }
    }

    // Generar enlace administrativo (crear contraseña / recuperación)
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "recovery",
        email: email,
        redirect_to: "https://perdata.site/restablecer"
      })
    });

    let actionLink = null;
    if (linkRes.ok) {
      const linkData = await linkRes.json();
      actionLink = linkData.action_link;
      console.log(`  ✓ Enlace de configuración de contraseña preparado (NO enviado al usuario)`);
    }

    prepared.push({
      email,
      name: u.name,
      plan: targetPlan,
      isPro: targetPlan === "pro",
      authUserId: authUser.id,
      setupPasswordLink: actionLink,
      status: "prepared"
    });
  }

  // Guardar archivo local con los enlaces preparados
  const outPath = path.join(ROOT_DIR, "data", "migration-auth-links.json");
  fs.writeFileSync(outPath, JSON.stringify(prepared, null, 2), "utf-8");
  console.log("\n" + "=" .repeat(60));
  console.log(`Reporte guardado en: ${outPath}`);
  console.log("NOTA: Ningún correo fue enviado a los usuarios.");
  console.log("=" .repeat(60));
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
