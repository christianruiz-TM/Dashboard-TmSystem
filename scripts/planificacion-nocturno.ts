/**
 * Tarea nocturna de planificación (F5): una sola, diaria e idempotente. Se
 * programa a las 02:15, entre los agregados generales (02:00) y el backup
 * (02:30); ver docs/despliegue-windows.md. Según la fecha:
 *   1. agregados de planificación hasta ayer (poniéndose al día si faltan
 *      días), sincronización de usuarios y foto de listas;
 *   2. a partir del día plan.diaGeneracion (20), borrador del mes siguiente
 *      si no tiene ni borrador ni publicada;
 *   3. una vez por semana (el lunes), recálculo de las semanas que aún no han
 *      empezado del mes actual y del siguiente. Siempre como borrador: lo
 *      publicado no se toca. Supervisión ve el aviso en /planificacion y en
 *      Supervisión.
 *
 * Uso:
 *   npm run planificacion:nocturno
 *   ... --simular                 dice qué haría y con qué cambios, sin escribir nada
 *   ... --hoy 2026-10-12          como si hoy fuera esa fecha (pruebas; sin foto de listas)
 *   ... --forzar-recalculo        recalcula aunque no sea lunes o ya se haya hecho esta semana
 *
 * Sale con código 1 si algún paso falla (el Programador de tareas lo marca).
 */
export {};

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const { ejecutarTareaNocturna } = await import("../src/lib/planificacion/tarea-nocturna");
  const { esMock } = await import("../src/lib/rdb/pool");
  const { hoyISO, esquemaFechaISO } = await import("../src/lib/fechas");

  const hoyReal = hoyISO();
  const hoy = argumento("hoy") ?? hoyReal;
  if (!esquemaFechaISO.safeParse(hoy).success) {
    console.error("Fecha inválida. Uso: --hoy YYYY-MM-DD");
    process.exit(1);
  }
  const simular = process.argv.includes("--simular");
  const marcas = [
    esMock() ? "MODO DEMO: datos ficticios" : null,
    hoy !== hoyReal ? `fecha simulada; hoy es ${hoyReal}` : null,
    simular ? "simulación: no se escribe nada" : null,
  ].filter(Boolean);
  console.log(`Tarea nocturna de planificación del ${hoy}${marcas.length ? ` (${marcas.join(" · ")})` : ""}`);

  const { decision, ejecucion } = await ejecutarTareaNocturna({
    hoy,
    hoyReal,
    simular,
    forzarRecalculo: process.argv.includes("--forzar-recalculo"),
    log: (linea) => console.log(`  ${linea}`),
  });
  if (!decision.generar) console.log("  · Borrador del mes siguiente: no toca (antes del día de generación o ya tiene plan)");
  if (!decision.tocaRecalculo) console.log(`  · Recálculo: no toca (se hace los lunes; semana del ${decision.semana})`);
  const segundos = (Date.parse(ejecucion.fin) - Date.parse(ejecucion.inicio)) / 1000;
  console.log(`${ejecucion.ok ? "✔ Terminada" : "✖ Terminada con errores"} en ${segundos.toFixed(1).replace(".", ",")} s`);
  process.exit(ejecucion.ok ? 0 : 1); // cerrar el pool de mssql sin esperar al idle timeout
}

main().catch((err) => {
  console.error("Error en la tarea nocturna de planificación:", err);
  process.exit(1);
});
