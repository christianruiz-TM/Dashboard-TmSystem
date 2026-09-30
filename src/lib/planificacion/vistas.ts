// NOTA: solo servidor. Lo que leen las pantallas de /planificacion. Todo sale
// de SQLite: el tablero no consulta RDBv2 (solo «Generar», vía el cargador,
// lee festivos y horarios, cacheados 24 h).
import { format } from "date-fns";
import { ayerISO, hoyISO } from "@/lib/fechas";
import type { PlanVersionRow } from "@/lib/db/schema";
import { fueraDePlantilla, leerEquipo, nombresAgentes, prefijosSinCliente, ultimaSesionAgente } from "./equipo";
import {
  CODIGOS_VALIDACION,
  desplazarMes,
  expandirAusencias,
  sumarDias,
  type Aviso,
  type EntradaMotor,
  type Gravedad,
  type ResumenMotor,
} from "./motor";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";
import { contarGravedades, type DatosTablero, type VersionTablero } from "./tablero";

/** Fecha y hora LOCALES (nunca toISOString: daría UTC, regla 14). */
const fechaHora = (d: Date | null) => (d ? format(d, "dd/MM/yyyy HH:mm") : null);

/** Meses para los que se puede generar un borrador: el actual y los tres siguientes. */
export function mesesGenerables(hoy = hoyISO()): string[] {
  const actual = hoy.slice(0, 7);
  return [0, 1, 2, 3].map((n) => desplazarMes(actual, n));
}

export interface ResumenVersion {
  id: number;
  numero: number;
  estado: PlanVersionRow["estado"];
  creadaPor: string | null;
  creadaAt: string;
  publicadaAt: string | null;
  planificadoH: number | null;
  avisos: Record<Gravedad, number>;
  /** Bloques fijados o editados a mano (los que «regenerar respetando mis cambios» conserva). */
  conservables: number;
}

export interface FilaMes {
  mes: string;
  borrador: ResumenVersion | null;
  publicada: ResumenVersion | null;
  /** Nº total de versiones del mes (también sustituidas y descartadas). */
  versiones: number;
  generable: boolean;
}

/** Meses con plan y los que se pueden generar, del más reciente al más antiguo. */
export function resumenMeses(): FilaMes[] {
  const versiones = repo.listarVersiones();
  const generables = mesesGenerables();
  const meses = [...new Set([...generables, ...versiones.map((v) => v.mes)])].sort().reverse();
  const resumir = (v: (typeof versiones)[number] | undefined): ResumenVersion | null =>
    v
      ? {
          id: v.id,
          numero: v.numero,
          estado: v.estado,
          creadaPor: v.creadaPor,
          creadaAt: fechaHora(v.creadaAt)!,
          publicadaAt: fechaHora(v.publicadaAt),
          planificadoH: (v.resumen as ResumenMotor | null)?.planificadoH ?? null,
          avisos: contarGravedades((v.avisos as Aviso[] | null) ?? []),
          conservables: v.estado === "borrador" ? repo.bloquesConservables(v.id).length : 0,
        }
      : null;
  return meses.map((mes) => {
    const delMes = versiones.filter((v) => v.mes === mes);
    return {
      mes,
      borrador: resumir(delMes.find((v) => v.estado === "borrador")),
      publicada: resumir(delMes.find((v) => v.estado === "publicada")),
      versiones: delMes.length,
      generable: generables.includes(mes),
    };
  });
}

export interface EstadoEntrada {
  fechaDatos: string;
  ultimoAgregado: string | null;
  /** Los agregados no llegan a ayer: el plan saldría con datos viejos. */
  caducados: boolean;
  diasInactividad: number;
  prefijosSinCliente: ReturnType<typeof prefijosSinCliente>;
  fueraDePlantilla: (ReturnType<typeof fueraDePlantilla>[number] & { nombre: string | null })[];
  inactivos: { numero: string; nombre: string | null; ultimaSesion: string | null }[];
  sinTurno: { numero: string; nombre: string | null }[];
}

/**
 * Avisos de entrada ANTES de generar: los mismos criterios que el cargador y
 * el motor (datos caducados, prefijos nuevos, inactivos, fuera de plantilla),
 * más los agentes de plantilla sin turno vigente.
 */
export function estadoEntrada(): EstadoEntrada {
  const p = leerParametrosPlan();
  const fechaDatos = ayerISO();
  const eq = leerEquipo(p.equipo, fechaDatos);
  const nombres = nombresAgentes(eq);
  const codigos = new Set(repo.leerClientes(p.equipo).map((c) => c.codigo));
  const ultimoAgregado = repo.ultimoAgregado();
  const limiteInactivo = sumarDias(fechaDatos, -p.diasInactividad);
  const hoy = hoyISO();
  const conTurno = new Set(
    repo
      .leerAsignacionesTurno()
      .filter((t) => (t.hasta == null || t.hasta >= hoy) && (t.patronAId != null || t.patronBId != null))
      .map((t) => t.agenteNumero),
  );
  return {
    fechaDatos,
    ultimoAgregado,
    caducados: ultimoAgregado == null || ultimoAgregado < fechaDatos,
    diasInactividad: p.diasInactividad,
    prefijosSinCliente: prefijosSinCliente(eq, p.diasInactividad),
    fueraDePlantilla: fueraDePlantilla(eq, p.diasInactividad, codigos).map((f) => ({
      ...f,
      nombre: nombres.get(f.agenteNumero) ?? null,
    })),
    inactivos: eq.plantilla
      .filter((a) => !a.forzarActivo)
      .map((a) => ({ numero: a.numero, nombre: nombres.get(a.numero) ?? null, ultimaSesion: ultimaSesionAgente(eq, a.numero) }))
      .filter((a) => a.ultimaSesion == null || a.ultimaSesion < limiteInactivo),
    sinTurno: eq.plantilla
      .filter((a) => !conTurno.has(a.numero))
      .map((a) => ({ numero: a.numero, nombre: nombres.get(a.numero) ?? null })),
  };
}

