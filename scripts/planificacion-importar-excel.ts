/**
 * Importa la plantilla Excel con la que supervisión planificaba a mano
 * (p. ej. «Septiembre V1.xlsx») como versión PUBLICADA del mes, para tener
 * esos meses en el módulo y medir su adherencia.
 *
 * Uso:
 *   npm run planificacion:importar-excel -- --archivo "C:\ruta\Septiembre V1.xlsx" --mes 2026-09
 *   ... --guardar                  la guarda (sin esto solo muestra qué saldría)
 *   ... --guardar --reemplazar     si el mes ya tiene publicada, la deja «sustituida»
 *   ... --sin-ausencias            no da de alta las vacaciones, RTO y festivos de la plantilla
 *
 * El cliente de cada hora sale del COLOR de la celda (COLORES_PLANTILLA en
 * src/lib/planificacion/importar-excel.ts). Los colores desconocidos se
 * listan y no se importan.
 */
import { basename } from "node:path";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tiene = (nombre: string) => process.argv.includes(`--${nombre}`);
const h = (x: number) => x.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const archivo = argumento("archivo");
  const mes = argumento("mes");
  if (!archivo || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    console.error(
      'Uso: npm run planificacion:importar-excel -- --archivo "ruta.xlsx" --mes YYYY-MM [--guardar [--reemplazar]] [--sin-ausencias]',
    );
    process.exit(1);
  }
  const { leerPlantillaExcel, unirHoras } = await import("../src/lib/planificacion/importar-excel");
  const { cargarEntradaMotor } = await import("../src/lib/planificacion/cargador");
  const { generarPlan, calcularMinimos, construirContexto, validarPlan } = await import("../src/lib/planificacion/motor");
  const { actualizarResumen } = await import("../src/lib/planificacion/edicion");
  const { contarGravedades } = await import("../src/lib/planificacion/tablero");
  const repo = await import("../src/lib/planificacion/repositorio");
  const { format, subDays, parseISO } = await import("date-fns");

  const celdas = await leerPlantillaExcel(archivo, mes);
  if (celdas.length === 0) {
    console.error(`No hay ningún día de ${mes} en ${archivo}`);
    process.exit(1);
  }

  // Colores sin significado: se avisan con dónde están
  const desconocidas = celdas.filter((c) => !c.significado);
  const porColor = new Map<string, string[]>();
  for (const c of desconocidas) porColor.set(c.color, [...(porColor.get(c.color) ?? []), `${c.agenteNumero} ${c.fecha} ${c.hora}h`]);

  const bloques = unirHoras(celdas, "cliente");
  const tramosAusencia = unirHoras(celdas, "ausencia");

  // Agentes, clientes y tipos de ausencia tienen que existir en la configuración
  const agentes = new Set(repo.leerAgentes().map((a) => a.numero));
  const clientes = new Set(repo.leerClientes().map((c) => c.codigo));
  const tipos = new Set(repo.leerTiposAusencia().map((t) => t.codigo));
  const faltan = [
    ...[...new Set(bloques.map((b) => b.agenteNumero).concat(tramosAusencia.map((a) => a.agenteNumero)))]
      .filter((a) => !agentes.has(a))
      .map((a) => `agente ${a}`),
    ...[...new Set(bloques.map((b) => b.codigo))].filter((c) => !clientes.has(c)).map((c) => `cliente ${c}`),
    ...[...new Set(tramosAusencia.map((a) => a.codigo))].filter((t) => !tipos.has(t)).map((t) => `tipo de ausencia ${t}`),
  ];
  if (faltan.length > 0) {
    console.error(`Falta en la configuración de planificación: ${faltan.join(", ")}`);
    process.exit(1);
  }

  // Foto de la entrada como si se hubiera generado el día 1 (datos hasta el último del mes anterior)
  const hastaDatos = format(subDays(parseISO(`${mes}-01`), 1), "yyyy-MM-dd");
  const entrada = await cargarEntradaMotor(mes, { hastaDatos });
  const basicos = bloques.map((b) => ({
    agenteNumero: b.agenteNumero,
    fecha: b.fecha,
    inicioMin: b.inicioMin,
    finMin: b.finMin,
    clienteCodigo: b.codigo,
  }));
  const avisos = validarPlan(basicos, construirContexto(entrada, calcularMinimos(entrada)));
  const resumen = actualizarResumen(generarPlan(entrada).resumen, basicos);

  console.log(`Plantilla ${basename(archivo)} · ${mes} · ${new Set(celdas.map((c) => c.fecha)).size} días · ${new Set(celdas.map((c) => c.agenteNumero)).size} agentes`);
  console.log(`${bloques.length} bloques, ${h(resumen.planificadoH)} h planificadas · ${tramosAusencia.length} tramos de ausencia`);
  console.table(
    resumen.clientes
      .filter((c) => c.horas > 0)
      .map((c) => ({ cliente: c.codigo, ...Object.fromEntries(Object.entries(c.porSemana).map(([l, x]) => [l.slice(5), x])), mes: c.horas })),
  );
  console.table(
    resumen.agentes
      .filter((a) => a.horas > 0)
      .map((a) => ({ agente: a.numero, horas: a.horas, ...a.porCliente })),
  );
  const ausH = new Map<string, number>();
  for (const a of tramosAusencia) ausH.set(a.codigo, (ausH.get(a.codigo) ?? 0) + (a.finMin - a.inicioMin) / 60);
  console.log(`Ausencias (h): ${[...ausH].map(([t, x]) => `${t} ${h(x)}`).join(" · ") || "ninguna"}`);
  for (const [color, donde] of porColor) {
    console.log(`Color sin significado ${color} (${donde.length} h, no se importa): ${donde.slice(0, 8).join(", ")}${donde.length > 8 ? "…" : ""}`);
  }
  const g = contarGravedades(avisos);
  console.log(`Validaciones: ${g.dura} duras, ${g.blanda} blandas, ${g.info} informativas`);
  for (const a of avisos.filter((x) => x.gravedad === "dura").slice(0, 10)) console.log(`  · ${a.mensaje}`);

  if (!tiene("guardar")) {
    console.log("\nSin --guardar: no se ha escrito nada.");
    return;
  }
  const r = repo.importarVersion({
    mes,
    entrada,
    bloques: basicos,
    avisos,
    resumen,
    archivo: basename(archivo),
    autor: "importación Excel",
    ahora: new Date(),
    reemplazar: tiene("reemplazar"),
    ausencias: tiene("sin-ausencias")
      ? []
      : tramosAusencia.map((a) => ({
          agenteNumero: a.agenteNumero,
          tipoCodigo: a.codigo,
          desde: a.fecha,
          hasta: a.fecha,
          inicioMin: a.inicioMin,
          finMin: a.finMin,
          notas: `Plantilla ${basename(archivo)}`,
          creadoPor: "importación Excel",
        })),
  });
  console.log(
    `\nGuardada como v${r.numero} publicada de ${mes}${r.sustituida ? ` (sustituye a la v${r.sustituida})` : ""}; ${r.ausencias} ausencias nuevas.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
