import { conCache, TTL, ttlSegunRango } from "../cache";
import {
  mockCierresPorDia,
  mockDemandaPorFranja,
  mockEstadoListas,
  mockFestivosServicio,
  mockHorariosServicio,
  mockIslasLogadoUsuario,
  mockIslasSesionUsuario,
  mockLlamadasPorDevolverHoy,
  mockUsuariosAgente,
} from "../mock";
import { codigoAltaAgente, sqlAltaCallback } from "./callback";
import { esMock, obtenerPool, sql } from "../pool";
import type {
  CierresDia,
  DemandaFranja,
  EstadoLista,
  FestivoServicio,
  HorarioServicio,
  IslaSesion,
  LlamadasPorDevolver,
  UsuarioAgenteRdb,
} from "../types";
import { hoyISO } from "@/lib/fechas";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango, sqlJoinGlobal, sqlLlamada } from "./util";

// ============================================================
// Capa RDBv2 del módulo «Planificación de turnos».
//
// Todo va parametrizado, con rango de fechas explícito sobre la columna
// indexada y con las décimas de segundo convertidas dentro del SQL. Se
// excluyen las campañas Test_* e IVR_*. El SQL Server es anterior a 2017:
// nada de STRING_AGG.
//
// Estas consultas NO las usa el tablero en caliente: alimentan los agregados
// propios de SQLite (scripts/planificacion-agregados.ts), que son los que lee
// el motor.
// ============================================================

/** Filtro común: fuera las campañas de pruebas y las IVR (automáticas). */
const SIN_TEST_NI_IVR = `c.shortname NOT LIKE 'IVR[_]%' AND c.shortname NOT LIKE 'Test[_]%'`;

/**
 * Usuarios humanos con nº de agente: <PREFIJO>_<nnnn>[_SUFIJO] (GH_0851,
 * GH_1067_BD_LX, Soc_Fed_0892...). El parseo prefijo/nº/sufijo va en TS
 * (planificacion/usuarios.ts). Los usuarios sin nº (Angeles, TM_*...) quedan
 * fuera. La última sesión NO se pide aquí: una subconsulta por usuario sobre
 * ag_in_cp_log tardó 66 s (medido 30/09/2026); sale de agg_sesion_usuario.
 */