/**
 * Datos del tablero de un mes: la versión pedida o, si no se pide, el
 * borrador; si no hay, la publicada; si tampoco, la última. null si el mes no
 * tiene ninguna (o la pedida no es de ese mes).
 *
 * La entrada es la FOTO guardada con la versión (explica el plan aunque
 * cambien los datos), con lo vivo encima: nombre, color y orden de los
 * clientes, contrato de los agentes y ausencias.
 */
export function cargarTablero(mes: string, versionId?: number): DatosTablero | null {
  const versiones = repo.versionesMes(mes);
  const version =
    versionId != null
      ? versiones.find((v) => v.id === versionId)
      : (versiones.find((v) => v.estado === "borrador") ??
        versiones.find((v) => v.estado === "publicada") ??
        versiones[0]);
  if (!version) return null;
  const foto = version.entradas as EntradaMotor | null;
  if (!foto || foto.version !== 1) throw new Error(`La versión ${version.id} no tiene una entrada del motor válida`);

  const clientesVivos = new Map(repo.leerClientesTodos().map((c) => [c.codigo, c]));
  const agentesVivos = repo.leerAgentes();
  const porNumero = new Map(agentesVivos.map((a) => [a.numero, a]));
  const fechas = foto.dias.map((d) => d.fecha);
  const ausencias = expandirAusencias(repo.leerAusencias(fechas[0], fechas[fechas.length - 1]), foto.dias);
  const orden = (codigo: string) => clientesVivos.get(codigo)?.orden ?? Number.MAX_SAFE_INTEGER;

  const entrada: EntradaMotor = {
    ...foto,
    clientes: foto.clientes
      .map((c) => {
        const vivo = clientesVivos.get(c.codigo);
        return vivo ? { ...c, nombre: vivo.nombre, color: vivo.color } : c;
      })
      .sort((a, b) => orden(a.codigo) - orden(b.codigo) || a.codigo.localeCompare(b.codigo)),
    agentes: foto.agentes.map((a) => ({
      ...a,
      contratoSemanalH: porNumero.has(a.numero) ? porNumero.get(a.numero)!.contratoSemanalH : a.contratoSemanalH,
      ausencias: ausencias[a.numero] ?? [],
    })),
  };

  const bloques = repo.bloquesVersion(version.id).map((b) => ({
    id: b.id,
    agenteNumero: b.agenteNumero,
    fecha: b.fecha,
    inicioMin: b.inicioMin,
    finMin: b.finMin,
    clienteCodigo: b.clienteCodigo,
    regla: b.regla,
    datos: b.datos ?? {},
    fijado: b.fijado,
    origen: b.origen,
    editadoPor: b.editadoPor,
    editadoAt: fechaHora(b.editadoAt),
  }));

  const enPlan = new Set([...entrada.agentes.map((a) => a.numero), ...bloques.map((b) => b.agenteNumero)]);
  const nombres = nombresAgentes({ usuarios: repo.leerUsuarios(), agentes: agentesVivos });
  const resumen = version.resumen as ResumenMotor | null;

  const datosVersion: VersionTablero = {
    id: version.id,
    mes: version.mes,
    numero: version.numero,
    estado: version.estado,
    origen: version.origen,
    revision: version.revision,
    creadaPor: version.creadaPor,
    creadaAt: fechaHora(version.creadaAt)!,
    publicadaPor: version.publicadaPor,
    publicadaAt: fechaHora(version.publicadaAt),
  };

  return {
    version: datosVersion,
    versiones: versiones.map((v) => ({ id: v.id, numero: v.numero, estado: v.estado })),
    entrada,
    nombres: Object.fromEntries([...nombres].filter(([n]) => enPlan.has(n))),
    activos: resumen?.agentes.filter((a) => a.activo).map((a) => a.numero) ?? entrada.agentes.map((a) => a.numero),
    capacidadH: resumen?.capacidadH ?? null,
    bloques,
    avisosGeneracion: ((version.avisos as Aviso[] | null) ?? []).filter((a) => !CODIGOS_VALIDACION.has(a.codigo)),
    tiposAusencia: Object.fromEntries(repo.leerTiposAusencia().map((t) => [t.codigo, { nombre: t.nombre, color: t.color }])),
  };
}
