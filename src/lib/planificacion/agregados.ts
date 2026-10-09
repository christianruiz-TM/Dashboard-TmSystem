// NOTA: solo servidor. Agregados propios del módulo de planificación
// (SQLite), para que el motor y el tablero no consulten RDBv2 en caliente:
//   agg_hora_servicio    ← demandaPorFranja     (franjas de 30 min)
//   agg_sesion_usuario   ← islasSesionUsuario   (unión de sesiones por usuario)
//   agg_logado_usuario   ← islasLogadoUsuario   (unión de user_log por usuario: seguimiento)
//   agg_cierres_campania ← cierresPorDia        (fechados por su último evento)
// y, con `foto`, sincroniza los usuarios de agente y hace la foto de las
// listas salientes (plan_listas_estado) con la fecha de hoy.
//
// Lotes de 7 días: cada lote REEMPLAZA sus días completos, así que repetir
// un rango lo deja idéntico a RDBv2. Lo usan `npm run planificacion:agregados`
// y la tarea nocturna.
import { addDays, format, parseISO } from "date-fns";
import { guardarAjuste } from "@/lib/db/settings";
import * as q from "@/lib/rdb/queries/planificacion";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";

const sumarDias = (f: string, n: number) => format(addDays(parseISO(f), n), "yyyy-MM-dd");
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

async function medir<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const r = await fn();
  return [r, Date.now() - t];
}

export interface ResultadoAgregados {
  totales: { demanda: number; sesiones: number; logado: number; cierres: number };
  /** Consulta más lenta («logado 2026-10-05») y su duración. */
  masLenta: { consulta: string; ms: number };
  usuarios: { sincronizados: number; agentesNuevos: number } | null;
  /** Campañas de la foto de listas (null = sin foto). */
  listas: number | null;
  ms: number;
}

/** Agrega `desde`..`hasta` (días cerrados, ambos incluidos). `log` recibe una línea por lote. */
export async function agregarPlanificacion(opciones: {
  desde: string;
  hasta: string;
  /** Sincronizar usuarios y hacer la foto de listas con fecha `hoy`. */
  foto: boolean;
  hoy: string;
  log?: (linea: string) => void;
}): Promise<ResultadoAgregados> {
  const log = opciones.log ?? (() => {});
  const p = leerParametrosPlan();
  const totales = { demanda: 0, sesiones: 0, logado: 0, cierres: 0 };
  const masLenta = { consulta: "", ms: 0 };
  const inicioTotal = Date.now();
  for (let inicio = opciones.desde; inicio <= opciones.hasta; ) {
    const fin = sumarDias(inicio, 6) > opciones.hasta ? opciones.hasta : sumarDias(inicio, 6);
    const [demanda, tDem] = await medir(() => q.demandaPorFranja(inicio, fin, p.maxSegHilo));
    const [islas, tIsl] = await medir(() => q.islasSesionUsuario(inicio, fin));
    const [logado, tLog] = await medir(() => q.islasLogadoUsuario(inicio, fin));
    const [cierres, tCie] = await medir(() => q.cierresPorDia(inicio, fin));
    repo.reemplazarDemanda(inicio, fin, demanda);
    repo.reemplazarSesiones(inicio, fin, islas);
    repo.reemplazarLogado(inicio, fin, logado);
    repo.reemplazarCierres(inicio, fin, cierres);
    for (const [ms, nombre] of [[tDem, "demanda"], [tIsl, "sesiones"], [tLog, "logado"], [tCie, "cierres"]] as const) {
      if (ms > masLenta.ms) Object.assign(masLenta, { consulta: `${nombre} ${inicio}`, ms });
    }
    totales.demanda += demanda.length;
    totales.sesiones += islas.length;
    totales.logado += logado.length;
    totales.cierres += cierres.length;
    log(
      `${inicio} → ${fin}: demanda ${demanda.length} (${seg(tDem)}) · sesiones ${islas.length} (${seg(tIsl)}) · ` +
        `logado ${logado.length} (${seg(tLog)}) · cierres ${cierres.length} (${seg(tCie)})`,
    );
    inicio = sumarDias(fin, 1);
  }

  let usuarios: ResultadoAgregados["usuarios"] = null;
  let listas: number | null = null;
  if (opciones.foto) {
    const [filas, tUsr] = await medir(() => q.usuariosAgente());
    const sinc = repo.sincronizarUsuarios(filas);
    usuarios = { sincronizados: sinc.usuarios, agentesNuevos: sinc.agentesNuevos };
    log(`usuarios de agente: ${sinc.usuarios} sincronizados, ${sinc.agentesNuevos} agentes nuevos (${seg(tUsr)})`);
    const patrones = [...new Set(repo.leerClientes().flatMap((c) => c.campanias ?? []))];
    const [estado, tLis] = await medir(() => q.estadoListas(patrones));
    repo.guardarFotoListas(opciones.hoy, estado);
    listas = estado.length;
    log(`foto de listas del ${opciones.hoy}: ${estado.length} campañas (${seg(tLis)})`);
  }

  guardarAjuste("planificacion.ultima_agregacion", new Date().toISOString());
  repo.anotarAgregadoHasta(opciones.hasta);
  return { totales, masLenta, usuarios, listas, ms: Date.now() - inicioTotal };
}
