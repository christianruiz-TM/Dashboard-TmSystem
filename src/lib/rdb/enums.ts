import { conCache, TTL } from "./cache";
import { esMock, obtenerPool } from "./pool";

// ============================================================
// Diccionario de enumerados de la instalación (tabla rdb_enums).
// REGLA: los códigos numéricos se traducen SIEMPRE con esta tabla,
// nunca con CASE hardcodeados, para reflejar la instalación real.
// ============================================================

export type MapaEnums = Record<string, Record<number, string>>;

/** Subconjunto de respaldo para modo mock o si rdb_enums no responde. */
const ENUMS_RESPALDO: MapaEnums = {
  InteractionTerminationStatus: {
    1: "Handled",
    2: "Busy",
    3: "Machine",
    4: "NoAnswer",
    5: "Nuisance",
    6: "Abandoned",
    7: "Rejected",
    8: "InvalidNumber",
    9: "Overflow",
    10: "TrunkLineOverflow",
    11: "Redirected",
    17: "Canceled",
    18: "ReEnqueued",
  },
  InteractionOrigin: { 1: "Inbound", 2: "Outbound", 3: "Workflow", 4: "SoloData" },
  AgentInCampaignOperationLogType: { 0: "Logado", 1: "Ready", 2: "NotReady" },
  CampaignType: { 0: "Inbound", 1: "Outbound", 2: "Blended", 3: "Repository" },
};

/** Carga (cacheada 24 h) de todos los enumerados de la instalación. */
export async function obtenerEnums(): Promise<MapaEnums> {
  if (esMock()) return ENUMS_RESPALDO;
  return conCache("rdb:enums", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- Diccionario completo de enumerados de la instalación
      SELECT enum_name, enum_value, enum_value_name
      FROM rdb_enums
    `);
    const mapa: MapaEnums = {};
    for (const fila of r.recordset as {
      enum_name: string;
      enum_value: number;
      enum_value_name: string;
    }[]) {
      (mapa[fila.enum_name] ??= {})[fila.enum_value] = fila.enum_value_name;
    }
    return mapa;
  });
}

/** Traduce un valor numérico; si no existe, devuelve `#<valor>`. */
export async function nombreEnum(enumName: string, valor: number): Promise<string> {
  const enums = await obtenerEnums();
  return enums[enumName]?.[valor] ?? ENUMS_RESPALDO[enumName]?.[valor] ?? `#${valor}`;
}
