/**
 * Agregados propios del módulo de planificación (SQLite), para que el motor
 * y el tablero no consulten RDBv2 en caliente:
 *   agg_hora_servicio    ← demandaPorFranja     (franjas de 30 min)
 *   agg_sesion_usuario   ← islasSesionUsuario   (unión de sesiones por usuario)
 *   agg_logado_usuario   ← islasLogadoUsuario   (unión de user_log por usuario: seguimiento)
 *   agg_cierres_campania ← cierresPorDia        (fechados por su último evento)
 * y en la misma pasada sincroniza los usuarios de agente y hace la foto de
 * las listas salientes (plan_listas_estado, con fecha de hoy).
 *
 * Uso:
 *   npm run planificacion:agregados                                   → ayer
 *   npm run planificacion:agregados -- --desde 2025-06-01 --hasta 2026-09-29
 *   ... --sin-foto        no sincroniza usuarios ni hace la foto de listas
 *
 * Mismo patrón que aggregate-daily.ts: lotes de 7 días, cada lote REEMPLAZA
 * sus días completos, así que re-ejecutar un rango lo deja idéntico a RDBv2.
 * Solo días cerrados: `hasta` se limita a ayer (las sesiones de hoy siguen
 * abiertas). La tarea nocturna (planificacion:nocturno) hace esto mismo cada
 * noche, poniéndose al día si faltan días.
 */
export {};

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const { agregarPlanificacion } = await import("../src/lib/planificacion/agregados");
  const { esMock } = await import("../src/lib/rdb/pool");
  const { ayerISO, hoyISO, esquemaFechaISO } = await import("../src/lib/fechas");

  const ayer = ayerISO();
  const desde = argumento("desde") ?? ayer;
  let hasta = argumento("hasta") ?? desde;
  if (!esquemaFechaISO.safeParse(desde).success || !esquemaFechaISO.safeParse(hasta).success || desde > hasta) {
    console.error("Rango inválido. Uso: --desde YYYY-MM-DD --hasta YYYY-MM-DD");
    process.exit(1);
  }
  if (hasta > ayer) {
    console.warn(`hasta ${hasta} → ${ayer}: solo se agregan días cerrados`);
    hasta = ayer;
  }
  console.log(`Agregados de planificación ${desde} → ${hasta}${esMock() ? " (MODO DEMO: datos ficticios)" : ""}`);

  const r = await agregarPlanificacion({
    desde,
    hasta,
    foto: !process.argv.includes("--sin-foto"),
    hoy: hoyISO(),
    log: (linea) => console.log(`  ${linea}`),
  });
  console.log(`  consulta más lenta: ${r.masLenta.consulta} (${seg(r.masLenta.ms)}) · total ${seg(r.ms)}`);
  console.log(
    `✔ Agregados: ${r.totales.demanda} franjas de demanda, ${r.totales.sesiones} islas de sesión, ` +
      `${r.totales.logado} islas de tiempo logado, ${r.totales.cierres} filas de cierres`,
  );
  process.exit(0); // cerrar el pool de mssql sin esperar al idle timeout
}

main().catch((err) => {
  console.error("Error en los agregados de planificación:", err);
  process.exit(1);
});
