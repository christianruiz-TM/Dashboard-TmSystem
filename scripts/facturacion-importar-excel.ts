/**
 * Importa del Excel de facturación de operaciones («Interacciones GH_cs v4
 * …xlsx») los maestros y el histórico que el dashboard usa para tarificar:
 *  - --ddis        «LISTADO DDI DETALLE» → inventario de DDIs
 *  - --gs          «CAMP GS» → códigos de campaña en GS
 *  - --historico   «facturacion cerrada» → meses cerrados (origen «importado»)
 * Sin ninguno de los tres, los tres.
 *
 * Uso:
 *   npm run facturacion:importar-excel -- --archivo "C:\ruta\Interacciones GH….xlsx"
 *   ... --guardar                 lo escribe en SQLite (sin esto solo enseña qué saldría)
 *   ... --guardar --reemplazar    sustituye los DDIs / códigos que haya y los meses ya importados
 *   ... --servicio GrupoHuertas   cliente al que pertenece el histórico (por defecto GrupoHuertas)
 *
 * Los meses cerrados desde el dashboard nunca se tocan. Hacer `npm run backup`
 * antes de --guardar.
 */
import { basename } from "node:path";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tiene = (nombre: string) => process.argv.includes(`--${nombre}`);
const eur = (x: number) => x.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const archivo = argumento("archivo");
  if (!archivo) {
    console.error(
      'Uso: npm run facturacion:importar-excel -- --archivo "ruta.xlsx" [--ddis] [--gs] [--historico] [--guardar [--reemplazar]] [--servicio GrupoHuertas]',
    );
    process.exit(1);
  }
  const todos = !tiene("ddis") && !tiene("gs") && !tiene("historico");
  const guardar = tiene("guardar");
  const reemplazar = tiene("reemplazar");
  const servicio = argumento("servicio") ?? "GrupoHuertas";

  const ExcelJS = (await import("exceljs")).default;
  const { leerCampaniasGs, leerDdis, leerFacturacionCerrada, lineasDeFilasCerradas } = await import(
    "../src/lib/facturacion-excel"
  );
  const { ddisFacturables, seSolapan } = await import("../src/lib/ddis");
  const { listadoCampanias } = await import("../src/lib/rdb/queries/campanias");
  // SQLite solo al guardar: abrirla aplica las migraciones pendientes
  const repo = guardar ? await import("../src/lib/db/facturacion") : null;

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(archivo);
  const codigoACampania = new Map((await listadoCampanias()).map((c) => [c.codigo, c.shortname]));
  const autor = `importación ${basename(archivo)}`.slice(0, 120);
  console.log(`${basename(archivo)} · ${guardar ? (reemplazar ? "GUARDAR (reemplazando)" : "GUARDAR") : "solo ver (sin --guardar)"}\n`);

  if (todos || tiene("ddis")) {
    const { ddis, avisos } = leerDdis(libro, codigoACampania);
    const porEstado = new Map<string, number>();
    for (const d of ddis) porEstado.set(d.estado, (porEstado.get(d.estado) ?? 0) + 1);
    console.log(`DDIs: ${ddis.length} asignaciones (${[...porEstado].map(([e, n]) => `${e} ${n}`).join(", ")})`);
    // Mismo número activo dos veces a la vez: no debería pasar
    const porNumero = new Map<string, typeof ddis>();
    for (const d of ddis) porNumero.set(d.numero, [...(porNumero.get(d.numero) ?? []), d]);
    const choques = [...porNumero].filter(([, l]) => l.some((a, i) => l.some((b, j) => i < j && seSolapan(a, b))));
    if (choques.length > 0) console.log(`  ⚠ ${choques.length} números activos en dos campañas a la vez: ${choques.map(([n]) => n).slice(0, 10).join(", ")}`);
    // Cuota del mes pasado, para comparar con el Excel
    const hoy = new Date();
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ini = `${mesPasado.getFullYear()}-${String(mesPasado.getMonth() + 1).padStart(2, "0")}-01`;
    const cuota = ddisFacturables(ddis, ini, ini);
    console.log(`  Cuota de ${ini.slice(0, 7)}: ${[...cuota.values()].reduce((a, b) => a + b, 0)} DDIs en ${cuota.size} campañas`);
    for (const a of avisos.slice(0, 15)) console.log(`  · ${a}`);
    if (avisos.length > 15) console.log(`  · … y ${avisos.length - 15} avisos más`);
    if (guardar) {
      const previos = repo!.importarDdis(ddis, reemplazar, autor);
      console.log(`  ✓ guardados (${previos} previos ${reemplazar ? "sustituidos" : ""})`);
    }
    console.log();
  }

  if (todos || tiene("gs")) {
    const { campanias, avisos } = leerCampaniasGs(libro, codigoACampania);
    console.log(`Códigos de GS: ${campanias.length} campañas`);
    for (const c of campanias) console.log(`  ${c.campaignShortname.padEnd(22)} ${c.codigoGs}  ${c.denominacion ?? ""}`);
    for (const a of avisos) console.log(`  · ${a}`);
    if (guardar) {
      const previos = repo!.importarCampaniasGs(campanias, reemplazar, autor);
      console.log(`  ✓ guardados (${previos} previos ${reemplazar ? "sustituidos" : ""})`);
    }
    console.log();
  }

  if (todos || tiene("historico")) {
    const filas = leerFacturacionCerrada(libro);
    const meses = [...new Set(filas.map((f) => f.mes))].sort();
    console.log(`Histórico «facturacion cerrada» (${servicio}): ${meses.length} meses, ${meses[0]} → ${meses.at(-1)}`);
    for (const mes of meses) {
      const delMes = filas.filter((f) => f.mes === mes);
      const lineas = lineasDeFilasCerradas(delMes);
      const total = lineas.reduce((a, l) => a + (l.importe ?? 0), 0);
      const totalExcel = delMes.reduce((a, f) => a + (f.total ?? 0), 0);
      const cuadra = Math.abs(total - totalExcel) < 0.005 ? "" : `  ⚠ el Excel suma ${eur(totalExcel)} en «Totalidad»`;
      let resultado = "";
      if (guardar) resultado = ` → ${repo!.importarCierreExcel(mes, servicio, lineas, reemplazar)}`;
      console.log(`  ${mes}  ${String(delMes.length).padStart(3)} campañas  ${eur(total).padStart(14)}${cuadra}${resultado}`);
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
