import { headers } from "next/headers";
import { db } from "@/lib/db/sqlite";
import { auditLog } from "@/lib/db/schema";

/** Acciones registradas en la auditoría. */
export type AccionAuditoria =
  | "login_ok"
  | "login_fail"
  | "login_bloqueado"
  | "logout"
  | "cambio_password"
  | "crear_usuario"
  | "editar_usuario"
  | "reset_password"
  | "crear_cliente"
  | "editar_cliente"
  | "config_facturacion"
  | "export";

/** Inserta una entrada de auditoría (síncrono, SQLite local). */
export function registrarAuditoria(entrada: {
  accion: AccionAuditoria;
  userId?: number | null;
  username?: string | null;
  detalle?: string | null;
  ip?: string | null;
}): void {
  db.insert(auditLog)
    .values({
      accion: entrada.accion,
      userId: entrada.userId ?? null,
      username: entrada.username ?? null,
      detalle: entrada.detalle ?? null,
      ip: entrada.ip ?? null,
    })
    .run();
}

/** IP del cliente respetando el proxy inverso de la fase internet. */
export async function ipPeticion(): Promise<string | null> {
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return h.get("x-real-ip");
}
