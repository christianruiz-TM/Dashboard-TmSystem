// NOTA: solo servidor. Estimación de fin de las campañas salientes para la
// página de bolsas: lee la última foto de listas, los cierres diarios y las
// sesiones (agregados propios de SQLite) y lo planificado en las versiones
// vigentes; el cálculo es puro (motor/estimacion.ts). No consulta RDBv2.
import { ayerISO, hoyISO } from "@/lib/fechas";
import { leerEquipo } from "./equipo";
import {
  asignarCampanias,
  campaniasDesdeCierres,
  cierresNecesarios,
  coincideLike,
  esquemaParametrosCliente,
  estimarFinCampania,
  laborablesEntre,
  patronesSimilares,
  sumarDias,
  type CampaniaHistorica,
  type EntradaMotor,
  type EstimacionFin,
} from "./motor";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";

/** Días de historia de cierres que se leen (las campañas parecidas del año anterior). */
const DIAS_HISTORIA = 450;
/** Laborables recientes para el ritmo de cierres. */
const LABORABLES_RECIENTES = 10;

export interface EstimacionCliente {
  cliente: string;
  fechaDatos: string;
  /** Campañas en curso del cliente (las de sus patrones con cierres). */
  enCurso: CampaniaHistorica[];
  foto: { fecha: string; total: number; vivos: number; pctObjetivo: number } | null;
  /** Patrones con que se buscaron las campañas parecidas y si son los fijados a mano. */
  patronesSimilares: string[];
  similaresManuales: boolean;
  contrato: { horas: number; inicio: string; consumidas: number } | null;
  estimacion: EstimacionFin;
}

/**
 * Estimaciones de los clientes `objetivo` del equipo, con los datos cerrados
 * hasta ayer (o hasta el último agregado, si va por detrás). `entrada` es la
 * foto de la versión que se está viendo: de ahí sale el ritmo de cierre por
 * hora y los festivos del mes.
 */
