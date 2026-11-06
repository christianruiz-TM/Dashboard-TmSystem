import type { BaseResultados } from "@/lib/rdb/types";
import type { ActividadDiaCampania } from "@/lib/rdb/queries/ratios-exito";
import type { HorasUsuarioDia, LlamadasDiaCampania } from "@/lib/rdb/queries/mi-servicio";
import { compararTexto } from "@/lib/orden";
import { filtrarPorTipo, opcionesTipo, SIN_VALOR, tipoDeCampania, type TipoCampania } from "@/lib/resultados-actividad";
import type { DatosMiServicio, FilaMiServicio, FilaResultadoMiServicio, OpcionTipoMiServicio } from "./tipos";

// ============================================================
// Arma los datos de «Mi servicio» con lo que devuelven las consultas. PURO
// (con tests): lo llama servidor.ts, que hace las consultas.
// ============================================================

export interface EntradaMiServicio {
  servicio: string;
  desde: string;
  hasta: string;
  generado: string;
  tipos: TipoCampania[];
  filtro: { tipo: string | null; campania: string | null };
  llamadas: LlamadasDiaCampania[];
  actividad: ActividadDiaCampania[];
  resultados: BaseResultados;
  configurado: boolean;
  /**
   * Horas logadas (caja 1) y los usuarios que cuentan en ella; null con un
   * filtro de tipo o de campaña (entonces van las de la ficha abierta).
   */
  horas: { total: number; usuarios: string[]; porUsuarioDia: HorasUsuarioDia[] } | null;
}

export function armarDatosMiServicio(e: EntradaMiServicio): { datos: DatosMiServicio; cerrados: number } {
  const filas = new Map<string, FilaMiServicio>();
  const fila = (c: string, f: string) => {
    const clave = `${c}|${f}`;
    let x = filas.get(clave);
    if (!x) {
      x = { c, f, ll: 0, ge: 0, ex: 0, gu: 0, fi: 0, fe: 0, nv: 0 };
      filas.set(clave, x);
    }
    return x;
  };
  for (const l of e.llamadas) fila(l.campania, l.fecha).ll += l.llamadas;
  for (const a of e.actividad) {
    const x = fila(a.campania, a.fecha);
    x.ge += a.gestionadas;
    x.ex += a.exitos;
    x.gu += a.guionSeg / 3600;
  }

  // Resultados: solo los tipificados por un agente (los finalizados de la caja 3)
  let cerrados = 0;
  const resultados = new Map<string, FilaResultadoMiServicio>();
  const texto = (codigo: number | null | undefined) =>
    codigo == null ? null : (e.resultados.textos[codigo] ?? `#${codigo}`);
  for (const r of e.resultados.filas) {
    cerrados += r.contactos;
    if (r.categoria !== "tipificado" || r.agente == null) continue;
    const x = fila(r.campania, r.fecha);
    const nv = e.configurado ? r.noValidos : 0;
    x.fi += r.contactos;
    x.fe += r.exitos;
    x.nv += nv;
    if (!e.configurado) continue;
    const r1 = texto(r.codigos[0]) ?? SIN_VALOR;
    const r2 = texto(r.codigos[1]);
    const clave = `${r.campania}|${r1}|${r2 ?? ""}`;
    const d = resultados.get(clave) ?? { c: r.campania, r1, r2, n: 0, fe: 0, nv: 0 };
    d.n += r.contactos;
    d.fe += r.exitos;
    d.nv += nv;
    resultados.set(clave, d);
  }

  // Campañas con algún dato, de la A a la Z (04/11/2026)
  const conDatos = new Set<string>();
  for (const x of filas.values()) {
    if (x.ll || x.ge || x.ex || x.gu || x.fi) conDatos.add(x.c);
  }
  const nombres = [...conDatos].sort(compararTexto);

  // Botones de tipo del informe, solo con las campañas que lleva
  const opciones: OpcionTipoMiServicio[] = opcionesTipo(e.tipos)
    .map((o) => ({ etiqueta: o.etiqueta, campanias: filtrarPorTipo(nombres, e.tipos, o.valor) }))
    .filter((o, i, todas) => o.campanias.length > 0 && (i === 0 || o.campanias.length < todas[0].campanias.length));

  // Horas logadas por día: las de los usuarios que cuentan en la caja 1
  let horas: DatosMiServicio["horas"] = null;
  if (e.horas) {
    const cuentan = new Set(e.horas.usuarios);
    const dia: Record<string, number> = {};
    for (const h of e.horas.porUsuarioDia) {
      if (cuentan.has(h.agente)) dia[h.fecha] = (dia[h.fecha] ?? 0) + h.horas;
    }
    horas = { total: e.horas.total, dia };
  }

  const datos: DatosMiServicio = {
    servicio: e.servicio,
    desde: e.desde,
    hasta: e.hasta,
    generado: e.generado,
    campanias: nombres.map((nombre) => ({ nombre, tipo: tipoDeCampania(nombre, e.tipos) })),
    opcionesTipo: opciones.length > 1 ? opciones : [],
    filtro: e.filtro,
    configurado: e.configurado,
    niveles: e.resultados.niveles[e.servicio] ?? [],
    filas: [...filas.values()]
      .filter((x) => conDatos.has(x.c))
      .sort((a, b) => a.f.localeCompare(b.f) || compararTexto(a.c, b.c)),
    resultados: [...resultados.values()],
    horas,
  };
  return { datos, cerrados };
}
