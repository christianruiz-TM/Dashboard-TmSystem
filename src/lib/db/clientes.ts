import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "./sqlite";
import { clients, type Client } from "./schema";

// ============================================================
// Clientes del portal «Mi servicio». Desde el 06/11/2026 cada cliente va por
// su SERVICIO de Altitude (`service_name`), no por una lista de campañas:
// ve todas las campañas del servicio (sin IVR ni Test). La tabla
// client_campaigns se queda sin uso.
// ============================================================

/** Listado de clientes (alfabético). */
export function listarClientes(): Client[] {
  return db.select().from(clients).orderBy(asc(clients.nombre)).all();
}

export function obtenerCliente(clientId: number): Client | undefined {
  return db.select().from(clients).where(eq(clients.id, clientId)).get();
}

/**
 * Servicios de Altitude con un cliente ACTIVO dado de alta: los que salen en
 * el selector de «Mi servicio» (decidido 06/11/2026; los internos, como
 * Bolsas, Socios o TMSYSTEM, no tienen cliente y no salen).
 */
export function serviciosConCliente(): string[] {
  return db
    .select({ servicio: clients.serviceName })
    .from(clients)
    .where(and(eq(clients.activo, true), isNotNull(clients.serviceName)))
    .all()
    .map((f) => f.servicio!)
    .filter(Boolean);
}

/** ¿Hay OTRO cliente con ese servicio? (uno por servicio). */
export function servicioOcupado(servicio: string, salvoClientId: number): boolean {
  return !!db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.serviceName, servicio), ne(clients.id, salvoClientId)))
    .get();
}

/** Asigna (o quita, con null) el servicio de Altitude de un cliente. */
export function guardarServicioCliente(clientId: number, servicio: string | null): void {
  db.update(clients).set({ serviceName: servicio }).where(eq(clients.id, clientId)).run();
}
