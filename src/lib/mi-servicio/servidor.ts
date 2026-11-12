import { format } from "date-fns";
import { configsResultados, tiposCampaniaDe } from "@/lib/db/resultados";
import { configuracionFacturacion, prefijoUsuariosDe } from "@/lib/facturacion";
import { facturaPorHoras } from "@/lib/facturacion-campania";
import { hoyISO } from "@/lib/fechas";
import { calcularRatiosExito, esUsuarioDelCliente } from "@/lib/ratios-exito";
import { TTL } from "@/lib/rdb/cache";
import { horasLogadasDia, llamadasDiaCampania } from "@/lib/rdb/queries/mi-servicio";
import { actividadDiariaCampania, baseRatiosRango } from "@/lib/rdb/queries/ratios-exito";
import { baseResultadosRango } from "@/lib/rdb/queries/resultados-actividad";
import { campaniasDeServicio, esIvr } from "@/lib/rdb/queries/servicios";
import { compararTexto } from "@/lib/orden";
import { filtrarPorTipo, opcionesTipo, seleccionTipo, type SeleccionTipo } from "@/lib/resultados-actividad";
import { armarDatosMiServicio, type EntradaMiServicio } from "./datos";
import type { DatosMiServicio, ExtrasInternos } from "./tipos";

// ============================================================
// Datos de «Mi servicio» de un cliente (06/11/2026): la pantalla y la
// descarga del informe llaman a lo MISMO, así que el informe lleva justo lo
// que hay en pantalla. Cliente = servicio de Altitude, sus campañas sin las
// IVR (siempre fuera) ni las de pruebas; filtros por tipo de campaña y por
// una campaña. Si el rango llega a hoy, todo con caché de 60 s (la pantalla
// se refresca cada 60 s).
//
// 12/11/2026 (pedido por Christian): un cliente con tipos de campaña (GH)
// no tiene «Todas», empieza en el primero («Sin BBDD»); con un tipo, las
// horas logadas son las de Supervisión → Resultados con ese tipo (usuarios
// del cliente que trabajaron en sus campañas); y las campañas que no se
// facturan por horas (las bbdd) no llevan horas.
// ============================================================

export interface PeticionMiServicio {
  servicio: string;
  desde: string;
  hasta: string;
  /** Tipo de campaña (?tipo=, como en Resultados): «resto» o «solo:<tipo>» («todas» sin tipos). */
  tipo?: string;
  campania?: string;
}

export interface MiServicioCargado {
  datos: DatosMiServicio;
  extras: ExtrasInternos;
  /** Opciones del filtro de tipo (vacío si el cliente no tiene tipos). */
  opcionesTipo: { valor: SeleccionTipo; etiqueta: string }[];
  tipo: SeleccionTipo;
  /** Campañas del filtro de campaña (las del tipo elegido). */
  campaniasFiltro: string[];
  campania: string | null;
  /** ¿El rango llega a hoy? (se refresca cada 60 s). */
  enVivo: boolean;
}

export async function cargarMiServicio(p: PeticionMiServicio): Promise<MiServicioCargado> {
  // Solo un servicio que exista: con uno desconocido, campaniasEfectivas daría TODAS
  const delServicio = ((await campaniasDeServicio(p.servicio)) ?? []).filter((c) => !esIvr(c));
  const tipos = tiposCampaniaDe(p.servicio);
  // Sin «Todas» si el cliente tiene tipos (12/11/2026): el primero, «Sin BBDD»
  const opciones = opcionesTipo(tipos).filter((o) => o.valor !== "todas");
  const elegido = seleccionTipo(p.tipo, tipos);
  const tipo: SeleccionTipo = elegido === "todas" && opciones.length > 0 ? opciones[0].valor : elegido;
  const campTipo = filtrarPorTipo(delServicio, tipos, tipo).sort(compararTexto);
  const campania = p.campania && campTipo.includes(p.campania) ? p.campania : null;
  const camp = campania ? [campania] : campTipo;
  // Campañas que no se facturan por horas: sin horas (las bbdd de GH)
  const factura = configuracionFacturacion();
  const sinHoras = delServicio.filter((c) => facturaPorHoras(factura, c, p.servicio) === false);
  const conHoras = camp.filter((c) => !sinHoras.includes(c));
  // Horas logadas: con el cliente entero o un tipo con horas; con una
  // campaña, las de la ficha abierta (la hora logada es de la persona)
  const logadas = campania == null && conHoras.length > 0;
  const enVivo = p.hasta >= hoyISO();
  const ttl = enVivo ? TTL.supervision : undefined;
  const prefijo = prefijoUsuariosDe(p.servicio);
  const configs = configsResultados();

  // Lista vacía = nada que consultar (en el SQL, vacía significaría «todas»)
  const hay = camp.length > 0;
  const [llamadas, actividad, resultados, base, horasDia] = await Promise.all([
    hay ? llamadasDiaCampania(p.desde, p.hasta, camp, ttl) : [],
    hay ? actividadDiariaCampania(p.desde, p.hasta, camp, ttl) : [],
    baseResultadosRango(p.desde, p.hasta, camp, configs, ttl),
    logadas ? baseRatiosRango(p.desde, p.hasta, conHoras, ttl) : null,
    logadas ? horasLogadasDia(p.desde, p.hasta, ttl) : null,
  ]);

  // Horas logadas: las de la caja 1 (mismos usuarios que calcularRatiosExito)
  // o, con un tipo, las de Resultados con ese tipo: sin los usuarios logados
  // sin actividad, que no se sabe de qué tipo son (sinActividad = false)
  let horas: EntradaMiServicio["horas"] = null;
  if (base && horasDia) {
    const ratios = calcularRatiosExito(base, prefijo, tipo === "todas");
    horas = {
      total: ratios.total.horasLogadas,
      usuarios: ratios.agentes.map((a) => a.agente).filter((a) => esUsuarioDelCliente(a, prefijo)),
      porUsuarioDia: horasDia,
    };
  }

  const { datos, cerrados } = armarDatosMiServicio({
    servicio: p.servicio,
    desde: p.desde,
    hasta: p.hasta,
    generado: format(new Date(), "dd/MM/yyyy HH:mm"),
    tipos,
    filtro: {
      tipo: tipo === "todas" ? null : (opciones.find((o) => o.valor === tipo)?.etiqueta ?? null),
      campania,
    },
    llamadas,
    actividad,
    resultados,
    // Con «no válidos» configurados (y válidos) en /admin/resultados
    configurado: resultados.serviciosConfigurados.includes(p.servicio),
    sinHoras,
    horas,
  });
  return {
    datos,
    extras: { cerrados, prefijo },
    opcionesTipo: opciones,
    tipo,
    campaniasFiltro: campTipo,
    campania,
    enVivo,
  };
}
