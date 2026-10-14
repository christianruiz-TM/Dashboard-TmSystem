import type { Request } from "mssql";
import { conCache, TTL, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import {
  mockBaseResultados,
  mockTablasResultados,
  mockTextosResultados,
  mockValoresColumnaResultados,
} from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type {
  BaseResultados,
  CategoriaCierre,
  FilaBaseResultados,
  TablaResultados,
  ValorColumnaResultado,
} from "../types";
import { calcularResultados, MAX_NIVELES, type ObjetivoResultados, type ResultadoResultados } from "@/lib/resultados-actividad";
import { claveCampanias, filtroCampanias, limitesRango } from "./util";
import { listaServicios, mapaCampaniaServicio } from "./servicios";

// ============================================================
// Resultados de actividad (regla 18): la tipificación que el agente pone
// en el script vive en una tabla por servicio, ao_<servicio>, ligada a la
// sesión por ph_activity_outcome:
//   script_session.code = ph_activity_outcome.script_session
//   ph_activity_outcome.code = ao_<servicio>.easycode
// Sus columnas (resultado, subresultado, motivo, call_type...) guardan
// ph_table_schema_enum_value.code, único en toda la instalación, que da el
// texto. Cada servicio tiene columnas distintas: cuáles se analizan y qué
// valores son «no válido» se configura en /admin/resultados (SQLite).
//
// Verificado contra RDBv2 (13/10/2026, GH septiembre 2026): 8.695 contactos
// cerrados tipificados, 2.597 éxitos, 2.973 «No valido»; 278 cierres
// administrativos (tipificados en marzo de 2025 y cerrados en bloque el
// 08/09/2026). Un mes de todos los servicios: 1,7 s; 12 meses: 14 s.
// ============================================================

/** Días antes del cierre en los que se busca la última sesión del agente. */
const DIAS_SESION = 90;

/** Identificador de SQL Server seguro para ir entre corchetes. */
const PATRON_IDENTIFICADOR = /^[A-Za-z0-9_]+$/;

/** Configuración de un servicio, tal como sale de SQLite. */
export interface ConfigResultados {
  serviceName: string;
  tablaAo: string;
  columnas: string[];
  codigosNoValidos: number[];
}

/**
 * Tablas ao_<servicio> de la instalación (table_schema, ts_type = 3) con
 * sus columnas enteras candidatas. Es la LISTA BLANCA de identificadores:
 * nada que no salga de aquí entra en el SQL.
 */
export async function tablasResultados(): Promise<TablaResultados[]> {
  if (esMock()) return mockTablasResultados();
  return conCache("rdb:resultados:tablas", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- Tablas de resultados de actividad de cada servicio y sus columnas
      -- enteras (los valores de enumerado son int); easycode es la clave.
      SELECT RTRIM(sv.name) AS servicio, RTRIM(ts.table_name) AS tabla, col.COLUMN_NAME AS columna
      FROM table_schema ts
      INNER JOIN ph_service sv ON sv.code = ts.service
      INNER JOIN INFORMATION_SCHEMA.COLUMNS col ON col.TABLE_NAME = RTRIM(ts.table_name)
      WHERE ts.ts_type = 3
        AND sv.name NOT LIKE 'Test[_]%'
        AND col.DATA_TYPE IN ('int', 'smallint')
        AND col.COLUMN_NAME <> 'easycode'
      ORDER BY sv.name, ts.table_name, col.ORDINAL_POSITION;
    `);
    const mapa = new Map<string, TablaResultados>();
    for (const f of r.recordset as { servicio: string; tabla: string; columna: string }[]) {
      const t = mapa.get(f.tabla) ?? { servicio: f.servicio, tabla: f.tabla, columnas: [] };
      t.columnas.push(f.columna);
      mapa.set(f.tabla, t);
    }
    return [...mapa.values()];
  });
}

/** ¿La configuración apunta a una tabla y columnas que existen? */
export function configValida(cfg: ConfigResultados, tablas: TablaResultados[]): boolean {
  const t = tablas.find((x) => x.tabla === cfg.tablaAo && x.servicio === cfg.serviceName);
  return (
    !!t &&
    PATRON_IDENTIFICADOR.test(cfg.tablaAo) &&
    cfg.columnas.length > 0 &&
    cfg.columnas.length <= MAX_NIVELES &&
    cfg.columnas.every((c) => PATRON_IDENTIFICADOR.test(c) && t.columnas.includes(c)) &&
    cfg.codigosNoValidos.every((c) => Number.isInteger(c))
  );
}

/** Textos de todos los valores de las tablas de resultados (code → nombre). */
async function textosResultados(): Promise<Record<number, string>> {
  if (esMock()) return mockTextosResultados();
  return conCache("rdb:resultados:textos", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      -- Valores de los enumerados propios de las tablas ao_<servicio>
      SELECT ev.code AS codigo, RTRIM(ev.name) AS nombre
      FROM ph_table_schema_enum_value ev
      INNER JOIN table_schema ts ON ts.code = ev.table_schema
      WHERE ts.ts_type = 3;
    `);
    const textos: Record<number, string> = {};
    for (const f of r.recordset as { codigo: number; nombre: string }[]) textos[f.codigo] = f.nombre;
    return textos;
  });
}

