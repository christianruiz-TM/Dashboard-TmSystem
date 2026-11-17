// NOTA: solo servidor. Quién ha mirado el detalle de qué persona (panel de
// RRHH: datos de control de la plantilla). La página de hoy se refresca cada
// minuto: la misma consulta del mismo usuario se apunta como mucho una vez
// cada 30 min. Se mira en la propia audit_log (no en memoria: en memoria se
// perdía con cada recarga del módulo y salían repetidas).
import { and, eq, gte } from "drizzle-orm";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { db } from "@/lib/db/sqlite";
import { auditLog, type User } from "@/lib/db/schema";

const VENTANA_MS = 30 * 60_000;

export async function auditarVerPersona(usuario: User, agenteNumero: string, fecha: string): Promise<void> {
  const detalle = `${agenteNumero} ${fecha}`;
  const reciente = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.accion, "rrhh_ver_persona"),
        eq(auditLog.userId, usuario.id),
        eq(auditLog.detalle, detalle),
        gte(auditLog.ts, new Date(Date.now() - VENTANA_MS)),
      ),
    )
    .get();
  if (reciente) return;
  registrarAuditoria({ accion: "rrhh_ver_persona", userId: usuario.id, username: usuario.username, detalle, ip: await ipPeticion() });
}
