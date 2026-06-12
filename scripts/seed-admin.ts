/**
 * Crea el usuario administrador inicial.
 * Uso:  npm run seed:admin
 * Variables opcionales: ADMIN_USER (def. "admin"), ADMIN_PASSWORD (def. aleatoria),
 * ADMIN_NOMBRE (def. "Administrador").
 */
import { randomBytes } from "node:crypto";

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env: valores por defecto */
  }

  // Imports dinámicos para que el .env ya esté cargado (SQLITE_PATH)
  const { db } = await import("../src/lib/db/sqlite");
  const { users } = await import("../src/lib/db/schema");
  const { hashearPassword } = await import("../src/lib/auth/password");
  const { eq } = await import("drizzle-orm");

  const username = process.env.ADMIN_USER ?? "admin";
  const nombre = process.env.ADMIN_NOMBRE ?? "Administrador";
  const password =
    process.env.ADMIN_PASSWORD ?? `Tm${randomBytes(8).toString("base64url")}9`;

  const existe = db.select().from(users).where(eq(users.username, username)).get();
  if (existe) {
    console.log(`El usuario "${username}" ya existe (id ${existe.id}). No se hace nada.`);
    console.log(`Para resetear su contraseña usa Administración → Usuarios.`);
    return;
  }

  db.insert(users)
    .values({
      username,
      nombre,
      rol: "admin",
      passwordHash: await hashearPassword(password),
      mustChangePassword: true,
    })
    .run();

  console.log("✔ Usuario administrador creado");
  console.log(`   Usuario:    ${username}`);
  console.log(`   Contraseña: ${password}`);
  console.log("   (deberá cambiarla en el primer acceso)");
}

main().catch((err) => {
  console.error("Error creando el admin:", err);
  process.exit(1);
});