export async function usuariosAgente(): Promise<UsuarioAgenteRdb[]> {
  if (esMock()) return mockUsuariosAgente();
  return conCache("rdb:plan:usuarios", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      SELECT RTRIM(u.usr_name) AS usrName, u.code AS altitudeCode, RTRIM(u.fullname) AS fullname
      FROM ph_e_user u
      WHERE u.type = 1
        AND u.usr_name LIKE '%[_][0-9][0-9][0-9][0-9]%'
      ORDER BY u.usr_name;
    `);
    return r.recordset as UsuarioAgenteRdb[];
  });
}

/**
 * Islas de sesión (op_type 0) por USUARIO: la unión de sus intervalos, igual
 * que horasAgenteReales pero partiendo por usuario en vez de sumar. Como cada
 * agente tiene un usuario por cliente, esto da horas por cliente sin el ×13
 * de sumar por campaña (regla 11). Duración NULL = sesión abierta, cerrada en
 * GETDATE() acotado al rango (regla 10.b).
 *
 * Cada isla se parte en trozos de un día (segundos desde las 00:00). Las
 * partes que caen fuera del rango pedido se descartan: el lote siguiente no
 * las verá, porque filtra por start_time (mismo criterio que
 * horasAgenteReales). En esta instalación no hay sesiones que crucen la
 * medianoche.
 *
 * Los segundos salen del SQL con DATEDIFF(SECOND, 00:00, x), así que
 * fin − inicio es exactamente DATEDIFF(SECOND, ini, fin): la suma de un día
 * cuadra al segundo con horasAgenteReales.
 */
export async function islasSesionUsuario(
  desdeISO: string,
  hastaISO: string,
  usuarios?: string[],
): Promise<IslaSesion[]> {
  if (esMock()) return mockIslasSesionUsuario(desdeISO, hastaISO, usuarios);
  const claveCache = `rdb:plan:islas:${desdeISO}:${hastaISO}:${claveCampanias(usuarios)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    let filtroUsuarios = "";
    if (usuarios && usuarios.length > 0) {
      const marcadores = usuarios.map((u, i) => {
        request.input(`usr${i}`, sql.VarChar(50), u);
        return `@usr${i}`;
      });
      filtroUsuarios = ` AND u.usr_name IN (${marcadores.join(", ")})`;
    }

    const r = await request.query(`
      -- Unión de intervalos de sesión (op_type 0) por usuario
      WITH base AS (
          SELECT l.agent AS agente, l.start_time AS ini,
                 ${sqlFinIntervalo("l")} AS fin
          FROM ag_in_cp_log l
          INNER JOIN ph_e_user   u ON l.agent = u.code AND u.type = 1
          INNER JOIN ph_campaign c ON l.campaign = c.code
          WHERE l.op_type = 0
            AND l.start_time >= @desde AND l.start_time < @hastaExcl${filtroUsuarios}
      ),
      ${sqlCtesIslas("agente")}
      SELECT RTRIM(u.usr_name)                                                AS usrName,
             CONVERT(varchar(10), i.ini, 23)                                  AS fechaIni,
             DATEDIFF(SECOND, CAST(CAST(i.ini AS date) AS datetime), i.ini)   AS iniSeg,
             CONVERT(varchar(10), i.fin, 23)                                  AS fechaFin,
             DATEDIFF(SECOND, CAST(CAST(i.fin AS date) AS datetime), i.fin)   AS finSeg
      FROM islas i
      INNER JOIN ph_e_user u ON u.code = i.agente
      ORDER BY usrName, i.ini;
    `);

    return partirPorDia(r.recordset as FilaIsla[], hastaISO);
  });
}

type FilaIsla = { usrName: string; fechaIni: string; iniSeg: number; fechaFin: string; finSeg: number };

/**
 * Islas con fecha y segundos de inicio y fin → trozos por día. Si una isla
 * cruza la medianoche, un trozo hasta las 24:00 y otro desde las 00:00 del
 * día del fin (una sesión nunca dura más de un día entero).
 */
function partirPorDia(filas: readonly FilaIsla[], hastaISO: string): IslaSesion[] {
  const partes: IslaSesion[] = [];
  for (const f of filas) {
    if (f.fechaIni === f.fechaFin) {
      if (f.finSeg > f.iniSeg) partes.push({ fecha: f.fechaIni, usrName: f.usrName, inicioSeg: f.iniSeg, finSeg: f.finSeg });
      continue;
    }
    if (f.iniSeg < 86_400) partes.push({ fecha: f.fechaIni, usrName: f.usrName, inicioSeg: f.iniSeg, finSeg: 86_400 });
    if (f.finSeg > 0 && f.fechaFin <= hastaISO) {
      partes.push({ fecha: f.fechaFin, usrName: f.usrName, inicioSeg: 0, finSeg: f.finSeg });
    }
  }
  return partes;
}

/**
 * Tiempo LOGADO por usuario y día: unión de sus sesiones de `user_log`
 * (login → logout), haya o no campaña abierta. Es la fuente del seguimiento
 * (adherencia, saldo y cierre de mes) y la misma que factura operaciones
 * (regla 16): agg_sesion_usuario (ag_in_cp_log op 0) solo ve el tiempo con
 * campaña abierta. Solo agentes humanos (type 1: los puertos IVR dejan
 * sesiones sin cerrar durante semanas). duration NULL = sesión de hoy en
 * curso, cerrada en GETDATE() sin salirse del rango (regla 10.b). Con hoy
 * dentro, cache de 60 s (vista «Hoy» y alertas); días cerrados, ttlSegunRango.
 */
