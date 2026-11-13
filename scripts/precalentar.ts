/**
 * Precalentado de madrugada (13/11/2026): deja en la caché persistente
 * (SQLite `cache_consultas`) las consultas de los rangos ya cerrados que más
 * se abren, para que Dirección y Supervisión → Histórico salgan al momento:
 *  - «Mes anterior»: el resumen de Dirección y el de Supervisión → Histórico.
 *  - El periodo con el que compara Dirección por defecto (del 1 al día de hoy
 *    del mes anterior) y el del «Mes anterior» (el mes de antes).
 *  - «Ayer», lo que abre Supervisión → Histórico por defecto.
 * Para todos los clientes y para cada cliente con actividad en los últimos 7
 * días, sin IVR (lo de por defecto). Con las MISMAS claves que las páginas
 * (mismo rango, campañas y prefijo de usuarios). Una consulta detrás de otra,
 * para no cargar RDBv2. Idempotente: lo que ya está guardado y vigente no se
 * vuelve a consultar.
 *
 * Uso: npm run precalentar [-- --simular]
 */
// Es un módulo (los imports van dentro de main, después de activar la caché)
export {};

// Activa la caché persistente en este proceso (los demás scripts no la usan)
process.env.CACHE_PERSISTENTE = "1";
try {
  process.loadEnvFile();
} catch {
  /* sin .env: en el contenedor llegan por env_file */
}

async function main() {
  const simular = process.argv.includes("--simular");
  const { presetsRango } = await import("../src/lib/fechas");
  const { rangoAnterior } = await import("../src/lib/direccion-secciones");
  const { prefijoUsuariosDe } = await import("../src/lib/facturacion");
  const { umbralSlaSeg } = await import("../src/lib/db/settings");
  const { podarConsultasGuardadas, resumenConsultasGuardadas, versionCalculos } = await import(
    "../src/lib/db/cache-consultas"
  );
  const { ordenarPorActividad } = await import("../src/lib/actividad-servicios");
  const { hoyISO } = await import("../src/lib/fechas");
  const { actividadServicios, campaniasEfectivas, listaServicios } = await import("../src/lib/rdb/queries/servicios");
  const { ratiosExitoRango } = await import("../src/lib/rdb/queries/ratios-exito");
  const { totalResultados } = await import("../src/lib/resultados-cabecera");
  const { volumenPorCampania } = await import("../src/lib/rdb/queries/interacciones");
  const { unidadesPorCampania } = await import("../src/lib/rdb/queries/facturacion");
  const { horasAgenteReales, horasLogadasPorServicio } = await import("../src/lib/rdb/queries/agentes");
  const { kpisCampaniasRango } = await import("../src/lib/rdb/queries/supervision");

  const inicio = Date.now();
  console.log(`[precalentar] versión ${versionCalculos()}`);
  if (!simular) console.log(`[precalentar] podadas ${podarConsultasGuardadas()} entradas caducadas o de otra versión`);

  const presets = presetsRango();
  const preset = (e: string) => presets.find((p) => p.etiqueta === e)!;
  const mesAnterior = preset("Mes anterior");
  const mesActual = preset("Mes actual");
  const ayer = preset("Ayer");
  // Los rangos y lo que se pide de cada uno
  const rangos: { nombre: string; desde: string; hasta: string; que: "direccion" | "comparacion" | "supervision" }[] = [
    { nombre: "mes anterior", ...mesAnterior, que: "direccion" },
    { nombre: "comparación del mes actual", ...rangoAnterior(mesActual.desde, mesActual.hasta), que: "comparacion" },
    { nombre: "comparación del mes anterior", ...rangoAnterior(mesAnterior.desde, mesAnterior.hasta), que: "comparacion" },
    { nombre: "ayer", ...ayer, que: "supervision" },
  ];

  const servicios = (await listaServicios()).map((s) => s.servicio);
  const { activos } = ordenarPorActividad(servicios, await actividadServicios(), hoyISO());
  const alcances: (string | undefined)[] = [undefined, ...activos.map((a) => a.servicio)];
  const umbral = umbralSlaSeg();
  console.log(`[precalentar] ${alcances.length} alcances (todos + ${activos.length} clientes activos), ${rangos.length} rangos`);
  if (simular) {
    for (const r of rangos) console.log(`  ${r.nombre}: ${r.desde} a ${r.hasta} (${r.que})`);
    console.log(`  clientes: ${activos.map((a) => a.servicio).join(", ")}`);
    process.exit(0);
  }

  let fallos = 0;
  for (const servicio of alcances) {
    const camp = await campaniasEfectivas(servicio, false);
    const prefijo = prefijoUsuariosDe(servicio);
    for (const r of rangos) {
      const pasos: [string, () => Promise<unknown>][] = [
        ["ratios", () => ratiosExitoRango(r.desde, r.hasta, camp, prefijo)],
        ["resultados", () => totalResultados(r.desde, r.hasta, camp, prefijo)],
      ];
      if (r.que !== "supervision") pasos.push(["volumen", () => volumenPorCampania(r.desde, r.hasta, camp)]);
      if (r.que === "direccion") {
        pasos.push(["unidades", () => unidadesPorCampania(r.desde, r.hasta, camp)]);
        pasos.push(["horas reales", () => horasAgenteReales(r.desde, r.hasta, camp)]);
        if (!servicio) pasos.push(["horas por cliente", () => horasLogadasPorServicio(r.desde, r.hasta, camp)]);
      }
      if (r.que !== "comparacion") pasos.push(["kpis campañas", () => kpisCampaniasRango(r.desde, r.hasta, umbral, camp)]);
      const t = Date.now();
      for (const [nombre, paso] of pasos) {
        try {
          await paso();
        } catch (e) {
          fallos++;
          console.error(`[precalentar] ${servicio ?? "todos"} · ${r.nombre} · ${nombre}: ${(e as Error).message}`);
        }
      }
      console.log(`[precalentar] ${(servicio ?? "todos").padEnd(16)} ${r.nombre.padEnd(30)} ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
  }
  console.log(
    `[precalentar] hecho en ${((Date.now() - inicio) / 1000).toFixed(0)} s · ${resumenConsultasGuardadas().vigentes} consultas guardadas · ${fallos} fallos`,
  );
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[precalentar] FALLO:", e);
  process.exit(1);
});
