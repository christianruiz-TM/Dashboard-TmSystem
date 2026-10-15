/**
 * Test de oro de la tarificación: recalcula un mes contra RDBv2 con la misma
 * lógica que Operaciones y lo compara, campaña a campaña, con lo que el Excel
 * de facturación de operaciones guardó en «facturacion cerrada».
 *
 * Uso:
 *   npm run facturacion:comparar -- --archivo "C:\ruta\Interacciones GH….xlsx" --mes 2026-09
 *   ... --servicio GrupoHuertas --prefijo GH     (por defecto, los de GH)
 *   ... --excluir "0673,1161,8259"   prefijos que no cuentan para el reparto
 *                                    (los del segmentador del Excel; en el
 *                                    dashboard, Operaciones → Reparto)
 *   ... --ddi-con-llamadas gh_bbdd_  campañas que empiezan así solo pagan
 *                                    DDIs los meses con llamadas
 *
 * No lee la SQLite (ni tarifas ni maestros): los DDIs salen de la hoja
 * «LISTADO DDI DETALLE» del mismo Excel y los precios, de dividir importe
 * entre cantidad en cada fila del Excel. Las campañas con contactos en el
 * Excel son las de bbdd: solo se comparan contactos y DDIs (ni horas ni
 * minutos, como en su config de campaña).
 *
 * Tolerancias (decididas con el plan del 14/10/2026): total de horas exacto
 * y ±0,3 h por campaña (el Excel excluía a mano unos prefijos, ≈8 min);
 * minutos ±1 por campaña; contactos y DDIs exactos. Sale con 1 si algo se
 * pasa.
 */