/**
 * Valores usados en una columna de una tabla de resultados, con cuántas
 * filas los llevan (para marcar los «no válidos» en el admin). Las tablas
 * ao_* son pequeñas (GH, la mayor: 125.000 filas, 64 ms).
 */
export async function valoresColumnaResultados(
  tabla: string,
  columna: string,
): Promise<ValorColumnaResultado[]> {
  if (esMock()) return mockValoresColumnaResultados(tabla, columna);
  const t = (await tablasResultados()).find((x) => x.tabla === tabla);
  if (!t || !t.columnas.includes(columna) || !PATRON_IDENTIFICADOR.test(tabla) || !PATRON_IDENTIFICADOR.test(columna)) {
    return [];
  }
  return conCache(`rdb:resultados:valores:${tabla}:${columna}`, TTL.diaEnCurso, async () => {
    const pool = await obtenerPool();
    // Identificadores de la lista blanca (tablasResultados), entre corchetes
    const r = await pool.request().query(`
      SELECT ao.[${columna}] AS codigo, RTRIM(ev.name) AS nombre, COUNT(*) AS contactos
      FROM [${tabla}] ao
      LEFT JOIN ph_table_schema_enum_value ev ON ev.code = ao.[${columna}]
      WHERE ao.[${columna}] IS NOT NULL
      GROUP BY ao.[${columna}], ev.name
      ORDER BY contactos DESC;
    `);
    return (r.recordset as { codigo: number; nombre: string | null; contactos: number }[]).map((f) => ({
      codigo: f.codigo,
      nombre: f.nombre ?? `#${f.codigo}`,
      contactos: f.contactos,
    }));
  });
}

/**
 * Familias de ContactBusinessStatus (activity.business_status), resueltas
 * con rdb_enums y no con números a mano (regla 5):
 *  - sin tocar: NotTouched*, AutomaticallyRescheduled, *BeforeConnection,
 *    Overflowed y NoValue (la consulta 7.7 de la referencia: «sin contacto»).
 *  - éxito: Success* (SuccessDone, y SuccessAborted/Canceled si aparecen).
 */
async function familiasEstadoContacto(): Promise<{ sinTocar: number[]; exito: number[] }> {
  const enums = await obtenerEnums();
  const valores = Object.entries(enums.ContactBusinessStatus ?? {}).map(([v, n]) => ({ v: Number(v), n }));
  return {
    sinTocar: valores
      .filter(({ n }) => /^(NotTouched|AutomaticallyRescheduled|AbortedBeforeConnection|CanceledBeforeConnection|Overflowed|NoValue)/.test(n))
      .map(({ v }) => v),
    exito: valores.filter(({ n }) => /^Success/.test(n)).map(({ v }) => v),
  };
}

/** Lista de parámetros @prefijo0..n; si está vacía, un valor imposible. */
function listaParametros(
  request: Request,
  prefijo: string,
  valores: number[],
): string {
  if (valores.length === 0) return "NULL";
  return valores
    .map((v, i) => {
      request.input(`${prefijo}${i}`, sql.Int, v);
      return `@${prefijo}${i}`;
    })
    .join(", ");
}

