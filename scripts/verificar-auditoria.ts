/**
 * Comprobación de las correcciones de la auditoría contra la BBDD real.
 * Uso: npx tsx scripts/verificar-auditoria.ts
 */
process.loadEnvFile();

async function main() {
  const { kpisCampaniasRango } = await import("../src/lib/rdb/queries/supervision");
  const { horasAgenteReales, razonesNotReady } = await import("../src/lib/rdb/queries/agentes");
  const { unidadesPorCampania } = await import("../src/lib/rdb/queries/facturacion");
  const { campaniasEfectivas } = await import("../src/lib/rdb/queries/servicios");
  const { hoyISO, ayerISO } = await import("../src/lib/fechas");

  const ayer = ayerISO();
  const hoy = hoyISO();

  const camp = await campaniasEfectivas(undefined, false);
  console.log(`alcance por defecto: ${camp?.length ?? "todas"} campañas (sin IVR ni Test)`);

  let t = Date.now();
  const kpis = await kpisCampaniasRango(ayer, ayer, 20, camp);
  console.log(`\n== SLA/cola de ${ayer} (umbral 20 s) [${Date.now() - t} ms] ==`);
  const sum = (f: (k: (typeof kpis)[0]) => number) => kpis.reduce((a, k) => a + f(k), 0);
  const atIn = sum((k) => k.atendidasInbound);
  const atTot = sum((k) => k.atendidas);
  // Igual que los paneles: desde los recuentos, no ponderando % ya redondeados
  const slaNuevo = atIn > 0 ? ((atIn - sum((k) => k.atendidasFueraSla)) / atIn) * 100 : null;
  const abIn = sum((k) => k.abandonadasInbound);
  console.log(`recibidas(in)=${sum((k) => k.recibidas)}  atendidas(todas)=${atTot}  atendidas(in)=${atIn}`);
  console.log(`abandonadas(todas)=${sum((k) => k.abandonadas)}  abandonadas(in)=${abIn}`);
  console.log(`SLA global CORREGIDO (solo entrantes): ${slaNuevo?.toFixed(1)} %`);
  console.log(
    `cola media (atendidas)=${(sum((k) => k.colaAtendidasTotalSeg) / atIn).toFixed(2)} s  ` +
      `espera abandonadas=${abIn > 0 ? (sum((k) => k.esperaAbandonadasTotalSeg) / abIn).toFixed(2) : "—"} s`,
  );
  console.log("top 5 campañas por entrantes:");
  console.table(
    [...kpis].sort((a, b) => b.recibidas - a.recibidas).slice(0, 5)
      .map((k) => ({ campania: k.campania, recibidas: k.recibidas, atIn: k.atendidasInbound,
                     abIn: k.abandonadasInbound, colaMedia: k.colaMediaSeg, sla: k.slaPct })),
  );

  t = Date.now();
  const hHoy = await horasAgenteReales(hoy, hoy, camp);
  console.log(`\n== Horas reales de HOY [${Date.now() - t} ms] ==`);
  console.log(`logadas=${hHoy.horasLogadas} h  ready=${hHoy.horasReady} h  (incluye sesiones abiertas)`);

  t = Date.now();
  const hAyer = await horasAgenteReales(ayer, ayer, camp);
  console.log(`== Horas reales de AYER (día cerrado) [${Date.now() - t} ms] ==`);
  console.log(`logadas=${hAyer.horasLogadas} h  ready=${hAyer.horasReady} h`);

  t = Date.now();
  const uni = await unidadesPorCampania(ayer, ayer, camp);
  const totalProd = uni.reduce((a, u) => a + u.horasProductivas, 0);
  console.log(`\n== Unidades facturables de ${ayer} [${Date.now() - t} ms] ==`);
  console.log(`campañas con actividad=${uni.length}  horas productivas totales=${totalProd.toFixed(1)} h`);
  console.table(uni.slice(0, 5));

  t = Date.now();
  const nr = await razonesNotReady(hoy, hoy, camp);
  console.log(`\n== Not Ready de HOY [${Date.now() - t} ms] ==`);
  console.log(`filas=${nr.length}  total=${(nr.reduce((a, x) => a + x.segundosTotal, 0) / 60).toFixed(0)} min`);
  console.table(nr.slice(0, 5));

  process.exit(0);
}
main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });

// Marca el fichero como módulo: sin un import/export de nivel superior, TS lo
// trata como script global y "main" choca con el de aggregate-daily.ts.
export {};
