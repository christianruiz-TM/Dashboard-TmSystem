/**
 * Backup consistente de la BBDD SQLite del dashboard (API de backup de
 * better-sqlite3: segura aunque la app esté escribiendo).
 * Genera ./backups/dashboard_YYYYMMDD_HHmm.db y conserva los 30 últimos.
 *
 * Programar en el servidor junto al job de agregados (Task Scheduler).
 */
import fs from "node:fs";
import path from "node:path";

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const { default: Database } = await import("better-sqlite3");

  const origen = path.resolve(process.cwd(), process.env.SQLITE_PATH ?? "./data/dashboard.db");
  if (!fs.existsSync(origen)) {
    console.error(`No existe la BBDD en ${origen}`);
    process.exit(1);
  }

  const carpeta = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(carpeta, { recursive: true });

  const marca = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 13);
  const destino = path.join(carpeta, `dashboard_${marca}.db`);

  const db = new Database(origen, { readonly: true });
  await db.backup(destino);
  db.close();
  console.log(`✔ Backup creado: ${destino}`);

  // Retención: conservar los 30 más recientes
  const antiguos = fs
    .readdirSync(carpeta)
    .filter((f) => f.startsWith("dashboard_") && f.endsWith(".db"))
    .sort()
    .reverse()
    .slice(30);
  for (const archivo of antiguos) {
    fs.unlinkSync(path.join(carpeta, archivo));
    console.log(`  retirado backup antiguo: ${archivo}`);
  }
}

main().catch((err) => {
  console.error("Error en el backup:", err);
  process.exit(1);
});
