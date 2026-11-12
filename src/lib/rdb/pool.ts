import sql from "mssql";

// ============================================================
// Pool de conexiones a RDBv2 (SQL Server, SOLO LECTURA).
// Singleton compartido por toda la app y los scripts CLI.
// ============================================================

/** ¿Modo demo sin conexión real? (ver .env.example) */
export function esMock(): boolean {
  return process.env.RDB_MOCK === "1";
}

function configuracion(): sql.config {
  const faltan = ["RDB_HOST", "RDB_USER", "RDB_PASSWORD"].filter((v) => !process.env[v]);
  if (faltan.length > 0) {
    throw new Error(
      `Faltan variables de entorno para RDBv2: ${faltan.join(", ")}. ` +
        `Configura el .env o usa RDB_MOCK=1 para el modo demo.`,
    );
  }
  return {
    server: process.env.RDB_HOST!,
    port: Number(process.env.RDB_PORT ?? 1433),
    database: process.env.RDB_DATABASE ?? "RDBv2",
    user: process.env.RDB_USER!,
    password: process.env.RDB_PASSWORD!,
    options: {
      encrypt: process.env.RDB_ENCRYPT === "true",
      trustServerCertificate: process.env.RDB_TRUST_CERT !== "false",
      // La app solo lee: marcar la intención a nivel de driver
      readOnlyIntent: true,
      // Fechas en HORA LOCAL, sin pasar por UTC. RDBv2 guarda start_time en
      // hora local de España (gmt_start_time es la UTC) y Node corre en la misma
      // zona. Con el valor por defecto (true) el driver convertía los parámetros
      // a UTC: pedir el día 21 a las 00:00 llegaba como el 20 a las 22:00 (1 h en
      // invierno), y al leer, un 10:00 de la BBDD salía como las 12:00, así que
      // la frescura de /admin decía siempre «hace menos de 1 min». Verificado
      // 29/09/2026 contra el servidor (SYSDATETIMEOFFSET = +02:00).
      useUTC: false,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 15_000,
    // Solo cuenta hasta el PRIMER paquete de la respuesta: tedious para el
    // reloj en cuanto llega (connection.js, «request timer is stopped on
    // first data package»). El límite de verdad, de principio a fin, es
    // MAX_MS_CONSULTA (abajo). Se deja como respaldo.
    requestTimeout: 120_000,
  };
}

// ------------------------------------------------------------
// Límite de tiempo REAL de cada consulta (auditoría 11/11/2026, F1).
// El requestTimeout de 120 s no corta una consulta que ya ha empezado a
// devolver datos: reproducido el 11/11 con un límite de 3 s, un primer
// resultado grande seguido de una espera de 6 s acababa a los 7,7 s SIN
// error. Así corrió `tiemposExitos` 390-440 s el 20/10/2026: nginx cortaba a
// los 180 s, la consulta seguía en SQL Server y cada recarga lanzaba otra.
// Todas las consultas salen de `pool.request()`, así que el reloj se pone
// ahí, una vez, para las de ahora y las que se añadan.
// ------------------------------------------------------------

/** Máximo de una consulta, de principio a fin (ms). `RDB_MAX_MS` lo cambia. */
export const MAX_MS_CONSULTA = Number(process.env.RDB_MAX_MS) > 0 ? Number(process.env.RDB_MAX_MS) : 120_000;

/** A partir de aquí la consulta sale en el log como lenta (ms). */
export const LENTA_MS = 5_000;

/**
 * Nombre legible de una consulta para el log: su primer comentario `--`
 * (todas las del proyecto lo llevan) o, si no tiene, el principio del texto.
 */
export function nombreConsulta(texto: string): string {
  const comentario = /^\s*--\s*(.+)$/m.exec(texto);
  const base = comentario ? comentario[1] : texto.replace(/\s+/g, " ").trim();
  return base.length > 100 ? `${base.slice(0, 97)}...` : base;
}

/**
 * Pone a `request.query` un reloj de `maxMs`: al vencer, cancela la consulta
 * en SQL Server (`request.cancel()`, que manda la señal de atención del
 * protocolo y espera a que el servidor la pare) y la promesa falla con un
 * mensaje claro. Las que pasan de LENTA_MS se apuntan en el log.
 */
export function conLimite(request: sql.Request, maxMs: number = MAX_MS_CONSULTA): sql.Request {
  const crudo = request.query as unknown as (...a: unknown[]) => Promise<sql.IResult<unknown>>;
  const original = (comando: string) => crudo.call(request, comando);
  const limitada = async (comando: unknown, ...resto: unknown[]) => {
    // En el proyecto siempre es un texto; cualquier otra forma, tal cual
    if (typeof comando !== "string" || resto.length > 0) {
      return crudo.call(request, comando, ...resto);
    }
    const inicio = Date.now();
    let vencida = false;
    const reloj = setTimeout(() => {
      vencida = true;
      request.cancel();
    }, maxMs);
    try {
      const resultado = await original(comando);
      const ms = Date.now() - inicio;
      if (ms >= LENTA_MS) console.warn(`[rdb] consulta lenta: ${(ms / 1000).toFixed(1)} s · ${nombreConsulta(comando)}`);
      return resultado;
    } catch (err) {
      if (!vencida) throw err;
      const segundos = (Date.now() - inicio) / 1000;
      console.error(`[rdb] consulta CANCELADA a los ${segundos.toFixed(1)} s · ${nombreConsulta(comando)}`);
      throw new Error(
        `La consulta a RDBv2 se ha cancelado al pasar de ${Math.round(maxMs / 1000)} s (${nombreConsulta(comando)})`,
        { cause: err },
      );
    } finally {
      clearTimeout(reloj);
    }
  };
  // `request.query` se sustituye solo en ESTA petición
  Object.defineProperty(request, "query", { value: limitada, configurable: true, writable: true });
  return request;
}

declare global {
  var __rdbPool: Promise<sql.ConnectionPool> | undefined;
}

/** Devuelve el pool conectado (lo crea la primera vez). */
export function obtenerPool(): Promise<sql.ConnectionPool> {
  if (!globalThis.__rdbPool) {
    const pool = new sql.ConnectionPool(configuracion());
    // mssql emite 'error' en el pool cuando falla adquirir una conexión o
    // tedious da un error que no es de socket. Sin listener, el EventEmitter
    // lanza la excepción, y dentro del listener de tedious eso puede tumbar el
    // proceso entero. La query afectada ya recibe su propio error; aquí solo
    // se registra.
    pool.on("error", (err) => console.error("[rdb] error en el pool de RDBv2:", err));
    // Cada petición sale con el límite de tiempo real (conLimite)
    const peticion = pool.request.bind(pool);
    pool.request = () => conLimite(peticion());
    globalThis.__rdbPool = pool
      .connect()
      .catch((err) => {
        // Si falla la conexión inicial, permitir reintento en la siguiente petición
        globalThis.__rdbPool = undefined;
        throw err;
      });
  }
  return globalThis.__rdbPool;
}

export { sql };
