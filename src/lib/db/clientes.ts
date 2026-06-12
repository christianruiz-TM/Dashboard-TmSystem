import { asc, eq } from "drizzle-orm";
import { db } from "./sqlite";
import { clientCampaigns, clients, type Client } from "./schema";

/** Campañas (shortnames de Altitude) asignadas a un cliente. */
export function campaniasDeCliente(clientId: number): string[] {
  return db
    .select({ campania: clientCampaigns.campaignShortname })
    .from(clientCampaigns)
    .where(eq(clientCampaigns.clientId, clientId))
    .all()
    .map((f) => f.campania);
}

/** Listado de clientes (activos primero, alfabético). */
export function listarClientes(): Client[] {
  return db.select().from(clients).orderBy(asc(clients.nombre)).all();
}

export function obtenerCliente(clientId: number): Client | undefined {
  return db.select().from(clients).where(eq(clients.id, clientId)).get();
}

/** Sustituye el mapeo completo de campañas de un cliente. */
export function guardarCampaniasDeCliente(clientId: number, campanias: string[]): void {
  db.delete(clientCampaigns).where(eq(clientCampaigns.clientId, clientId)).run();
  if (campanias.length > 0) {
    db.insert(clientCampaigns)
      .values(campanias.map((campaignShortname) => ({ clientId, campaignShortname })))
      .run();
  }
}