export async function islasLogadoUsuario(
  desdeISO: string,
  hastaISO: string,
  usuarios?: string[],
): Promise<IslaSesion[]> {
  if (esMock()) return mockIslasLogadoUsuario(desdeISO, hastaISO, usuarios);
  const ttl = hastaISO >= hoyISO() ? TTL.supervision : ttlSegunRango(hastaISO);
  const claveCache = `rdb:plan:logado:${desdeISO}:${hastaISO}:${claveCampanias(usuarios)}`;
  return conCache(claveCache, ttl, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    let filtroUsuarios = "";
    if (usuarios && usuarios.length > 0) {
      const marcadores = usuarios.map((u, i) => {
        request.input(`usr${i}`, sql.VarChar(50), u);
        return `@usr${i}`;
      });
      filtroUsuarios = ` AND u.usr_name IN (${marcadores.join(", ")})`;
    }

    const r = await request.query(`
      -- Unión de las sesiones de user_log por usuario (duration en DÉCIMAS de segundo)
      WITH base AS (
          SELECT l.e_user AS usuario, l.start_time AS ini,
                 ${sqlFinIntervalo("l")} AS fin
          FROM user_log l
          INNER JOIN ph_e_user u ON u.code = l.e_user AND u.type = 1
          WHERE l.start_time >= @desde AND l.start_time < @hastaExcl${filtroUsuarios}
      ),
      ${sqlCtesIslas("usuario")}
      SELECT RTRIM(u.usr_name)                                                AS usrName,
             CONVERT(varchar(10), i.ini, 23)                                  AS fechaIni,
             DATEDIFF(SECOND, CAST(CAST(i.ini AS date) AS datetime), i.ini)   AS iniSeg,
             CONVERT(varchar(10), i.fin, 23)                                  AS fechaFin,
             DATEDIFF(SECOND, CAST(CAST(i.fin AS date) AS datetime), i.fin)   AS finSeg
      FROM islas i
      INNER JOIN ph_e_user u ON u.code = i.usuario
      ORDER BY usrName, i.ini;
    `);
    return partirPorDia(r.recordset as FilaIsla[], hastaISO);
  });
}

/**
 * Demanda por servicio y franja de 30 min (generaliza h1.sql del prototipo).
 * Entrantes = hilos origin 1 (todas las terminaciones); rechazadas =
 * termination_state 7 (la llamada no encontró a nadie logado). La gestión de
 * entrantes se suma en SEGUNDOS (décimas / 10.0) solo de humanos y sin los
 * hilos de `maxSeg` o más (CEFF tiene duraciones imposibles).
 * Salientes (23/10/2026, la tasa de contacto del motor): intentos CON NÚMERO
 * y con un resultado que cuenta, como la contactabilidad de Supervisión →
 * Salientes. Antes entraban las preparaciones de llamada manual (regla 6,
 * «gestionadas» sin número) arriba y abajo de la tasa, y la inflaban.
 */
