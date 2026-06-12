"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/sqlite";
import { users } from "@/lib/db/schema";
import { verificarPassword } from "@/lib/auth/password";
import { crearSesion } from "@/lib/auth/session";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/auth/rate-limit";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { RUTA_POR_ROL } from "@/lib/auth/rbac";

const esquemaLogin = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export async function iniciarSesion(formData: FormData): Promise<void> {
  const datos = esquemaLogin.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!datos.success) redirect("/login?error=datos");

  const { username, password } = datos.data;
  const ip = await ipPeticion();

  // Bloqueo por intentos fallidos
  const bloqueado = minutosBloqueado(username, ip);
  if (bloqueado != null) {
    registrarAuditoria({ accion: "login_bloqueado", username, ip });
    redirect(`/login?error=bloqueado&min=${bloqueado}`);
  }

  const usuario = db.select().from(users).where(eq(users.username, username)).get();

  // Comparación aunque el usuario no exista (tiempo constante frente a enumeración)
  const hashFicticio = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7lr3R1G9l1XKpYwT9P5g5s5h5b5h5bC";
  const passwordOk = await verificarPassword(password, usuario?.passwordHash ?? hashFicticio);

  if (!usuario || !usuario.activo || !passwordOk) {
    registrarFallo(username, ip);
    registrarAuditoria({ accion: "login_fail", username, ip });
    redirect("/login?error=credenciales");
  }

  limpiarFallos(username, ip);
  const agente = (await headers()).get("user-agent");
  await crearSesion(usuario.id, ip, agente);
  db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, usuario.id)).run();
  registrarAuditoria({ accion: "login_ok", userId: usuario.id, username, ip });

  redirect(usuario.mustChangePassword ? "/cambiar-password" : RUTA_POR_ROL[usuario.rol]);
}