export function estimacionesFin(entrada: EntradaMotor | null): EstimacionCliente[] {
  const p = leerParametrosPlan();
  const ultimo = repo.ultimoAgregado();
  const ayer = ayerISO();
  const fechaDatos = ultimo && ultimo < ayer ? ultimo : ayer;
  const festivos = new Set(
    (entrada?.dias ?? []).filter((d) => d.festivos.includes(p.servicioCalendario)).map((d) => d.fecha),
  );
  const filas = repo.leerClientes(p.equipo);
  const reparto = asignarCampanias(
    repo.campaniasConocidas(),
    filas.map((c) => ({ codigo: c.codigo, campanias: c.campanias ?? [] })),
  );
  const duenoDe = new Map<string, string>();
  for (const [codigo, lista] of reparto) for (const camp of lista) duenoDe.set(camp, codigo);
  const cierres = repo.cierresRango(sumarDias(fechaDatos, -DIAS_HISTORIA), fechaDatos);
  const campanias = campaniasDesdeCierres(cierres, fechaDatos, festivos);
  const foto = repo.fotoListas(hoyISO());

  // Ventana de los últimos laborables (para el ritmo reciente)
  let inicioVentana = fechaDatos;
  for (let f = fechaDatos, n = 0; n < LABORABLES_RECIENTES; f = sumarDias(f, -1)) {
    if (laborablesEntre(f, f, festivos) === 1) {
      n++;
      inicioVentana = f;
    }
  }
  const sinEstado = (x: CampaniaHistorica): CampaniaHistorica => ({
    campania: x.campania,
    inicio: x.inicio,
    fin: x.fin,
    cierres: x.cierres,
    laborables: x.laborables,
  });

  const eq = leerEquipo(p.equipo, fechaDatos);
  const horasCliente = (cliente: string, desde: string, hasta: string) => {
    let s = 0;
    for (const f of repo.segundosSesionPorUsuarioDia(desde, hasta)) {
      if (eq.clienteDeUsuario.get(f.usrName) === cliente) s += f.segundos;
    }
    return s / 3600;
  };

  const resultado: EstimacionCliente[] = [];
  for (const c of filas.filter((x) => x.modo === "objetivo")) {
    const r = esquemaParametrosCliente.safeParse(c.parametros ?? {});
    if (!r.success) continue;
    const pc = r.data;
    const actuales = new Set(reparto.get(c.codigo) ?? []);
    const enCurso = campanias.filter((x) => actuales.has(x.campania));

    // Lista: la última foto, con el % de vivos con que se da por acabada
    let datosFoto: EstimacionCliente["foto"] = null;
    if (foto) {
      const suyas = foto.filas.filter((f) => actuales.has(f.campania));
      if (suyas.length > 0) {
        datosFoto = {
          fecha: foto.fecha,
          total: suyas.reduce((a, f) => a + f.total, 0),
          vivos: suyas.reduce((a, f) => a + f.vivos, 0),
          pctObjetivo: pc.pctVivosObjetivo,
        };
      }
    }
    const pendientes = datosFoto ? cierresNecesarios(datosFoto.total, datosFoto.vivos, datosFoto.pctObjetivo) : null;

    // Ritmo por hora: el manual, o el del objetivo de la versión que se ve
    const delObjetivo = entrada?.objetivos.find((o) => o.cliente === c.codigo)?.detalle?.ritmo;
    const ritmoHora = pc.ritmoManual ?? (typeof delObjetivo === "number" ? delObjetivo : null);

    // Ritmo de cierres reciente: últimos laborables, desde que empezó la campaña
    const recientes = cierres.filter((x) => actuales.has(x.campania) && x.fecha >= inicioVentana && x.fecha <= fechaDatos);
    const inicioCampania = enCurso.map((x) => x.inicio).sort()[0];
    const desdeRitmo = inicioCampania && inicioCampania > inicioVentana ? inicioCampania : inicioVentana;

    // Campañas parecidas ya terminadas (que no sean de otro cliente)
    const manuales = pc.campaniasSimilares.length > 0;
    const { principales, amplios } = patronesSimilares(c.campanias ?? []);
    const buscar = (patrones: readonly string[]) =>
      campanias.filter(
        (x) =>
          x.terminada &&
          !actuales.has(x.campania) &&
          (duenoDe.get(x.campania) ?? c.codigo) === c.codigo &&
          patrones.some((pat) => coincideLike(x.campania, pat)),
      );
    let patrones = manuales ? pc.campaniasSimilares : principales;
    let similares = buscar(patrones);
    if (!manuales && similares.length === 0 && amplios.length > 0) {
      patrones = amplios;
      similares = buscar(amplios);
    }

    // Lo planificado de aquí en adelante (versiones vigentes de los próximos meses)
    const horasPlan = Object.fromEntries(
      repo.horasPlanificadasCliente(c.codigo, sumarDias(fechaDatos, 1), sumarDias(fechaDatos, 200)),
    );

    let contrato: EstimacionCliente["contrato"] = null;
    if (pc.horasContratadas != null && pc.inicioContrato != null) {
      contrato = {
        horas: pc.horasContratadas,
        inicio: pc.inicioContrato,
        consumidas: pc.inicioContrato <= fechaDatos ? horasCliente(c.codigo, pc.inicioContrato, fechaDatos) : 0,
      };
    }

    resultado.push({
      cliente: c.codigo,
      fechaDatos,
      enCurso: enCurso.map(sinEstado),
      foto: datosFoto,
      patronesSimilares: patrones,
      similaresManuales: manuales,
      contrato,
      estimacion: estimarFinCampania({
        fechaDatos,
        festivos,
        cierresPendientes: pendientes,
        ritmoHora,
        cierresRecientes: recientes.reduce((a, x) => a + x.cierres, 0),
        laborablesRecientes: desdeRitmo <= fechaDatos ? laborablesEntre(desdeRitmo, fechaDatos, festivos) : 0,
        similares: similares.map(sinEstado),
        horasPlan,
        contrato: contrato ? { horas: contrato.horas, consumidas: contrato.consumidas } : null,
      }),
    });
  }
  return resultado;
}