export async function demandaPorFranja(
  desdeISO: string,
  hastaISO: string,
  maxSeg: number,
): Promise<DemandaFranja[]> {
  if (esMock()) return mockDemandaPorFranja(desdeISO, hastaISO);
  const claveCache = `rdb:plan:demanda:${desdeISO}:${hastaISO}:${maxSeg}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    request.input("maxSeg", sql.Int, maxSeg);

    const r = await request.query(`
      -- Un único servicio por campaña (cp_general_cfg es 1:N)
      WITH cs AS (
          SELECT campaign, MIN(service) AS service
          FROM cp_general_cfg
          GROUP BY campaign
      ),
      hilos AS (
          SELECT CONVERT(varchar(10), t.start_time, 23) AS fecha,
                 RTRIM(s.name) AS servicio,
                 DATEPART(HOUR, t.start_time) * 60 + (DATEPART(MINUTE, t.start_time) / 30) * 30 AS inicioMin,
                 t.origin, t.termination_state, t.duration, u.type AS tipoUsuario,
                 -- Intento de salida que cuenta: con número y con resultado
                 CASE WHEN t.origin = 2 AND ${sqlLlamada()}
                           AND t.termination_state IS NOT NULL AND t.termination_state >= 0
                           AND t.termination_state NOT IN (6, 11, 17, 18)
                      THEN 1 ELSE 0 END AS intento
          FROM itr_thread t
          INNER JOIN ph_campaign c  ON t.campaign = c.code
          INNER JOIN cs             ON cs.campaign = c.code
          INNER JOIN ph_service  s  ON s.code = cs.service
          LEFT  JOIN ph_e_user   u  ON u.code = t.e_user
          ${sqlJoinGlobal()}
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND ${SIN_TEST_NI_IVR}
            AND s.name NOT LIKE 'Test[_]%'
      )
      SELECT fecha, servicio, inicioMin,
             SUM(CASE WHEN origin = 1 THEN 1 ELSE 0 END)                                AS entrantes,
             SUM(CASE WHEN origin = 1 AND termination_state = 1 THEN 1 ELSE 0 END)      AS entrantesAtendidas,
             SUM(CASE WHEN origin = 1 AND termination_state = 6 THEN 1 ELSE 0 END)      AS entrantesAbandonadas,
             SUM(CASE WHEN origin = 1 AND termination_state = 7 THEN 1 ELSE 0 END)      AS entrantesRechazadas,
             SUM(intento)                                                               AS salientes,
             SUM(CASE WHEN intento = 1 AND termination_state = 1 THEN 1 ELSE 0 END)     AS salientesAtendidas,
             -- décimas → segundos; CAST a BIGINT para no desbordar al sumar
             SUM(CASE WHEN origin = 1 AND termination_state = 1 AND tipoUsuario = 1
                           AND duration < @maxSeg * 10
                      THEN CAST(duration AS BIGINT) ELSE 0 END) / 10.0                  AS segGestionEntrantes
      FROM hilos
      GROUP BY fecha, servicio, inicioMin;
    `);
    return r.recordset as DemandaFranja[];
  });
}

/**
 * Contactos que dejan de estar vivos (activity.status fuera de 0/1/2),
 * fechados por su ÚLTIMO event_moment. Mismo patrón que los leads de
 * facturacion.ts (regla 13): MAX por actividad dentro del rango y comparación
 * con el MAX absoluto, nunca NOT EXISTS sobre lo posterior al rango (40 s
 * frente a 0,2 s). Como mira el estado ACTUAL, un contacto reabierto después
 * deja de contar en su día antiguo.
 */
export async function cierresPorDia(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<CierresDia[]> {
  if (esMock()) return mockCierresPorDia(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:plan:cierres:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      WITH ult AS (
          SELECT h.activity, MAX(h.event_moment) AS cierre
          FROM activity_history h
          WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
          GROUP BY h.activity
      )
      SELECT CONVERT(varchar(10), ult.cierre, 23) AS fecha,
             RTRIM(c.shortname)                   AS campania,
             COUNT(*)                             AS cierres
      FROM ult
      INNER JOIN activity    a ON a.code = ult.activity AND a.status NOT IN (0, 1, 2)
      INNER JOIN ph_campaign c ON a.campaign = c.code
      WHERE ult.cierre = (
          SELECT MAX(h3.event_moment)
          FROM activity_history h3
          WHERE h3.activity = ult.activity
      )
        AND ${SIN_TEST_NI_IVR}${filtro}
      GROUP BY CONVERT(varchar(10), ult.cierre, 23), RTRIM(c.shortname);
    `);
    return r.recordset as CierresDia[];
  });
}

/**
 * Estado ACTUAL de las listas salientes cuyas campañas casan con alguno de
 * los patrones LIKE (los de plan_clientes.campanias). Vivos = status 0/1/2
 * (por llamar o reprogramados); sin tocar = además business_status 1.
 * activity no tiene fecha útil (moment es la programada): el filtro que acota
 * es el de campaña. Sin cache: es la foto nocturna.
 */
