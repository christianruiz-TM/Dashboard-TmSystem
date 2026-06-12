"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { users } from "@/lib/db/schema";
import { obtenerSesion, cerrarSesionesDeUsuario, crearSesion } from "@/lib/auth/session";
import { hashearPassword, validarPoliticaPassword, verificarPassword } from "@/lib/auth/password";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { RUTA_POR_ROL } from "@/lib/auth/rbac";
import { headers } from "next/headers";

export async function cambiarPassword(formData: FormData): Promise<void> {
  const usuario = await obtenerSesion();
  if (!usuario) redirect("/login");

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  const repetida = String(formData.get("repetida") ?? "");

  // Si el cambio no es forzado, exigir la contraseña actual
  if (!usuario.mustChangePassword) {
    const ok = await verificarPassword(actual, usuario.passwordHash);
    if (!ok) redirect("/cambiar-password?error=actual");
  }
  if (nueva !== repetida) redirect("/cambiar-password?error=distintas");
  const fallo = validarPoliticaPassword(nueva);
  if (fallo) redirect("/cambiar-password?error=politica");
  const repite = await verificarPassword(nueva, usuario.passwordHash);
  if (repite) redirect("/cambiar-password?error=igual");

  db.update(users)
    .set({ passwordHash: await hashearPassword(nueva), mustChangePassword: false })
    .where(eq(users.id, usuario.id))
    .run();

  // Invalidar el resto de sesiones y renovar la actual
  cerrarSesionesDeUsuario(usuario.id);
  await crearSesion(usuario.id, await ipPeticion(), (await headers()).get("user-agent"));
  registrarAuditoria({
    accion: "cambio_password",
    userId: usuario.id,
    username: usuario.username,
    ip: await ipPeticion(),
  });
  redirect(RUTA_POR_ROL[usuario.rol]);
}
