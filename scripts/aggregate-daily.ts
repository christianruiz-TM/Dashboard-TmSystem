/**
 * Job de agregados diarios por campaña → tabla SQLite agg_daily_campaign.
 * Pensado para la tarea programada de Windows a las 02:00 (día anterior)
 * y para el backfill inicial del histórico.
 *
 * Uso:
 *   npm run agregados                                     → ayer
 *   npm run agregados -- --desde 2025-06-01 --hasta 2026-06-10   → backfill por lotes
 */

function leerArgumento(nombre: string): string | undefined {
  const idx = process.argv.indexOf(`--${nombre}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }

  const { metricasDiariasPorCampania } = await import("../src/lib/rdb/queries/facturacion");
  const { upsertMetricasDiarias } = await import("../src/lib/db/agregados");
  const { esMock } = await import("../src/lib/rdb/pool");

  const ayer = sumarDias(new Date().toISOString().slice(0, 10), -1);
  const desde = leerArgumento("desde") ?? ayer;
  const hasta = leerArgumento("hasta") ?? desde;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    console.error("Rango inválido. Uso: --desde YYYY-MM-DD --hasta YYYY-MM-DD");
    process.exit(1);
  }

  console.log(`Agregando ${desde} → ${hasta}${esMock() ? " (MODO DEMO: datos ficticios)" : ""}`);

  // Lotes de 7 días para acotar el coste de cada query sobre itr_thread
  let inicio = desde;
  let totalFilas = 0;
  while (inicio <= hasta) {
    const fin = sumarDias(inicio, 6) > hasta ? hasta : sumarDias(inicio, 6);
    const filas = await metricasDiariasPorCampania(inicio, fin);
    upsertMetricasDiarias(filas);
    totalFilas += filas.length;
    console.log(`  ${inicio} → ${fin}: ${filas.length} filas (día×campaña)`);
    inicio = sumarDias(fin, 1);
  }

  console.log(`✔ Agregación completada: ${totalFilas} filas escritas/actualizadas`);
  process.exit(0); // cerrar el pool de mssql sin esperar al idle timeout
}

main().catch((err) => {
  console.error("Error en la agregación:", err);
  process.exit(1);
});
