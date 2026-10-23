import type { Request } from "mssql";
import { conCache, TTL, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import {
  mockBaseResultados,
  mockContactosExport,
  mockDirectoriosServicio,
  mockFiltrarPorCampo,
  mockTablasResultados,
  mockTextosResultados,
  mockValoresCampo,
  mockValoresColumnaResultados,
} from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type {
  BaseResultados,
  CategoriaCierre,
  DirectorioServicio,
  FilaBaseResultados,
  HorasResultados,
  TablaResultados,
  ValorColumnaResultado,
} from "../types";
import {
  calcularResultados,
  MAX_NIVELES,
  MAX_VALORES_CAMPO,
  PATRON_IDENTIFICADOR_SQL,
  patronContiene,
  type CampoContacto,
  type FiltroCampo,
  type ObjetivoResultados,
  type ResultadoResultados,
} from "@/lib/resultados-actividad";
import type { ColumnaExport, ContactoExport } from "@/lib/export-contactos";
import { claveCampanias, filtroCampanias, limitesRango, sqlJoinGlobal, sqlLlamada } from "./util";
import { listaServicios, mapaCampaniaServicio } from "./servicios";
import { baseRatiosRango } from "./ratios-exito";

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
const PATRON_IDENTIFICADOR = PATRON_IDENTIFICADOR_SQL;

/** Días de sesiones de script con los que se averigua el directorio de cada servicio. */
const DIAS_DIRECTORIO = 90;

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

/**
 * Directorios de contactos de cada servicio con sus columnas de texto: la
 * LISTA BLANCA del filtro por campo del contacto (nada que no salga de aquí
 * entra en el SQL). El directorio de un servicio es el de los contactos de
 * sus sesiones de script de los últimos 90 días, y su tabla la da
 * table_schema.directory (el nombre no siempre se deduce: el de GH,
 * dirgrupohuertas, es dir_1616009371). Columnas de texto de hasta 500
 * caracteres: fuera los indexed_field_* de 4.000. Verificado 19/10/2026.
 */
export async function directoriosServicio(): Promise<DirectorioServicio[]> {
  if (esMock()) return mockDirectoriosServicio();
  return conCache("rdb:resultados:directorios", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    request.input("dias", sql.Int, DIAS_DIRECTORIO);
    const r = await request.query(`
      WITH dirs AS (
          SELECT DISTINCT cfg.service, s.directory
          FROM script_session s
          INNER JOIN cp_general_cfg cfg ON cfg.campaign = s.campaign
          WHERE s.start_time >= DATEADD(day, -@dias, GETDATE())
      )
      SELECT RTRIM(sv.name) AS servicio, RTRIM(d.name) AS directorio,
             RTRIM(ts.table_name) AS tabla, col.COLUMN_NAME AS columna
      FROM dirs
      INNER JOIN ph_service   sv ON sv.code = dirs.service
      INNER JOIN ph_directory d  ON d.code = dirs.directory
      INNER JOIN table_schema ts ON ts.directory = dirs.directory AND ts.ts_type = 4
      INNER JOIN INFORMATION_SCHEMA.COLUMNS col ON col.TABLE_NAME = RTRIM(ts.table_name)
      WHERE sv.name NOT LIKE 'Test[_]%'
        AND col.DATA_TYPE IN ('varchar', 'nvarchar', 'char', 'nchar')
        AND col.CHARACTER_MAXIMUM_LENGTH BETWEEN 1 AND 500
      ORDER BY sv.name, ts.table_name, col.ORDINAL_POSITION;
    `);
    const mapa = new Map<string, DirectorioServicio>();
    for (const f of r.recordset as { servicio: string; directorio: string; tabla: string; columna: string }[]) {
      const clave = `${f.servicio}|${f.tabla}`;
      const d = mapa.get(clave) ?? { servicio: f.servicio, directorio: f.directorio, tabla: f.tabla, columnas: [] };
      d.columnas.push(f.columna);
      mapa.set(clave, d);
    }
    return [...mapa.values()];
  });
}

