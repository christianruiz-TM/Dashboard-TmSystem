import { conCache, TTL } from "../cache";
import { mockServicios } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { ServicioConCampanias } from "../types";
import { listadoCampanias } from "./campanias";
import { compararTexto } from "@/lib/orden";

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
// Cacheado 10 min (TTL.campanias): una campaña nueva sale enseguida.
// ============================================================

/**
 * Lista de servicios con sus campañas reales (shortnames). Excluye las
 * campañas y servicios de pruebas (`Test_*`) y los servicios sin campañas.
 */
export async function listaServicios(): Promise<ServicioConCampanias[]> {
  if (esMock()) return mockServicios();
  return conCache("rdb:servicios", TTL.campanias, async () => {
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
    // De la A a la Z (04/11/2026), también sus campañas
    return [...mapa.entries()]
      .map(([servicio, campanias]) => ({ servicio, campanias: [...campanias].sort(compararTexto) }))
      .sort((a, b) => compararTexto(a.servicio, b.servicio));
  });
}

/**
 * Resuelve el parámetro `?servicio=` a la lista de campañas a filtrar.
 * Devuelve `undefined` (= todos) solo si NO se pide servicio; si se pide uno
 * que no existe, `[]` (ninguna campaña). Antes daba `undefined` y un
 * `?servicio=GrupoHuertass` enseñaba todos los clientes (auditoría
 * 11/11/2026). Las páginas avisan con `AvisoServicio` y pasan `undefined`.
 */
export async function campaniasDeServicio(
  servicio: string | undefined,
): Promise<string[] | undefined> {
  if (!servicio) return undefined;
  const servicios = await listaServicios();
  return servicios.find((s) => s.servicio === servicio)?.campanias ?? [];
}

/**
 * Lista de campañas efectiva para los paneles: parte del servicio (o todas) y,
 * salvo que `incluirIvr` sea true, EXCLUYE las campañas IVR (`IVR_*`). Las IVR
 * son automáticas (locución/enrutado) y por defecto no se cuentan en los KPIs.
 * Con servicio, devuelve siempre una lista, aunque quede vacía (un cliente con
 * solo campañas IVR, o uno que no existe): vacía = NINGUNA campaña en las
 * queries (`filtroCampanias`), nunca «todas».
 */
export async function campaniasEfectivas(
  servicio: string | undefined,
  incluirIvr: boolean,
): Promise<string[] | undefined> {
  const base = await campaniasDeServicio(servicio);
  // Con servicio elegido, listaServicios() ya excluyó las Test_* en el SQL
  if (servicio && base) return incluirIvr ? base : base.filter((c) => !esIvr(c));
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
 * 1:N) gana el PRIMERO por orden alfabético del servicio (`listaServicios`
 * va de la A a la Z desde el 04/11/2026). Verificado el 11/11/2026: ninguna
 * de las 181 campañas está en dos servicios.
 */
export function mapaCampaniaServicio(servicios: ServicioConCampanias[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const s of servicios) {
    for (const c of s.campanias) if (!mapa.has(c)) mapa.set(c, s.servicio);
  }
  return mapa;
}

/**
 * Última llamada de cada servicio (cliente) en los últimos 90 días, en hora
 * local ('YYYY-MM-DD HH:mm'); null si no tuvo ninguna. Ordena el selector de
 * clientes: los que tienen actividad arriba y los parados abajo (pedido el
 * 21/10/2026). Rango acotado (regla 3) y caché de 1 h.
 */
export async function actividadServicios(): Promise<Record<string, string | null>> {
  const servicios = await listaServicios();
  if (esMock()) {
    return Object.fromEntries(servicios.map((s, i) => [s.servicio, i % 4 === 3 ? null : `2026-10-${String(20 - i).padStart(2, "0")} 12:00`]));
  }
  const porCampania = await conCache("rdb:actividadCampanias", 60 * 60_000, async () => {
    const pool = await obtenerPool();
    const r = pool.request();
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    desde.setDate(desde.getDate() - 90);
    r.input("desde", sql.DateTime, desde);
    const res = await r.query(`
      SELECT RTRIM(c.shortname) AS campania, CONVERT(varchar(16), MAX(t.start_time), 120) AS ultima
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde
      GROUP BY RTRIM(c.shortname);
    `);
    return Object.fromEntries((res.recordset as { campania: string; ultima: string }[]).map((f) => [f.campania, f.ultima]));
  });
  return Object.fromEntries(
    servicios.map((s) => {
      const fechas = s.campanias.map((c) => porCampania[c]).filter((x): x is string => !!x);
      return [s.servicio, fechas.length > 0 ? fechas.sort().at(-1)! : null];
    }),
  );
}
