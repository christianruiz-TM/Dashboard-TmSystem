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
  | "export"
  // Planificación de turnos
  | "plan_generar"
  | "plan_editar"
  | "plan_publicar"
  | "plan_importar"
  | "plan_ausencia"
  | "plan_bolsa"
  | "plan_config"
  | "plan_saldo_ajuste";

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

/**
 * IP del cliente. Solo se hacen caso a x-forwarded-for / x-real-ip cuando
 * TRUST_PROXY=1, es decir, cuando de verdad hay un proxy inverso delante que
 * las reescribe (fase internet con Caddy).
 *
 * Por qué: esas cabeceras las pone quien llama, y la clave del rate-limit de
 * login es usuario+IP. Sin proxy delante, cualquiera podía mandar un
 * x-forwarded-for distinto en cada intento y saltarse el bloqueo de 5 fallos
 * con fuerza bruta ilimitada. En LAN sin proxy la cabecera no llega, así que
 * esto no quita información: solo cierra la vía de falsearla.
 */
export async function ipPeticion(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "1") return null;
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return h.get("x-real-ip");
}