function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const n2 = (x: number) => x.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const red = (x: number) => Math.round(x * 100) / 100;

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const archivo = argumento("archivo");
  const mes = argumento("mes");
  const servicio = argumento("servicio") ?? "GrupoHuertas";
  const prefijo = argumento("prefijo") ?? "GH";
  const excluidos = new Set((argumento("excluir") ?? "").split(/[\s,;]+/).filter(Boolean));
  const ddiConLlamadas = argumento("ddi-con-llamadas");
  if (!archivo || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    console.error('Uso: npm run facturacion:comparar -- --archivo "ruta.xlsx" --mes YYYY-MM [--servicio X --prefijo Y]');
    process.exit(1);
  }

  const ExcelJS = (await import("exceljs")).default;
  const { leerDdis, leerFacturacionCerrada } = await import("../src/lib/facturacion-excel");
  const { ddisFacturables, mesesDelRango } = await import("../src/lib/ddis");
  const { repartirHorasLogadas } = await import("../src/lib/facturacion-horas-logadas");
  const { tarificacionPorCampania } = await import("../src/lib/tarificacion");
  const { baseRepartoHorasLogadas, horasLogadasUsuarios, unidadesPorCampania } = await import(
    "../src/lib/rdb/queries/facturacion"
  );
  const { minutosLineaPorCampania } = await import("../src/lib/rdb/queries/tarificacion");
  const { campaniasEfectivas } = await import("../src/lib/rdb/queries/servicios");
  const { listadoCampanias } = await import("../src/lib/rdb/queries/campanias");

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(archivo);
  const excel = leerFacturacionCerrada(libro).filter((f) => f.mes === mes);
  if (excel.length === 0) {
    console.error(`«facturacion cerrada» no tiene ${mes}`);
    process.exit(1);
  }
  const { inicio, fin } = mesesDelRango(`${mes}-01`, `${mes}-01`)[0];
  const campanias = (await campaniasEfectivas(servicio, false)) ?? [];
  const bbdd = new Set(excel.filter((f) => (f.valores.leads?.cantidad ?? 0) > 0).map((f) => f.campania));
  const codigoACampania = new Map((await listadoCampanias()).map((c) => [c.codigo, c.shortname]));

  const t0 = Date.now();
  const [usuarios, base, minutos, unidades] = await Promise.all([
    horasLogadasUsuarios(inicio, fin, [prefijo]),
    baseRepartoHorasLogadas(inicio, fin, [prefijo]),
    minutosLineaPorCampania(inicio, fin, campanias),
    unidadesPorCampania(inicio, fin, campanias),
  ]);
  const totalHoras = red(usuarios.reduce((a, u) => a + u.horas, 0));
  const reparto = repartirHorasLogadas(
    base,
    prefijo,
    totalHoras,
    null,
    new Set(campanias.filter((c) => !bbdd.has(c))),
    excluidos,
  );
  const tarif = tarificacionPorCampania(minutos);
  const ddis = ddisFacturables(leerDdis(libro, codigoACampania).ddis, inicio, fin);
  const leads = new Map(unidades.map((u) => [u.campania, u.leadsFinalizados]));
  const conLlamadas = new Set(unidades.filter((u) => u.interacciones > 0).map((u) => u.campania));
  if (excluidos.size > 0) console.log(`Prefijos excluidos del reparto: ${[...excluidos].join(", ")}`);
  console.log(`${servicio} ${mes}: RDBv2 consultada en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

  type Unidad = "horas_logadas" | "minutos_fijo" | "minutos_movil" | "leads" | "ddi";
  const nuestro = (u: Unidad, c: string): number => {
    switch (u) {
      case "horas_logadas":
        return reparto.find((r) => r.campania === c)?.horasLogadas ?? 0;
      case "minutos_fijo":
        return red(tarif.get(c)?.minutos.fijo ?? 0);
      case "minutos_movil":
        return red(tarif.get(c)?.minutos.movil ?? 0);
      case "leads":
        return bbdd.has(c) ? (leads.get(c) ?? 0) : 0;
      case "ddi":
        if (ddiConLlamadas && c.startsWith(ddiConLlamadas) && !conLlamadas.has(c)) return 0;
        return ddis.get(c) ?? 0;
    }
  };
  const tolerancia: Record<Unidad, number> = { horas_logadas: 0.3, minutos_fijo: 1, minutos_movil: 1, leads: 0, ddi: 0 };
  const unidadesComparadas: Unidad[] = ["horas_logadas", "minutos_fijo", "minutos_movil", "leads", "ddi"];

  let fallos = 0;
  let euroExcel = 0;
  let euroNuestro = 0;
  const resumen = new Map<Unidad, { excel: number; nuestro: number; exactas: number; filas: number }>();
  const campaniasExcel = new Set(excel.map((f) => f.campania));
  // Las bbdd solo pagan contactos y DDIs (su config de campaña no lleva horas ni minutos)
  const cobradas = (c: string): Unidad[] => (bbdd.has(c) ? ["leads", "ddi"] : unidadesComparadas.filter((u) => u !== "leads"));
  for (const f of excel) {
    for (const u of cobradas(f.campania)) {
      const v = f.valores[u];
      const cx = v?.cantidad ?? 0;
      const ix = v?.importe ?? 0;
      const cn = nuestro(u, f.campania);
      const precio = cx !== 0 ? ix / cx : 0;
      euroExcel += ix;
      euroNuestro += cn * precio;
      if (cx === 0 && cn === 0) continue;
      const r = resumen.get(u) ?? { excel: 0, nuestro: 0, exactas: 0, filas: 0 };
      r.excel += cx;
      r.nuestro += cn;
      r.filas += 1;
      if (Math.abs(cn - cx) < 0.005) r.exactas += 1;
      resumen.set(u, r);
      if (Math.abs(cn - cx) > tolerancia[u] + 1e-9) {
        fallos += 1;
        console.log(`✗ ${f.campania.padEnd(22)} ${u.padEnd(14)} Excel ${n2(cx).padStart(10)}  dashboard ${n2(cn).padStart(10)}  (${cn - cx > 0 ? "+" : ""}${n2(cn - cx)})`);
      }
    }
  }
  // Lo que el dashboard cobraría a campañas que el Excel no tiene
  for (const c of new Set([...reparto.map((r) => r.campania ?? "(sin campaña)"), ...tarif.keys(), ...ddis.keys()])) {
    if (campaniasExcel.has(c)) continue;
    const extra = cobradas(c).map((u) => [u, c === "(sin campaña)" ? 0 : nuestro(u, c)] as const).filter(([, v]) => v !== 0);
    if (extra.length > 0) console.log(`? ${c.padEnd(22)} no está en el Excel: ${extra.map(([u, v]) => `${u} ${n2(v)}`).join(", ")}`);
  }

  console.log("\nUnidad            Excel        Dashboard    Campañas exactas");
  for (const [u, r] of resumen) {
    console.log(`${u.padEnd(14)} ${n2(r.excel).padStart(11)}  ${n2(r.nuestro).padStart(11)}    ${r.exactas}/${r.filas}`);
  }
  console.log(`\nImporte (precios del Excel): Excel ${n2(euroExcel)} €  ·  dashboard ${n2(euroNuestro)} €  (${n2(euroNuestro - euroExcel)} €)`);
  console.log(fallos === 0 ? "\n✓ Todo dentro de tolerancia" : `\n✗ ${fallos} valores fuera de tolerancia`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
