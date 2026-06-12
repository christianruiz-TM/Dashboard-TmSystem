"use server";

import { redirect } from "next/navigation";
import { destruirSesion, obtenerSesion } from "@/lib/auth/session";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";

export async function cerrarSesion(): Promise<void> {
  const usuario = await obtenerSesion();
  await destruirSesion();
  if (usuario) {
    registrarAuditoria({
      accion: "logout",
      userId: usuario.id,
      username: usuario.username,
      ip: await ipPeticion(),
    });
  }
  redirect("/login");
}
