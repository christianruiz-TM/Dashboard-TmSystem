import { conCache, TTL } from "../cache";
import { mockServicios } from "../mock";
import { esMock, obtenerPool } from "../pool";
import type { ServicioConCampanias } from "../types";
import { listadoCampanias } from "./campanias";

/** ¿Es una campaña de IVR? Convención de la instalación: prefijo `IVR_`. */
export function esIvr(shortname: string): boolean {
  return /^IVR_/i.test(shortname);
}

/**
 * ¿Es una campaña de pruebas (`Test_*`)? No debe contar en ningún KPI ni
 * mapearse a clientes. `listaServicios()` ya las excluye en el SQL, pero el
 * maestro `listadoCampanias()` las trae (lo usa el admin para el mapeo), así
 * que hay que filtrarlas al construir el alcance de los paneles.
 */
export function esTest(shortname: string): boolean {
  return /^Test_/i.test(shortname);
}

// ============================================================
// Servicios = clientes. En esta instalación de Altitude cada cliente
// tiene un servicio (ph_service) y sus campañas se relacionan vía
// cp_general_cfg. Se usa para agrupar/filtrar los paneles por cliente.
// Cacheado 24 h: es configuración, cambia poquísimo.
// ============================================================

/**
 * Lista de servicios con sus campañas reales (shortnames). Excluye las
 * campañas y servicios de pruebas (`Test_*`) y los servicios sin campañas.
 */
export async function listaServicios(): Promise<ServicioConCampanias[]> {
  if (esMock()) return mockServicios();
  return conCache("rdb:servicios", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- Servicio (cliente) → campañas reales asociadas
      SELECT RTRIM(s.name) AS servicio, RTRIM(c.shortname) AS campania
      FROM ph_service s
      INNER JOIN cp_general_cfg cfg ON s.code = cfg.service
      INNER JOIN ph_campaign    c   ON cfg.campaign = c.code
      WHERE s.name   NOT LIKE 'Test[_]%'
        AND c.shortname NOT LIKE 'Test[_]%'
      ORDER BY s.name, c.shortname;
    `);
    const mapa = new Map<string, string[]>();
    for (const f of r.recordset as { servicio: string; campania: string }[]) {
      const lista = mapa.get(f.servicio) ?? [];
      if (!lista.includes(f.campania)) lista.push(f.campania);
      mapa.set(f.servicio, lista);
    }
    return [...mapa.entries()]
      .map(([servicio, campanias]) => ({ servicio, campanias }))
      .sort((a, b) => b.campanias.length - a.campanias.length);
  });
}

/**
 * Resuelve el parámetro `?servicio=` a la lista de campañas a filtrar.
 * Devuelve `undefined` (= todos) si no hay servicio o no existe. Ese
 * `undefined` encaja con el parámetro `campanias?` de las queries.
 */
export async function campaniasDeServicio(
  servicio: string | undefined,
): Promise<string[] | undefined> {
  if (!servicio) return undefined;
  const servicios = await listaServicios();
  return servicios.find((s) => s.servicio === servicio)?.campanias;
}

/**
 * Lista de campañas efectiva para los paneles: parte del servicio (o todas) y,
 * salvo que `incluirIvr` sea true, EXCLUYE las campañas IVR (`IVR_*`). Las IVR
 * son automáticas (locución/enrutado) y por defecto no se cuentan en los KPIs.
 * Devuelve `undefined` solo cuando no hay scope alguno (todas, IVR incluidas).
 */
export async function campaniasEfectivas(
  servicio: string | undefined,
  incluirIvr: boolean,
): Promise<string[] | undefined> {
  const base = await campaniasDeServicio(servicio);
  // Con servicio elegido, listaServicios() ya excluyó las Test_* en el SQL
  if (base) return incluirIvr ? base : base.filter((c) => !esIvr(c));
  // Sin servicio hay que enumerar el maestro completo, y ese SÍ trae las
  // campañas de pruebas: si no se filtran aquí, la vista "todos los
  // servicios" las cuenta en los KPIs (24 de 201 campañas en esta
  // instalación). Se excluyen siempre; las IVR, salvo que se pidan.
  const todas = await listadoCampanias();
  return todas
    .map((c) => c.shortname)
    .filter((c) => !esTest(c) && (incluirIvr || !esIvr(c)));
}

/**
 * Mapa campaña→servicio (cliente). Para resolver la facturación a nivel de
 * servicio. Si una campaña estuviese en varios servicios (cp_general_cfg es
 * 1:N) gana el de más campañas (la lista viene ordenada así).
 */
export function mapaCampaniaServicio(servicios: ServicioConCampanias[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const s of servicios) {
    for (const c of s.campanias) if (!mapa.has(c)) mapa.set(c, s.servicio);
  }
  return mapa;
}
