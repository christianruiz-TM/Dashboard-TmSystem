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
    // Las queries analíticas sobre rangos largos pueden tardar
    requestTimeout: 120_000,
  };
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
