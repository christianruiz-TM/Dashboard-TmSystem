/**
 * Genera el borrador de un mes con el motor y muestra el resumen y los avisos.
 *
 * Uso:
 *   npm run planificacion:generar -- --mes 2026-11
 *   ... --hasta-datos 2026-09-28   datos hasta ese día (por defecto, ayer)
 *   ... --guardar                  lo guarda como borrador (falla si ya hay uno)
 *   ... --guardar --reemplazar     descarta el borrador existente y crea otro
 *
 * Sin --guardar no escribe nada: sirve para ver qué saldría.
 */
export {};

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const h = (x: number) => x.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const mes = argumento("mes");
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    console.error("Uso: npm run planificacion:generar -- --mes YYYY-MM [--hasta-datos YYYY-MM-DD] [--guardar [--reemplazar]]");
    process.exit(1);
  }
  const { cargarEntradaMotor } = await import("../src/lib/planificacion/cargador");
  const { generarPlan } = await import("../src/lib/planificacion/motor");
  const repo = await import("../src/lib/planificacion/repositorio");
  const { esMock } = await import("../src/lib/rdb/pool");

  let t = Date.now();
  const entrada = await cargarEntradaMotor(mes, { hastaDatos: argumento("hasta-datos") });
  const tCarga = Date.now() - t;
  t = Date.now();
  const salida = generarPlan(entrada);
  const tMotor = Date.now() - t;

  const r = salida.resumen;
  console.log(
    `Plan de ${mes}${esMock() ? " (MODO DEMO)" : ""} · datos hasta ${entrada.fechaDatos} · carga ${tCarga} ms · motor ${tMotor} ms`,
  );
  console.log(
    `Capacidad ${h(r.capacidadH)} h · planificado ${h(r.planificadoH)} h · ${salida.bloques.length} bloques · ${entrada.agentes.length} agentes en plantilla`,
  );

  console.log("\nHoras por cliente y semana:");
  console.table(
    r.clientes.map((c) => ({
      cliente: c.codigo,
      ...Object.fromEntries(r.semanas.map((s) => [`${s.lunes.slice(8)}/${s.lunes.slice(5, 7)} ${s.rotacion}`, c.porSemana[s.lunes]])),
      mes: c.horas,
      objetivo: c.objetivo ?? "",
      bolsa: c.bolsa != null ? h(c.bolsa) : "",
    })),
  );

  console.log("Objetivos semanales (h):");
  console.table(
    [...new Set(entrada.objetivos.map((o) => o.cliente))].map((cliente) => {
      const filas = entrada.objetivos.filter((o) => o.cliente === cliente);
      const d = (filas[0]?.detalle ?? {}) as Record<string, unknown>;
      return {
        cliente,
        ...Object.fromEntries(filas.map((o) => [o.semanaLunes.slice(5), o.horas])),
        vivos: d.vivos ?? "",
        total: d.total ?? "",
        ritmo: d.ritmo ?? "",
        criterio: d.criterio ?? "",
      };
    }),
  );

  console.log("Horas por agente:");
  console.table(
    r.agentes.map((a) => ({
      agente: a.numero,
      activo: a.activo ? "sí" : "no",
      capacidad: a.capacidadH,
      plan: a.horas,
      contratoMes: a.contratoMesH ?? "",
      ...a.porCliente,
    })),
  );

  const minimos = salida.minimos.filter((m) => m.cliente === entrada.clienteBase && m.porFranja.some((x) => x > 0));
  const valores = minimos.flatMap((m) => m.porFranja.filter((x) => x > 0));
  if (valores.length > 0) {
    console.log(`Mínimo ${entrada.clienteBase} por franja: de ${Math.min(...valores)} a ${Math.max(...valores)} agentes`);
  }

  const porCodigo = new Map<string, typeof salida.avisos>();
  for (const a of salida.avisos) porCodigo.set(`${a.gravedad}:${a.codigo}`, [...(porCodigo.get(`${a.gravedad}:${a.codigo}`) ?? []), a]);
  console.log(`\nAvisos (${salida.avisos.length}):`);
  for (const [clave, lista] of [...porCodigo.entries()].sort()) {
    console.log(`  [${clave}] ×${lista.length}`);
    for (const a of lista.slice(0, 5)) console.log(`     - ${a.mensaje}`);
    if (lista.length > 5) console.log(`     … y ${lista.length - 5} más`);
  }

  if (process.argv.includes("--guardar")) {
    const v = repo.crearBorrador({
      mes,
      entrada,
      salida,
      autor: "script",
      reemplazar: process.argv.includes("--reemplazar"),
    });
    console.log(`\n✔ Guardado como borrador v${v.numero} (id ${v.id})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error generando el plan:", err instanceof Error ? err.message : err);
  process.exit(1);
});