/** ¿El campo es una columna de texto de un directorio del servicio? */
export function campoContactoValido(
  servicio: string,
  campo: CampoContacto,
  directorios: DirectorioServicio[],
): boolean {
  const d = directorios.find((x) => x.servicio === servicio && x.tabla === campo.tabla);
  return (
    !!d &&
    PATRON_IDENTIFICADOR.test(campo.tabla) &&
    PATRON_IDENTIFICADOR.test(campo.columna) &&
    d.columnas.includes(campo.columna)
  );
}

/** Campo del contacto de un servicio y el filtro elegido (null: solo la lista de valores). */
export interface CampoResultados {
  servicio: string;
  campo: CampoContacto;
  filtro: FiltroCampo | null;
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

/** Opciones del paso común de Resultados y del CSV de contactos finalizados. */
interface OpcionesCerrados {
  desde: Date;
  hastaExcl: Date;
  campanias: string[] | undefined;
  /** Estados «sin tocar» (familias de ContactBusinessStatus). */
  sinTocar: number[];
  /** Dato del contacto ya validado contra la lista blanca, o null. */
  campo: CampoResultados | null;
  /** Con la lista de valores del dato (3a), antes de filtrar. */
  conValores: boolean;
}

/**
 * Paso común de Resultados y del CSV de contactos finalizados: crea #cerr
 * (contactos cerrados en el rango, de las campañas pedidas y, si hay filtro,
 * con ese valor en el dato del contacto) y #ses (la última sesión de agente
 * de cada uno). Añade los parámetros a `request` y devuelve el SQL y el
 * fragmento de la lista «sin tocar» para el WHERE de quien lo use.
 */
function sqlCerrados(request: Request, o: OpcionesCerrados): { sql: string; sinTocar: string } {
  const desdeSesiones = new Date(o.desde);
  desdeSesiones.setDate(desdeSesiones.getDate() - DIAS_SESION);
  request.input("desde", sql.DateTime, o.desde);
  request.input("hastaExcl", sql.DateTime, o.hastaExcl);
  request.input("desdeSes", sql.DateTime, desdeSesiones);
  request.input("diasSesion", sql.Int, DIAS_SESION);
  const filtro = filtroCampanias(request, o.campanias, "c.shortname");
  const sinTocar = listaParametros(request, "st", o.sinTocar);

  // Dato del contacto: lista de valores (antes de filtrar) y filtro. La tabla
  // y la columna vienen de la lista blanca (directoriosServicio), entre
  // corchetes; el texto buscado va SIEMPRE como parámetro.
  let sqlCampo = "";
  const campo = o.campo;
  if (campo) {
    const col = `d.[${campo.campo.columna}]`;
    const dir = `[${campo.campo.tabla}]`;
    if (o.conValores) {
      request.input("maxValores", sql.Int, MAX_VALORES_CAMPO);
      sqlCampo = `
    -- 3a) Valores del campo con sus finalizados (tipificados), ANTES del filtro:
    --     las sugerencias del autocompletado. Vacío o solo espacios = sin valor.
    --     El CASE (y no un NOT IN) aguanta la lista de «sin tocar» vacía.
    SELECT TOP (@maxValores) NULLIF(LTRIM(RTRIM(${col})), '') AS valor, COUNT(*) AS finalizados
    FROM #cerr k
    INNER JOIN #ses s ON s.contact = k.activity
    LEFT JOIN ${dir} d ON d.easycode = k.contact_profile
    WHERE CASE WHEN k.estado IS NULL OR k.estado IN (${sinTocar}) THEN 0 ELSE 1 END = 1
    GROUP BY NULLIF(LTRIM(RTRIM(${col})), '')
    ORDER BY finalizados DESC;`;
    }
    const f = campo.filtro;
    if (f?.modo === "vacio") {
      sqlCampo += `
    -- 3b) Filtro: solo los contactos SIN valor en el campo
    DELETE k FROM #cerr k
    WHERE EXISTS (SELECT 1 FROM ${dir} d
                  WHERE d.easycode = k.contact_profile AND NULLIF(LTRIM(RTRIM(${col})), '') IS NOT NULL);`;
    } else if (f) {
      // Intercalación CI_AI: no distingue mayúsculas ni tildes
      request.input("campoValor", sql.VarChar(210), f.modo === "contiene" ? patronContiene(f.valor) : f.valor);
      const cond = f.modo === "contiene" ? `${col} LIKE @campoValor` : `LTRIM(RTRIM(${col})) = @campoValor`;
      sqlCampo += `
    -- 3b) Filtro: solo los contactos con ese valor en el campo
    DELETE k FROM #cerr k
    WHERE NOT EXISTS (SELECT 1 FROM ${dir} d WHERE d.easycode = k.contact_profile AND ${cond});`;
    }
  }

  return {
    sinTocar,
    sql: `
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
                        campania varchar(20) NOT NULL, estado smallint NULL,
                        contact_profile int NULL);
    WITH ult AS (
        SELECT h.activity, MAX(h.event_moment) AS cierre
        FROM activity_history h
        WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
        GROUP BY h.activity
    )
    INSERT INTO #cerr (activity, cierre, campania, estado, contact_profile)
    SELECT ult.activity, ult.cierre, RTRIM(c.shortname), a.business_status, a.contact_profile
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
${sqlCampo}
`,
  };
}

async function baseResultadosCore(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  configs: ConfigResultados[],
  campoPedido: CampoResultados | null,
): Promise<BaseResultados> {
  const [tablas, servicios, familias, textos, directorios] = await Promise.all([
    tablasResultados(),
    listaServicios(),
    familiasEstadoContacto(),
    textosResultados(),
    campoPedido ? directoriosServicio() : Promise.resolve([]),
  ]);
  const validas = configs.filter((c) => configValida(c, tablas));
  // Campo del contacto: solo si está en la lista blanca (identificadores)
  const campo =
    campoPedido && campoContactoValido(campoPedido.servicio, campoPedido.campo, directorios)
      ? campoPedido
      : null;

  const pool = await obtenerPool();
  const request = pool.request();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const { sql: cerrados, sinTocar } = sqlCerrados(request, {
    desde,
    hastaExcl,
    campanias,
    sinTocar: familias.sinTocar,
    campo,
    conValores: true,
  });
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

  const r = await request.query(`${cerrados}
    -- 2b) Llamadas a cada contacto de ÉXITO tipificado (21/10/2026): todos
    --     los intentos de SALIDA a ese contacto en los 90 días anteriores a
    --     su cierre, conteste o no, del marcador o del agente. Sin los estados
    --     que tampoco cuentan en la calidad de la base de datos: sin
    --     resultado (NULL, -1), abandonadas (6), redirigidas (11), canceladas
    --     (17) y reencoladas (18), ni las preparaciones de llamada manual
    --     (salientes sin número, 22/10/2026). itr_thread.contact = activity.code.
    IF OBJECT_ID('tempdb..#lla') IS NOT NULL DROP TABLE #lla;
    CREATE TABLE #lla (activity int PRIMARY KEY, llamadas int NOT NULL);
    INSERT INTO #lla (activity, llamadas)
    SELECT k.activity, COUNT(*)
    FROM itr_thread t
    INNER JOIN #cerr k ON k.activity = t.contact
           AND t.start_time <= k.cierre
           AND t.start_time >= DATEADD(day, -@diasSesion, k.cierre)
    INNER JOIN #ses s ON s.contact = k.activity
    ${sqlJoinGlobal()}
    WHERE t.start_time >= @desdeSes AND t.start_time < @hastaExcl
      AND t.origin = 2 AND ${sqlLlamada()}
      AND t.termination_state IS NOT NULL AND t.termination_state >= 0
      AND t.termination_state NOT IN (6, 11, 17, 18)
      AND k.estado IN (${exito})
    GROUP BY k.activity
    -- Como #ses: hash para no caer en bucles anidados sobre itr_thread
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
               CASE WHEN k.estado IN (${exito}) THEN 1 ELSE 0 END AS exito,
               ISNULL(l.llamadas, 0) AS llamadas
        FROM #cerr k
        LEFT JOIN #ses s ON s.contact = k.activity
        LEFT JOIN #lla l ON l.activity = k.activity
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
           COUNT(*) AS contactos, SUM(m.exito) AS exitos, SUM(m.noValido) AS noValidos,
           SUM(m.llamadas) AS llamadasExitos,
           SUM(CASE WHEN m.llamadas > 0 THEN 1 ELSE 0 END) AS exitosConLlamadas
    FROM marcada m
    LEFT JOIN ph_e_user u ON u.code = m.e_user
    GROUP BY m.fecha, m.campania, m.categoria,
             CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.usr_name) END,
             CASE WHEN m.categoria = 'tipificado' THEN RTRIM(u.fullname) END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c1 END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c2 END,
             CASE WHEN m.categoria = 'tipificado' THEN m.c3 END;

    DROP TABLE #lla;
    DROP TABLE #ses;
    DROP TABLE #cerr;
  `);

  // Con campo, el primer resultado es la lista de valores; el último, las filas
  const conjuntos = r.recordsets as unknown as Record<string, unknown>[][];
  const valoresCampo = campo
    ? (conjuntos[0] as { valor: string | null; finalizados: number }[])
    : undefined;
  const filas: FilaBaseResultados[] = (
    conjuntos[conjuntos.length - 1] as {
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
      llamadasExitos: number;
      exitosConLlamadas: number;
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
    llamadasExitos: f.llamadasExitos,
    exitosConLlamadas: f.exitosConLlamadas,
  }));
  return { ...montarBase(filas, textos, mapaCampaniaServicio(servicios), validas), valoresCampo };
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

/**
 * Horas de «finalizados por hora» (21/10/2026), de la misma base que los
 * ratios de éxito (cacheada): logadas por usuario (user_log, regla 16) y
 * script abierto por campaña y por usuario y campaña, sin redondear.
 */
async function horasResultados(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
): Promise<HorasResultados> {
  const base = await baseRatiosRango(desdeISO, hastaISO, campanias);
  const horas: HorasResultados = {
    logadas: Object.fromEntries(base.horasLogadas.map((h) => [h.agente, h.horas])),
    guionCampania: {},
    guionAgenteCampania: {},
    activos: {},
  };
  for (const f of base.filas) {
    horas.activos[f.agente] = f.nombre || f.agente;
    const h = f.guionSeg / 3600;
    horas.guionCampania[f.campania] = (horas.guionCampania[f.campania] ?? 0) + h;
    const clave = `${f.agente}|${f.campania}`;
    horas.guionAgenteCampania[clave] = (horas.guionAgenteCampania[clave] ?? 0) + h;
  }
  return horas;
}

/** Clave de cache del campo y su filtro. */
function claveCampo(c: CampoResultados | null): string {
  if (!c) return "-";
  return `${c.servicio}=${c.campo.tabla}.${c.campo.columna}:${c.filtro ? `${c.filtro.modo}:${c.filtro.valor}` : ""}`;
}

/**
 * Resultados de actividad de un rango (Supervisión → Resultados). Con
 * `campo`, trae además los valores de ese campo del contacto y, si lleva
 * filtro, se queda solo con los contactos que lo cumplen.
 */
export async function resultadosActividadRango(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  configs: ConfigResultados[],
  objetivos: ObjetivoResultados[],
  campo: CampoResultados | null = null,
  /** Prefijo de los usuarios del cliente: solo sus horas cuentan en el total. */
  prefijo: string | null = null,
): Promise<ResultadoResultados> {
  let base: BaseResultados;
  if (campanias && campanias.length === 0) {
    // Lista vacía (p. ej. un tipo de campaña sin campañas en el cliente): en
    // filtroCampanias vacío significa «todas», así que no se consulta nada
    base = {
      filas: [],
      textos: {},
      servicioDeCampania: {},
      niveles: {},
      serviciosConfigurados: [],
      valoresCampo: campo ? [] : undefined,
    };
  } else if (esMock()) {
    const tablas = await tablasResultados();
    const validas = configs.filter((c) => configValida(c, tablas));
    const mapa = mapaCampaniaServicio(await listaServicios());
    const filas = mockBaseResultados(desdeISO, hastaISO, campanias, validas);
    base = {
      ...montarBase(
        campo?.filtro ? mockFiltrarPorCampo(filas, campo.filtro) : filas,
        mockTextosResultados(),
        mapa,
        validas,
      ),
      valoresCampo: campo ? mockValoresCampo(filas) : undefined,
    };
  } else {
    // La configuración entra en la clave: al cambiarla en el admin, se recalcula
    base = await conCache(
      `rdb:resultados:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}:${claveConfigs(configs)}:${claveCampo(campo)}`,
      ttlSegunRango(hastaISO),
      () => baseResultadosCore(desdeISO, hastaISO, campanias, configs, campo),
    );
  }
  if (!campanias || campanias.length > 0) {
    // Si las horas fallan, Resultados sale igual, sin «finalizados por hora»
    try {
      base = { ...base, horas: await horasResultados(desdeISO, hastaISO, campanias) };
    } catch (e) {
      console.error("[resultados] horas para finalizados por hora:", e);
    }
  }
  return calcularResultados(base, objetivos, desdeISO, hastaISO, prefijo);
}

// ============================================================
// CSV de contactos finalizados (Supervisión → Resultados, solo GH; pedido
// el 19/10/2026). Los MISMOS contactos que cuenta la pestaña: el paso común
// (sqlCerrados) con sus filtros y solo los tipificados por un agente. Las
// tablas del cliente salen de los metadatos de Altitude (directorio por
// table_schema.directory, atributos de actividad por ts_type 1, resultados
// por /admin/resultados) y cada columna se comprueba en INFORMATION_SCHEMA
// antes de entrar en el SQL; si una ya no existe, sale vacía.
// ============================================================

/** Tabla de atributos de actividad (act_*, table_schema ts_type 1) de cada servicio. */
async function tablasActividad(): Promise<Map<string, string>> {
  const filas = await conCache("rdb:resultados:tablasAct", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      SELECT RTRIM(sv.name) AS servicio, RTRIM(ts.table_name) AS tabla
      FROM table_schema ts
      INNER JOIN ph_service sv ON sv.code = ts.service
      WHERE ts.ts_type = 1 AND sv.name NOT LIKE 'Test[_]%';
    `);
    return r.recordset as { servicio: string; tabla: string }[];
  });
  return new Map(filas.map((f) => [f.servicio, f.tabla]));
}

/** Columnas de una tabla (INFORMATION_SCHEMA): la lista blanca de sus identificadores. */
async function columnasDeTabla(tabla: string): Promise<string[]> {
  if (!PATRON_IDENTIFICADOR.test(tabla)) return [];
  return conCache(`rdb:resultados:columnas:${tabla}`, TTL.maestros, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    request.input("tabla", sql.VarChar(128), tabla);
    const r = await request.query(`SELECT COLUMN_NAME AS columna FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tabla;`);
    return (r.recordset as { columna: string }[]).map((f) => f.columna);
  });
}

/** Contactos finalizados de un cliente para el CSV, en orden de cierre. */
export async function contactosFinalizadosExport(
  desdeISO: string,
  hastaISO: string,
  servicio: string,
  campanias: string[] | undefined,
  configs: ConfigResultados[],
  campoPedido: CampoResultados | null,
  columnas: readonly ColumnaExport[],
): Promise<{ contactos: ContactoExport[]; textos: Record<number, string> }> {
  if (campanias && campanias.length === 0) return { contactos: [], textos: {} };
  if (esMock()) return { contactos: mockContactosExport(desdeISO, hastaISO, campanias), textos: mockTextosResultados() };

  const [tablas, familias, textos, directorios, actividad] = await Promise.all([
    tablasResultados(),
    familiasEstadoContacto(),
    textosResultados(),
    directoriosServicio(),
    tablasActividad(),
  ]);
  const campo =
    campoPedido && campoContactoValido(campoPedido.servicio, campoPedido.campo, directorios) ? campoPedido : null;
  const config = configs.find((c) => c.serviceName === servicio && configValida(c, tablas));
  const tablaDir = directorios.find((d) => d.servicio === servicio)?.tabla;
  const tablaAct = actividad.get(servicio);
  const [colsDir, colsAct] = await Promise.all([
    tablaDir ? columnasDeTabla(tablaDir) : Promise.resolve([]),
    tablaAct ? columnasDeTabla(tablaAct) : Promise.resolve([]),
  ]);
  const valida = (c: string, lista: string[]) => PATRON_IDENTIFICADOR.test(c) && lista.includes(c);

  // Columnas pedidas → expresiones SQL con alias fijos (dir0, act0…)
  const deTipo = <T extends ColumnaExport["origen"]["tipo"]>(tipo: T) =>
    [...new Set(columnas.flatMap((c) => (c.origen.tipo === tipo && "columna" in c.origen ? [c.origen.columna] : [])))];
  const dirPedidas = deTipo("directorio");
  const actPedidas = deTipo("actividad");
  const perfilPedidas = deTipo("perfil");
  const niveles = config ? config.columnas : [];
  const seleccion = [
    ...perfilPedidas.map((c, i) => `cp.[${c}] AS perfil${i}`),
    ...dirPedidas.map((c, i) => (tablaDir && valida(c, colsDir) ? `d.[${c}] AS dir${i}` : `NULL AS dir${i}`)),
    ...actPedidas.map((c, i) => (tablaAct && valida(c, colsAct) ? `g.[${c}] AS act${i}` : `NULL AS act${i}`)),
    ...niveles.map((c, i) => `ao.[${c}] AS nivel${i}`),
  ];
  const joins = [
    tablaDir && dirPedidas.length > 0 ? `LEFT JOIN [${tablaDir}] d ON d.easycode = k.contact_profile` : "",
    tablaAct && actPedidas.length > 0 ? `LEFT JOIN [${tablaAct}] g ON g.easycode = k.activity` : "",
    config ? `LEFT JOIN [${config.tablaAo}] ao ON ao.easycode = s.outcome` : "",
  ].filter(Boolean);

  const pool = await obtenerPool();
  const request = pool.request();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const { sql: cerrados, sinTocar } = sqlCerrados(request, {
    desde,
    hastaExcl,
    campanias,
    sinTocar: familias.sinTocar,
    campo,
    conValores: false,
  });
  const r = await request.query(`${cerrados}
    -- 3) Solo los finalizados de la pestaña: tipificados por un agente (con
    --    sesión en los 90 días), sin los «sin tocar» ni los administrativos
    SELECT k.campania, k.cierre${seleccion.length > 0 ? `,\n           ${seleccion.join(",\n           ")}` : ""}
    FROM #cerr k
    INNER JOIN #ses s ON s.contact = k.activity
    LEFT JOIN ph_contact_profile cp ON cp.code = k.contact_profile
    ${joins.join("\n    ")}
    WHERE CASE WHEN k.estado IS NULL OR k.estado IN (${sinTocar}) THEN 0 ELSE 1 END = 1
    ORDER BY k.cierre, k.activity;

    DROP TABLE #ses;
    DROP TABLE #cerr;
  `);
  const filas = r.recordsets as unknown as Record<string, unknown>[][];
  const recordset = filas[filas.length - 1] as Record<string, string | number | Date | null>[];
  const contactos: ContactoExport[] = recordset.map((f) => ({
    campania: String(f.campania),
    cierre: f.cierre as Date,
    niveles: niveles.map((_, i) => (f[`nivel${i}`] as number | null) ?? null),
    perfil: Object.fromEntries(perfilPedidas.map((c, i) => [c, (f[`perfil${i}`] as string | null) ?? null])),
    directorio: Object.fromEntries(dirPedidas.map((c, i) => [c, (f[`dir${i}`] as string | number | null) ?? null])),
    actividad: Object.fromEntries(actPedidas.map((c, i) => [c, (f[`act${i}`] as string | number | null) ?? null])),
  }));
  return { contactos, textos };
}