export async function estadoListas(patrones: string[]): Promise<EstadoLista[]> {
  if (patrones.length === 0) return [];
  if (esMock()) return mockEstadoListas(patrones);
  const pool = await obtenerPool();
  const request = pool.request();
  const condiciones = patrones.map((p, i) => {
    request.input(`pat${i}`, sql.VarChar(50), p);
    return `c.shortname LIKE @pat${i}`;
  });
  const r = await request.query(`
    SELECT RTRIM(c.shortname)                                                   AS campania,
           COUNT(*)                                                             AS total,
           SUM(CASE WHEN a.status IN (0, 1, 2) THEN 1 ELSE 0 END)               AS vivos,
           SUM(CASE WHEN a.status IN (0, 1, 2) AND a.business_status = 1
                    THEN 1 ELSE 0 END)                                          AS vivosSinTocar
    FROM activity a
    INNER JOIN ph_campaign c ON c.code = a.campaign
    WHERE (${condiciones.join(" OR ")})
      AND ${SIN_TEST_NI_IVR}
    GROUP BY RTRIM(c.shortname)
    ORDER BY campania;
  `);
  return r.recordset as EstadoLista[];
}

/**
 * festivos_servicio y horarios_servicio ENTERAS (tablas propias que mantiene
 * supervisión y lee también un Power BI; 63 y 5 filas el 21/10/2026), SIN
 * caché: es la copia a SQLite de la planificación (planificacion/calendarios.ts),
 * que se hace al generar un borrador o a mano. El dashboard NUNCA escribe en
 * ellas. Verificado 30/09/2026: TipoDia solo vale 'FESTIVO' y
 * ServicioDirectorio es 'GrupoHuertas' (= ph_service.name) y 'GrupoAvolo' (en
 * ph_service es 'Avolo'): cada cliente guarda su nombre de calendario. Las
 * horas se convierten a texto HH:MM en el SQL para no pasar por fechas del
 * driver.
 */
export async function calendariosAltitude(): Promise<{ festivos: FestivoServicio[]; horarios: HorarioServicio[] }> {
  if (esMock()) return { festivos: mockFestivosServicio("2000-01-01", "2100-12-31").festivos, horarios: mockHorariosServicio() };
  const pool = await obtenerPool();
  const r = await pool.request().query(`
    SELECT CONVERT(varchar(10), Fecha, 23) AS fecha,
           RTRIM(ServicioDirectorio)       AS servicio,
           RTRIM(TipoDia)                  AS tipo
    FROM festivos_servicio
    WHERE Fecha IS NOT NULL AND ServicioDirectorio IS NOT NULL
    ORDER BY Fecha, ServicioDirectorio;

    SELECT RTRIM(Servicio) AS servicio,
           CAST(Lunes AS int) AS l, CAST(Martes AS int) AS m, CAST(Miercoles AS int) AS x,
           CAST(Jueves AS int) AS j, CAST(Viernes AS int) AS v, CAST(Sabado AS int) AS s,
           CAST(Domingo AS int) AS d,
           CONVERT(varchar(5), Entrada, 108) AS entrada,
           CONVERT(varchar(5), Salida, 108)  AS salida,
           CONVERT(varchar(10), Desde, 23)   AS desde,
           CONVERT(varchar(10), Hasta, 23)   AS hasta
    FROM horarios_servicio
    WHERE Servicio IS NOT NULL AND Entrada IS NOT NULL AND Salida IS NOT NULL
      AND Desde IS NOT NULL AND Hasta IS NOT NULL
    ORDER BY Servicio, Desde, Entrada;
  `);
  type Fila = {
    servicio: string; l: number; m: number; x: number; j: number; v: number; s: number; d: number;
    entrada: string; salida: string; desde: string; hasta: string;
  };
  const [festivos, horarios] = r.recordsets as unknown as [FestivoServicio[], Fila[]];
  const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return {
    festivos,
    horarios: horarios.map((f) => ({
      servicio: f.servicio,
      dias: [f.l, f.m, f.x, f.j, f.v, f.s, f.d].map((b) => b === 1),
      entradaMin: aMin(f.entrada),
      salidaMin: aMin(f.salida),
      desde: f.desde,
      hasta: f.hasta,
    })),
  };
}