async function baseResultadosCore(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  configs: ConfigResultados[],
): Promise<BaseResultados> {
  const [tablas, servicios, familias, textos] = await Promise.all([
    tablasResultados(),
    listaServicios(),
    familiasEstadoContacto(),
    textosResultados(),
  ]);
  const validas = configs.filter((c) => configValida(c, tablas));

  const pool = await obtenerPool();
  const request = pool.request();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const desdeSesiones = new Date(desde);
  desdeSesiones.setDate(desdeSesiones.getDate() - DIAS_SESION);
  request.input("desde", sql.DateTime, desde);
  request.input("hastaExcl", sql.DateTime, hastaExcl);
  request.input("desdeSes", sql.DateTime, desdeSesiones);
  request.input("diasSesion", sql.Int, DIAS_SESION);
  const filtro = filtroCampanias(request, campanias, "c.shortname");
  const sinTocar = listaParametros(request, "st", familias.sinTocar);
  const exito = listaParametros(request, "ex", familias.exito);
  const noValidos = listaParametros(request, "nv", [...new Set(validas.flatMap((c) => c.codigosNoValidos))]);

  // Una tabla ao_* por servicio configurado. easycode es único en toda la
  // instalación, así que cada contacto casa como mucho con UNA de ellas y
  // el COALESCE de cada nivel recoge la columna de su servicio.
  const joins = validas
    .map((c, i) => `LEFT JOIN [${c.tablaAo}] ao${i} ON ao${i}.easycode = s.outcome`)
    .join("\n        ");
  const nivel = (k: number) => {
    const cols = validas.flatMap((c, i) => (c.columnas[k] ? [`ao${i}.[${c.columnas[k]}]`] : []));
    if (cols.length === 0) return "CAST(NULL AS int)";
    return cols.length === 1 ? cols[0] : `COALESCE(${cols.join(", ")})`;
  };

  const r = await request.query(`
    SET NOCOUNT ON;
    -- Tablas temporales (tempdb, de esta conexión): en una sola sentencia con
    -- CTEs el optimizador no estima los cerrados y pasaba de 5 minutos para un
    -- mes; materializados, 1,7 s. Se borran antes por si una consulta anterior
    -- de la misma conexión del pool falló a medias.
    IF OBJECT_ID('tempdb..#ses') IS NOT NULL DROP TABLE #ses;
    IF OBJECT_ID('tempdb..#cerr') IS NOT NULL DROP TABLE #cerr;

    -- 1) Contactos CERRADOS (activity.status = 3) fechados por su ÚLTIMO
    --    evento, como «leads finalizados» de facturación: MAX por actividad
    --    y no NOT EXISTS (regla 13).
    CREATE TABLE #cerr (activity int PRIMARY KEY, cierre datetime NOT NULL,
                        campania varchar(20) NOT NULL, estado smallint NULL);
    WITH ult AS (
        SELECT h.activity, MAX(h.event_moment) AS cierre
        FROM activity_history h
        WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
        GROUP BY h.activity
    )
    INSERT INTO #cerr (activity, cierre, campania, estado)
    SELECT ult.activity, ult.cierre, RTRIM(c.shortname), a.business_status
    FROM ult
    INNER JOIN activity    a ON a.code = ult.activity AND a.status = 3
    INNER JOIN ph_campaign c ON c.code = a.campaign
    WHERE ult.cierre = (
        SELECT MAX(h3.event_moment) FROM activity_history h3 WHERE h3.activity = ult.activity
    )${filtro};

    -- 2) Última sesión de AGENTE (type = 1) de cada contacto en los 90 días
    --    anteriores a su cierre; la que tiene resultado manda sobre la que no.
    CREATE TABLE #ses (contact int PRIMARY KEY, e_user int NOT NULL, outcome int NULL);
    WITH ses AS (
        SELECT s.contact, s.e_user, o.code AS outcome,
               ROW_NUMBER() OVER (
                   PARTITION BY s.contact
                   ORDER BY CASE WHEN o.code IS NULL THEN 1 ELSE 0 END, s.start_time DESC, s.code DESC
               ) AS rn
        FROM script_session s
        INNER JOIN #cerr k ON k.activity = s.contact
               AND s.start_time <= k.cierre
               AND s.start_time >= DATEADD(day, -@diasSesion, k.cierre)
        INNER JOIN ph_e_user u ON u.code = s.e_user AND u.type = 1
        LEFT JOIN ph_activity_outcome o ON o.script_session = s.code
        WHERE s.start_time >= @desdeSes AND s.start_time < @hastaExcl
    )
    -- HASH JOIN obligatorio: según cuántos cerrados haya, el optimizador
    -- elegía bucles anidados y el mes en curso (01-13/10/2026, 11.242
    -- cerrados) pasaba de 200 s; con hash, 0,2 s (12 meses: 1,8 s).
    INSERT INTO #ses (contact, e_user, outcome)
    SELECT contact, e_user, outcome FROM ses WHERE rn = 1
    OPTION (HASH JOIN);

    -- 3) Categoría, resultado (niveles configurados) y agente de cada
    --    contacto, agrupado por día de cierre, campaña y agente.
    WITH base AS (
        SELECT CONVERT(varchar(10), k.cierre, 23) AS fecha,
               k.campania,
               CASE WHEN k.estado IS NULL OR k.estado IN (${sinTocar}) THEN 'sinTocar'
                    WHEN s.contact IS NULL THEN 'administrativo'
                    ELSE 'tipificado' END AS categoria,
               s.e_user,
               ${nivel(0)} AS c1,
               ${nivel(1)} AS c2,
               ${nivel(2)} AS c3,
               CASE WHEN k.estado IN (${exito}) THEN 1 ELSE 0 END AS exito
        FROM #cerr k
        LEFT JOIN #ses s ON s.contact = k.activity
        ${joins}
    ),
    marcada AS (
        SELECT b.*,
               CASE WHEN b.categoria = 'tipificado'
                         AND (b.c1 IN (${noValidos}) OR b.c2 IN (${noValidos}) OR b.c3 IN (${noValidos}))
                    THEN 1 ELSE 0 END AS noValido
        FROM base b
    )
    SELECT m.fecha, m.campania, m.categoria,
           CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.usr_name) END AS agente,
           CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.fullname) END AS nombre,
           CASE WHEN m.categoria = 'tipificado' THEN m.c1 END AS c1,
           CASE WHEN m.categoria = 'tipificado' THEN m.c2 END AS c2,
           CASE WHEN m.categoria = 'tipificado' THEN m.c3 END AS c3,
           COUNT(*) AS contactos, SUM(m.exito) AS exitos, SUM(m.noValido) AS noValidos
    FROM marcada m
    LEFT JOIN ph_e_user u ON u.code = m.e_user
    GROUP BY m.fecha, m.campania, m.categoria,
             CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.usr_name) END,
             CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.fullname) END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c1 END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c2 END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c3 END;

    DROP TABLE #ses;
    DROP TABLE #cerr;
  `);

  const filas: FilaBaseResultados[] = (
    r.recordset as {
      fecha: string;
      campania: string;
      categoria: CategoriaCierre;
      agente: string | null;
      nombre: string | null;
      c1: number | null;
      c2: number | null;
      c3: number | null;
      contactos: number;
      exitos: number;
      noValidos: number;
    }[]
  ).map((f) => ({
    fecha: f.fecha,
    campania: f.campania,
    agente: f.agente,
    nombre: f.nombre,
    categoria: f.categoria,
    codigos: [f.c1, f.c2, f.c3],
    contactos: f.contactos,
    exitos: f.exitos,
    noValidos: f.noValidos,
  }));
  return montarBase(filas, textos, mapaCampaniaServicio(servicios), validas);
}

