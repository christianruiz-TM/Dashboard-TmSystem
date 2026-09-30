/**
 * Agregados propios del módulo de planificación (SQLite), para que el motor
 * y el tablero no consulten RDBv2 en caliente:
 *   agg_hora_servicio    ← demandaPorFranja     (franjas de 30 min)
 *   agg_sesion_usuario   ← islasSesionUsuario   (unión de sesiones por usuario)
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
 * abiertas).
 */
import { addDays, format, parseISO } from "date-fns";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sumarDias = (f: string, n: number) => format(addDays(parseISO(f), n), "yyyy-MM-dd");
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

async function medir<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const r = await fn();
  return [r, Date.now() - t];
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const q = await import("../src/lib/rdb/queries/planificacion");
  const repo = await import("../src/lib/planificacion/repositorio");
  const { leerParametrosPlan } = await import("../src/lib/planificacion/parametros");
  const { guardarAjuste } = await import("../src/lib/db/settings");
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
  const p = leerParametrosPlan();
  console.log(`Agregados de planificación ${desde} → ${hasta}${esMock() ? " (MODO DEMO: datos ficticios)" : ""}`);

  let maxMs = 0;
  let maxConsulta = "";
  const totales = { demanda: 0, sesiones: 0, cierres: 0 };
  const inicioTotal = Date.now();
  for (let inicio = desde; inicio <= hasta; ) {
    const fin = sumarDias(inicio, 6) > hasta ? hasta : sumarDias(inicio, 6);
    const [demanda, tDem] = await medir(() => q.demandaPorFranja(inicio, fin, p.maxSegHilo));
    const [islas, tIsl] = await medir(() => q.islasSesionUsuario(inicio, fin));
    const [cierres, tCie] = await medir(() => q.cierresPorDia(inicio, fin));
    repo.reemplazarDemanda(inicio, fin, demanda);
    repo.reemplazarSesiones(inicio, fin, islas);
    repo.reemplazarCierres(inicio, fin, cierres);
    for (const [ms, nombre] of [[tDem, "demanda"], [tIsl, "sesiones"], [tCie, "cierres"]] as const) {
      if (ms > maxMs) {
        maxMs = ms;
        maxConsulta = `${nombre} ${inicio}`;
      }
    }
    totales.demanda += demanda.length;
    totales.sesiones += islas.length;
    totales.cierres += cierres.length;
    console.log(
      `  ${inicio} → ${fin}: demanda ${demanda.length} (${seg(tDem)}) · sesiones ${islas.length} (${seg(tIsl)}) · cierres ${cierres.length} (${seg(tCie)})`,
    );
    inicio = sumarDias(fin, 1);
  }
  console.log(`  consulta más lenta: ${maxConsulta} (${seg(maxMs)}) · total ${seg(Date.now() - inicioTotal)}`);

  if (!process.argv.includes("--sin-foto")) {
    const [usuarios, tUsr] = await medir(() => q.usuariosAgente());
    const sinc = repo.sincronizarUsuarios(usuarios);
    console.log(`  usuarios de agente: ${sinc.usuarios} sincronizados, ${sinc.agentesNuevos} agentes nuevos (${seg(tUsr)})`);
    const patrones = [...new Set(repo.leerClientes().flatMap((c) => c.campanias ?? []))];
    const [listas, tLis] = await medir(() => q.estadoListas(patrones));
    repo.guardarFotoListas(hoyISO(), listas);
    console.log(`  foto de listas del ${hoyISO()}: ${listas.length} campañas (${seg(tLis)})`);
  }

  guardarAjuste("planificacion.ultima_agregacion", new Date().toISOString());
  console.log(
    `✔ Agregados: ${totales.demanda} franjas de demanda, ${totales.sesiones} islas de sesión, ${totales.cierres} filas de cierres`,
  );
  process.exit(0); // cerrar el pool de mssql sin esperar al idle timeout
}

main().catch((err) => {
  console.error("Error en los agregados de planificación:", err);
  process.exit(1);
});