/**
 * Entrantes de HOY (origin 1) perdidas en las campañas dadas y que aún nadie
 * ha devuelto. Es la alerta de los clientes «a demanda» (Ávolo): si no hay
 * nadie logado con su usuario, la campaña rechaza la llamada (estado 7) y
 * alguien con ese usuario se conecta luego a devolverla. Cache de 60 s, como
 * Supervisión.
 *
 * Una perdida deja de estar pendiente si, en la misma llamada, la cogió un
 * agente, o si después un agente (de cualquier campaña) llamó a ese número
 * con el resultado que fuera (dar ocupado ya cuenta como devuelta, decidido
 * con Christian el 16/10/2026) o atendió otra entrante suya. El número se
 * cruza por sus 9 últimos dígitos: la saliente lleva el account code delante
 * en `to_address` (1217614805750 → 614805750), como en la tarificación. Las
 * perdidas sin un número de 9 cifras no se pueden devolver y no cuentan.
 * Tampoco las de otro país (06/11/2026): del 01/09 al 06/11 hubo 2 (0049… y
 * 0036…) y no se devolvió ninguna, frente a 991 de 1.125 españolas; la
 * alemana del 05/11 dejó la alerta encendida todo el día. Español = 9 cifras,
 * con o sin 34, 0034 o +34 delante.
 * Tampoco cuenta la perdida de un número al que un agente YA había llamado
 * ese día (06/11/2026, «está todo llamado», dicen las supervisoras): es el
 * cliente que nos devuelve la llamada y entra por el IVR cuando ya no hay
 * nadie conectado (CEFF 06/11: llamada a las 10:42, devolución del cliente a
 * las 10:44). Del 01/09 al 06/11 fueron 38 de las 147 que quedaban sin
 * devolver en Ávolo y 27 de 33 en CEFF; a casi ninguna se la volvió a llamar
 * en los días siguientes (5 y 14).
 * Y solo cuenta si el CONTACTO que se creó para devolverla sigue PENDIENTE
 * (06/11/2026, a petición de supervisión): tras cada perdida, el IVR da de
 * alta un contacto en la campaña con ese teléfono (AgentCreation, entre 13 y
 * 92 s después; el alta no guarda la llamada, así que se casa por campaña,
 * teléfono y los 10 minutos siguientes). Es la lista que trabajan las
 * supervisoras: los que no hay que llamar los cierran («Terminado») sin
 * llamar. Pendiente = `activity.status` 0, 1 o 2 (los «vivos» de
 * `estadoListas`). El teléfono del contacto se lee de
 * `activity.resch_phone_value` (10/11/2026): el perfil (`ph_contact_profile`)
 * se crea SIN teléfono y se rellena más tarde, cuando ya la han devuelto. Con
 * el del perfil, la perdida nunca casaba mientras estaba pendiente y la
 * alerta no salió en todo el 09/11 (unos 12 tramos sin nadie con Av_); al
 * revisarlo a posteriori sí casaba. Del 01/10 al 09/11, 481 de las 605
 * perdidas de Ávolo casan con su contacto así (449 por el perfil, y todas
 * ellas también así); las otras no salen en esa lista y tampoco aquí.
 * Se cuentan NÚMEROS, no hilos: quien llama tres veces se devuelve una vez.
 * Antes contaba todas las perdidas del día aunque ya estuvieran devueltas
 * (16/10/2026: 9 «sin atender», todas devueltas).
 */