/** Completa la base con el servicio de cada campaña y los niveles configurados. */
function montarBase(
  filas: FilaBaseResultados[],
  textos: Record<number, string>,
  mapa: Map<string, string>,
  validas: ConfigResultados[],
): BaseResultados {
  const servicioDeCampania: Record<string, string> = {};
  for (const f of filas) {
    const s = mapa.get(f.campania);
    if (s) servicioDeCampania[f.campania] = s;
  }
  const niveles: Record<string, string[]> = {};
  for (const c of validas) niveles[c.serviceName] = c.columnas.map(etiquetaColumna);
  return {
    filas,
    textos,
    servicioDeCampania,
    niveles,
    serviciosConfigurados: validas.map((c) => c.serviceName),
  };
}

/** «subresultado» → «Subresultado», «call_type» → «Call type». */
export function etiquetaColumna(columna: string): string {
  const t = columna.replace(/^ao_/, "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function claveConfigs(configs: ConfigResultados[]): string {
  return configs
    .map((c) => `${c.serviceName}=${c.tablaAo}:${c.columnas.join("+")}:${[...c.codigosNoValidos].sort().join("+")}`)
    .sort()
    .join("|");
}

/** Resultados de actividad de un rango (Supervisión → Resultados). */
export async function resultadosActividadRango(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  configs: ConfigResultados[],
  objetivos: ObjetivoResultados[],
): Promise<ResultadoResultados> {
  let base: BaseResultados;
  if (campanias && campanias.length === 0) {
    // Lista vacía (p. ej. un tipo de campaña sin campañas en el cliente): en
    // filtroCampanias vacío significa «todas», así que no se consulta nada
    base = { filas: [], textos: {}, servicioDeCampania: {}, niveles: {}, serviciosConfigurados: [] };
  } else if (esMock()) {
    const tablas = await tablasResultados();
    const validas = configs.filter((c) => configValida(c, tablas));
    const mapa = mapaCampaniaServicio(await listaServicios());
    base = montarBase(
      mockBaseResultados(desdeISO, hastaISO, campanias, validas),
      mockTextosResultados(),
      mapa,
      validas,
    );
  } else {
    // La configuración entra en la clave: al cambiarla en el admin, se recalcula
    base = await conCache(
      `rdb:resultados:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}:${claveConfigs(configs)}`,
      ttlSegunRango(hastaISO),
      () => baseResultadosCore(desdeISO, hastaISO, campanias, configs),
    );
  }
  return calcularResultados(base, objetivos, desdeISO, hastaISO);
}
