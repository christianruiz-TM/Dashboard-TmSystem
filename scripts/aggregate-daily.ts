/**
 * Job de agregados diarios por campaña → tabla SQLite agg_daily_campaign.
 * Pensado para la tarea programada de Windows a las 02:00 (día anterior)
 * y para el backfill inicial del histórico.
 *
 * Uso:
 *   npm run agregados                                     → ayer
 *   npm run agregados -- --desde 2025-06-01 --hasta 2026-06-10   → backfill por lotes
 *
 * Cada lote REEMPLAZA sus días completos (borra y vuelve a escribir), así que
 * re-ejecutar un rango lo deja exactamente como está hoy en RDBv2.
 */
import { addDays, format, parseISO } from "date-fns";

function leerArgumento(nombre: string): string | undefined {
  const idx = process.argv.indexOf(`--${nombre}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** Suma días en hora LOCAL (con toISOString salía la fecha UTC). */
function sumarDias(fechaISO: string, dias: number): string {
  return format(addDays(parseISO(fechaISO), dias), "yyyy-MM-dd");
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }

  const { metricasDiariasPorCampania } = await import("../src/lib/rdb/queries/facturacion");
  const { ratiosDiariosAgenteCampania } = await import("../src/lib/rdb/queries/ratios-exito");
  const { reemplazarMetricasDiarias, reemplazarRatiosDiarios } = await import(
    "../src/lib/db/agregados"
  );
  const { esMock } = await import("../src/lib/rdb/pool");
  const { ayerISO, esquemaFechaISO } = await import("../src/lib/fechas");

  // «Ayer» en hora LOCAL. Antes se sacaba de toISOString() (UTC): con la tarea
  // programada antes de las 02:00 (01:00 en invierno) daba ANTEAYER y el día
  // de ayer no se agregaba nunca.
  const desde = leerArgumento("desde") ?? ayerISO();
  const hasta = leerArgumento("hasta") ?? desde;
  if (
    !esquemaFechaISO.safeParse(desde).success ||
    !esquemaFechaISO.safeParse(hasta).success ||
    desde > hasta
  ) {
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
    reemplazarMetricasDiarias(inicio, fin, filas);
    // Ratios de éxito por usuario y campaña (regla 17), mismos días
    const ratios = await ratiosDiariosAgenteCampania(inicio, fin);
    reemplazarRatiosDiarios(inicio, fin, ratios);
    totalFilas += filas.length;
    console.log(
      `  ${inicio} → ${fin}: ${filas.length} filas (día×campaña), ${ratios.length} de ratios (día×usuario×campaña)`,
    );
    inicio = sumarDias(fin, 1);
  }

  console.log(`✔ Agregación completada: ${totalFilas} filas escritas/actualizadas`);
  process.exit(0); // cerrar el pool de mssql sin esperar al idle timeout
}

main().catch((err) => {
  console.error("Error en la agregación:", err);
  process.exit(1);
});
