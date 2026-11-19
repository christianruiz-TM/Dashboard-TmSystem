import { DIAS_FALLIDOS, esEstadoFallido, type ContactoFallido } from "@/lib/fallidos";
import { conCache, TTL } from "../cache";
import { obtenerEnums } from "../enums";
import { esMock, obtenerPool, sql } from "../pool";
import { claveCampanias, filtroCampanias } from "./util";

// ============================================================
// Contactos FALLIDOS de ahora (19/11/2026, lib/fallidos.ts): contactos con
// un estado de error de Altitude (`activity.status`: Aborted…, Invalid y
// Rejected, por nombre en `rdb_enums`, regla 5) que han tenido algún
// movimiento en `activity_history` en los últimos DIAS_FALLIDOS días.
// Se parte de los eventos del periodo (índice por `event_moment`, regla 3):
// 0,2 s; preguntar el último evento de cada contacto fallido recorría los
// 84.000 sin teléfono de listas viejas (0,5 s y creciendo).
// ============================================================

interface FilaSql {
  contacto: number;
  campania: string;
  estado: number;
  fecha: Date;
  agente: string | null;
  idUnico: string | null;
  nombre: string | null;
  telefono: string | null;
}

async function fallidosCore(campanias?: string[]): Promise<ContactoFallido[]> {
  const enums = await obtenerEnums();
  const estados = enums.InteractionDetailedStatus ?? {};
  const codigos = Object.entries(estados)
    .filter(([, nombre]) => esEstadoFallido(nombre))
    .map(([valor]) => Number(valor));
  if (codigos.length === 0) return [];

  const pool = await obtenerPool();
  const req = pool.request();
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - DIAS_FALLIDOS);
  req.input("desde", sql.DateTime, desde);
  const marcas = codigos.map((c, i) => {
    req.input(`est${i}`, sql.Int, c);
    return `@est${i}`;
  });
  const filtro = filtroCampanias(req, campanias, "c.shortname");
  // NOLOCK en el primer paso: recorre `activity` entera (sin índice por
  // estado) y, con los bloqueos de lectura, chocaba con la réplica, que la
  // actualiza sin parar (interbloqueo, 2 de 4 pruebas el 19/11/2026). Para
  // una foto que se refresca cada minuto da igual leer una fila a medio
  // escribir; si aun así sale víctima de un interbloqueo, se repite.
  // Dos pasos: primero los fallidos con movimiento, SIN el filtro de campañas
  // (decenas de filas, 0,2 s); con la lista de campañas en la misma sentencia
  // el optimizador cambiaba de plan y Bolsas tardaba 16 s. La tabla temporal
  // se borra al empezar por si una consulta anterior de la conexión falló.
  const r = await req.query(`
    -- Contactos fallidos (estado de error de Altitude) con movimiento en los últimos ${DIAS_FALLIDOS} días
    SET NOCOUNT ON;
    IF OBJECT_ID('tempdb..#fal') IS NOT NULL DROP TABLE #fal;
    SELECT a.code, a.campaign, a.status, a.contact_profile, a.resch_phone_value
    INTO #fal
    FROM activity a WITH (NOLOCK)
    WHERE a.status IN (${marcas.join(", ")})
      AND a.code IN (SELECT h.activity FROM activity_history h WITH (NOLOCK) WHERE h.event_moment >= @desde);

    SELECT a.code                                         AS contacto,
           RTRIM(c.shortname)                             AS campania,
           a.status                                       AS estado,
           ult.fecha                                      AS fecha,
           RTRIM(u.usr_name)                              AS agente,
           NULLIF(RTRIM(p.unique_id), '')                 AS idUnico,
           NULLIF(LTRIM(RTRIM(ISNULL(p.first, '') + ' ' + ISNULL(p.last, ''))), '') AS nombre,
           COALESCE(NULLIF(RTRIM(a.resch_phone_value), ''), NULLIF(RTRIM(p.phone_01_value), '')) AS telefono
    FROM #fal a
    INNER JOIN ph_campaign c ON c.code = a.campaign
    CROSS APPLY (SELECT MAX(h.event_moment) AS fecha FROM activity_history h WHERE h.activity = a.code) ult
    OUTER APPLY (
        SELECT TOP 1 h.event_agent FROM activity_history h
        WHERE h.activity = a.code AND h.event_agent > 0
        ORDER BY h.event_moment DESC, h.code DESC
    ) ag
    LEFT JOIN ph_e_user u ON u.code = ag.event_agent
    LEFT JOIN ph_contact_profile p ON p.code = a.contact_profile
    WHERE c.shortname NOT LIKE 'Test[_]%'${filtro};

    DROP TABLE #fal;
  `);
  return (r.recordset as FilaSql[]).map((f) => ({
    contacto: f.contacto,
    campania: f.campania,
    estado: estados[f.estado] ?? `#${f.estado}`,
    fecha: f.fecha,
    agente: f.agente,
    idUnico: f.idUnico,
    nombre: f.nombre,
    telefono: f.telefono,
  }));
}

/** Error 1205 de SQL Server: víctima de un interbloqueo («Rerun the transaction»). */
function esInterbloqueo(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { number?: number }).number === 1205;
}

/** La consulta, repitiéndola hasta dos veces si SQL Server la elige víctima de un interbloqueo. */
async function fallidosConReintento(campanias?: string[]): Promise<ContactoFallido[]> {
  for (let intento = 1; ; intento++) {
    try {
      return await fallidosCore(campanias);
    } catch (e) {
      if (!esInterbloqueo(e) || intento >= 3) throw e;
      console.warn(`[rdb] fallidos: interbloqueo, reintento ${intento}`);
    }
  }
}

/** Datos inventados del modo demo. */
function mockFallidos(campanias?: string[]): ContactoFallido[] {
  const nombres = campanias && campanias.length > 0 ? campanias.slice(0, 2) : ["Demo_Saliente_1", "Demo_BBDD_1"];
  const hoy = new Date();
  return [
    { estado: "AbortedNoAddresses", dias: 1 },
    { estado: "AbortedMaxTries", dias: 3 },
    { estado: "AbortedByAgentLost", dias: 6 },
  ].map((e, i) => ({
    contacto: 900000 + i,
    campania: nombres[i % nombres.length],
    estado: e.estado,
    fecha: new Date(hoy.getTime() - e.dias * 86_400_000),
    agente: i === 2 ? "Demo_0001" : null,
    idUnico: `# ${100000 + i}`,
    nombre: `Contacto de prueba ${i + 1}`,
    telefono: `60000000${i}`,
  }));
}

/** Los fallidos de ahora (caché de 60 s, como Tiempo real). `campanias`: undefined = todas. */
export async function contactosFallidos(campanias?: string[]): Promise<ContactoFallido[]> {
  if (esMock()) return mockFallidos(campanias);
  return conCache(`rdb:fallidos:${claveCampanias(campanias)}`, TTL.supervision, () => fallidosConReintento(campanias));
}