export async function llamadasPorDevolverHoy(campanias: string[]): Promise<LlamadasPorDevolver> {
  // Sin campañas no hay nada que vigilar (y el filtro vacío lo abriría a todas)
  if (campanias.length === 0) return { porDevolver: 0, primera: null, ultima: null, hilos: [] };
  if (esMock()) return mockLlamadasPorDevolverHoy(campanias);
  return conCache(`rdb:plan:porDevolver:${claveCampanias(campanias)}`, TTL.supervision, async () => {
    const alta = await codigoAltaAgente();
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    request.input("alta", sql.Int, alta);
    const filtro = filtroCampanias(request, campanias, "c.shortname");
    const r = await request.query(`
      WITH perdidas AS (
          -- Entrantes de hoy en las campañas del cliente que no acabaron atendidas
          SELECT t.code, t.itr_global, t.campaign, t.start_time, RTRIM(g.from_address) AS origen,
                 RIGHT(RTRIM(g.from_address), 9) AS numero
          FROM itr_thread t
          INNER JOIN ph_campaign c ON t.campaign = c.code
          INNER JOIN itr_global g ON g.code = t.itr_global
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND t.origin = 1 AND t.termination_state <> 1${filtro}
      ),
      agente AS (
          -- Lo que hicieron hoy los agentes humanos, en cualquier campaña:
          -- salientes con cualquier resultado y entrantes atendidas
          SELECT t.itr_global, t.start_time, t.origin,
                 RIGHT(RTRIM(CASE WHEN t.origin = 2 THEN g.to_address ELSE g.from_address END), 9) AS numero
          FROM itr_thread t
          INNER JOIN ph_e_user u ON u.code = t.e_user AND u.type = 1
          INNER JOIN itr_global g ON g.code = t.itr_global
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND (t.origin = 2 OR (t.origin = 1 AND t.termination_state = 1))
      ),
      contactos AS (
          -- Fichas de callback dadas de alta hoy para devolver una perdida,
          -- aún pendientes (la misma definición que el callback de
          -- Supervisión, sqlAltaCallback: altas del IVR; 12/11/2026, del 01/10
          -- al 12/11 casan las mismas 538 perdidas que con cualquier alta).
          -- El teléfono, de resch_phone_value: el del perfil llega vacío y se
          -- rellena después (10/11/2026)
          SELECT a.campaign, h.event_moment AS alta,
                 RIGHT(RTRIM(a.resch_phone_value), 9) AS numero
          FROM activity_history h
          INNER JOIN activity a ON a.code = h.activity AND a.status IN (0, 1, 2)
          WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
            AND ${sqlAltaCallback("h")}
      )
      -- Una fila por número pendiente; «hilo» = su primera perdida sin
      -- devolver (identifica la llamada en la campana sin guardar el teléfono)
      SELECT CAST(MIN(p.code) AS varchar(20))             AS hilo,
             CONVERT(varchar(5), MIN(p.start_time), 108) AS primera,
             CONVERT(varchar(5), MAX(p.start_time), 108) AS ultima
      FROM perdidas p
      WHERE LEN(p.numero) = 9 AND p.numero NOT LIKE '%[^0-9]%'
        AND (LEN(p.origen) = 9 OR p.origen LIKE '34_________' OR p.origen LIKE '0034_________'
             OR p.origen LIKE '+34_________')
        AND NOT EXISTS (SELECT 1 FROM agente a WHERE a.itr_global = p.itr_global)
        -- Devuelta después, o llamada nuestra de antes que el cliente devuelve
        AND NOT EXISTS (SELECT 1 FROM agente a
                        WHERE a.numero = p.numero AND (a.start_time >= p.start_time OR a.origin = 2))
        -- Con su contacto para devolverla aún pendiente (si lo cierran sin llamar, ya no)
        AND EXISTS (SELECT 1 FROM contactos k
                    WHERE k.campaign = p.campaign AND k.numero = p.numero
                      AND k.alta >= p.start_time AND k.alta < DATEADD(MINUTE, 10, p.start_time))
      GROUP BY p.numero;
    `);
    const filas = r.recordset as { hilo: string; primera: string; ultima: string }[];
    const horas = filas.flatMap((f) => [f.primera, f.ultima]).sort();
    return {
      porDevolver: filas.length,
      primera: horas[0] ?? null,
      ultima: horas.at(-1) ?? null,
      hilos: filas.map((f) => f.hilo).sort(),
    };
  });
}
