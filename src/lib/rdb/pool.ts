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
    globalThis.__rdbPool = new sql.ConnectionPool(configuracion())
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
