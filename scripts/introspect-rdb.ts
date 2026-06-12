/**
 * Introspección de RDBv2: valida el esquema REAL contra la documentación
 * (docs/referencia_bbdd_altitude_v85.md) y genera docs/esquema-real.md.
 *
 * Comprueba:
 *  1. Tablas clave presentes y volúmenes de filas
 *  2. Dump completo de rdb_enums (enumerados reales de la instalación)
 *  3. VERIFICACIÓN EMPÍRICA de las décimas de segundo en duration
 *  4. Frescura de replicación y de flat tables
 *  5. Campañas con actividad en los últimos 30 días
 *  6. Estructura de activity_history (para fijar la fecha de "lead finalizado")
 *
 * Uso: npm run introspect   (requiere credenciales reales en .env y RDB_MOCK=0)
 */
import fs from "node:fs";
import path from "node:path";

const TABLAS_CLAVE = [
  "itr_thread",
  "itr_global",
  "itr_segment",
  "ph_e_user",
  "ph_campaign",
  "ph_service",
  "cp_general_cfg",
  "ag_in_cp_log",
  "user_log",
  "activity",
  "activity_history",
  "script_session",
  "not_ready_reason",
  "ph_activity_list",
  "rdb_enums",
  "flat_agent_login",
  "flat_agent_cpg_operations",
];

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }

  if (process.env.RDB_MOCK === "1") {
    console.error(
      "RDB_MOCK=1: la introspección necesita conexión real. Configura el .env y pon RDB_MOCK=0.",
    );
    process.exit(1);
  }

  const { obtenerPool, sql } = await import("../src/lib/rdb/pool");
  const pool = await obtenerPool();
  const lineas: string[] = [];
  const log = (texto: string) => {
    lineas.push(texto);
    console.log(texto);
  };

  log(`# Esquema real de RDBv2 — introspección ${new Date().toISOString()}`);
  log("");
  log(`Servidor: ${process.env.RDB_HOST} · BBDD: ${process.env.RDB_DATABASE ?? "RDBv2"}`);
  log("");

  // ---------- 1. Tablas presentes y volúmenes ----------
  log("## 1. Tablas clave y volúmenes");
  log("");
  try {
    const r = await pool.request().query(`
      SELECT t.name AS tabla, SUM(p.rows) AS filas
      FROM sys.tables t
      JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
      GROUP BY t.name
      ORDER BY t.name;
    `);
    const filasPorTabla = new Map(
      (r.recordset as { tabla: string; filas: number }[]).map((f) => [f.tabla, f.filas]),
    );
    log("| Tabla | Estado | Filas |");
    log("|---|---|---:|");
    for (const tabla of TABLAS_CLAVE) {
      const filas = filasPorTabla.get(tabla);
      log(`| ${tabla} | ${filas != null ? "✅" : "❌ NO EXISTE"} | ${filas?.toLocaleString("es-ES") ?? "—"} |`);
    }
    const totalTablas = filasPorTabla.size;
    log("");
    log(`Total de tablas en la BBDD: ${totalTablas}`);
  } catch (err) {
    log(`⚠ No se pudieron leer los volúmenes (permisos): ${err}`);
  }
  log("");

  // ---------- 2. Enumerados reales ----------
  log("## 2. Enumerados (rdb_enums)");
  log("");
  try {
    const r = await pool.request().query(`
      SELECT enum_name, enum_value, enum_value_name
      FROM rdb_enums
      ORDER BY enum_name, enum_value;
    `);
    let actual = "";
    for (const fila of r.recordset as {
      enum_name: string;
      enum_value: number;
      enum_value_name: string;
    }[]) {
      if (fila.enum_name !== actual) {
        actual = fila.enum_name;
        log(`### ${actual}`);
      }
      log(`- ${fila.enum_value} = ${fila.enum_value_name}`);
    }
  } catch (err) {
    log(`⚠ Error leyendo rdb_enums: ${err}`);
  }
  log("");

  // ---------- 3. Verificación décimas de segundo ----------
  log("## 3. Verificación de unidades de duration (¿décimas de segundo?)");
  log("");
  try {
    const r = await pool.request().query(`
      -- Ratio entre duration y la duración real por timestamps GMT.
      -- ratio ≈ 10 → duration está en décimas · ratio ≈ 1 → en segundos
      SELECT TOP 500
          t.duration,
          DATEDIFF(SECOND, t.gmt_start_time, t.gmt_end_time) AS seg_reales
      FROM itr_thread t
      WHERE t.start_time >= DATEADD(DAY, -7, GETDATE())
        AND t.gmt_end_time IS NOT NULL
        AND t.duration > 0
        AND DATEDIFF(SECOND, t.gmt_start_time, t.gmt_end_time) > 5
      ORDER BY t.start_time DESC;
    `);
    const ratios = (r.recordset as { duration: number; seg_reales: number }[])
      .map((f) => f.duration / f.seg_reales)
      .sort((a, b) => a - b);
    if (ratios.length === 0) {
      log("⚠ Sin muestras en los últimos 7 días para verificar.");
    } else {
      const mediana = ratios[Math.floor(ratios.length / 2)];
      log(`Muestras: ${ratios.length} · ratio mediano duration/segundos = ${mediana.toFixed(2)}`);
      if (mediana > 8 && mediana < 12) {
        log("✅ CONFIRMADO: duration en DÉCIMAS de segundo (dividir entre 10.0).");
      } else if (mediana > 0.8 && mediana < 1.2) {
        log("❌ ATENCIÓN: duration parece estar en SEGUNDOS. ¡Revisar TODAS las queries (/10.0)!");
      } else {
        log(`⚠ Ratio inesperado (${mediana.toFixed(2)}): revisar manualmente.`);
      }
    }
  } catch (err) {
    log(`⚠ Error verificando décimas: ${err}`);
  }
  log("");

  // ---------- 4. Frescura ----------
  log("## 4. Frescura de datos");
  log("");
  try {
    const req = pool.request();
    req.input("desde", sql.DateTime, new Date(Date.now() - 7 * 24 * 3600_000));
    const r = await req.query(`
      SELECT
        (SELECT MAX(start_time) FROM itr_thread WHERE start_time >= @desde)          AS replicacion,
        (SELECT MAX(StartMoment) FROM flat_agent_login WHERE StartMoment >= @desde)  AS flats,
        GETDATE()                                                                    AS ahora;
    `);
    const fila = r.recordset[0] as { replicacion: Date | null; flats: Date | null; ahora: Date };
    const retraso = (d: Date | null) =>
      d ? `${Math.round((fila.ahora.getTime() - d.getTime()) / 60000)} min` : "sin datos en 7 días";
    log(`- Replicación (itr_thread): retraso ${retraso(fila.replicacion)}`);
    log(`- Flat tables (flat_agent_login): retraso ${retraso(fila.flats)}`);
  } catch (err) {
    log(`⚠ Error midiendo frescura: ${err}`);
  }
  log("");

  // ---------- 5. Campañas activas ----------
  log("## 5. Campañas con actividad (últimos 30 días)");
  log("");
  try {
    const req = pool.request();
    req.input("desde", sql.DateTime, new Date(Date.now() - 30 * 24 * 3600_000));
    const r = await req.query(`
      SELECT RTRIM(c.shortname) AS campania, c.campaigntype AS tipo, COUNT(*) AS hilos
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde
      GROUP BY RTRIM(c.shortname), c.campaigntype
      ORDER BY hilos DESC;
    `);
    log("| Campaña | Tipo | Hilos 30d |");
    log("|---|---|---:|");
    for (const f of r.recordset as { campania: string; tipo: number; hilos: number }[]) {
      log(`| ${f.campania} | ${f.tipo} | ${f.hilos.toLocaleString("es-ES")} |`);
    }
  } catch (err) {
    log(`⚠ Error listando campañas activas: ${err}`);
  }
  log("");

  // ---------- 6. Estructura de activity_history ----------
  log("## 6. Estructura de activity_history (fecha real de leads finalizados)");
  log("");
  try {
    const r = await pool.request().query(`
      SELECT COLUMN_NAME AS columna, DATA_TYPE AS tipo, IS_NULLABLE AS nulable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'activity_history'
      ORDER BY ORDINAL_POSITION;
    `);
    log("| Columna | Tipo | Nulable |");
    log("|---|---|---|");
    for (const f of r.recordset as { columna: string; tipo: string; nulable: string }[]) {
      log(`| ${f.columna} | ${f.tipo} | ${f.nulable} |`);
    }
    log("");
    log(
      "> Con esta estructura, decidir si la fecha de cierre del lead debe salir del último " +
        "evento de activity_history en lugar de activity.moment (ver CLAUDE.md, validaciones pendientes).",
    );
  } catch (err) {
    log(`⚠ Error leyendo activity_history: ${err}`);
  }

  // ---------- Guardar informe ----------
  const destino = path.resolve(process.cwd(), "docs", "esquema-real.md");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, lineas.join("\n"), "utf8");
  console.log("");
  console.log(`✔ Informe guardado en ${destino}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la introspección:", err);
  process.exit(1);
});
