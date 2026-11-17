import { FORMATO_2_DECIMALES, generarXlsxHojas } from "@/lib/export/xlsx";
import { hora } from "./dia";
import { NOMBRE_FUENTE, type DatosDia, type DatosPeriodo } from "./servidor";
import { detalleTramo, tipoTramo } from "./textos";

// ============================================================
// Excel del día del panel de RRHH: una hoja con una fila por persona (los
// totales de la tabla) y otra con una fila por tramo (lo que pasó, por orden
// de hora). Tiempos en horas, con 2 decimales a la vista.
// ============================================================

export async function excelAusenciasDia(datos: DatosDia): Promise<{ contenido: Buffer; personas: number }> {
  const h = (min: number) => Math.round((min / 60) * 10000) / 10000;

  const personas = datos.filas.map((f) => ({
    persona: f.persona.codigo,
    nombre: f.persona.nombre ?? "",
    horario: f.horario.map((t) => `${hora(t.inicioMin)}-${hora(t.finMin)}`).join(", "),
    fuente: NOMBRE_FUENTE[f.fuente],
    entrada: f.dia.entradaMin == null ? "" : hora(f.dia.entradaMin),
    salida: f.dia.conectadaAhora ? "conectada" : f.dia.salidaMin == null ? "" : hora(f.dia.salidaMin),
    tarde: h(f.dia.tardeMin),
    salidaAntes: h(f.dia.salidaAntesMin),
    huecos: h(f.dia.huecosMin),
    sinEntrar: h(f.dia.sinEntrarMin),
    sinConectar: h(f.dia.sinConectarMin),
    pausasAusencia: h(f.dia.pausasAusenciaMin),
    pausasTrabajo: h(f.dia.pausasTrabajoMin),
    arranque: h(f.dia.arranqueMin),
    apuntada: f.ausencias.map((a) => a.tipoCodigo).join(", "),
    conectada: h(f.dia.conectadaMin),
  }));
  const tramos = datos.filas.flatMap((f) =>
    f.dia.tramos.map((t) => ({
      persona: f.persona.codigo,
      nombre: f.persona.nombre ?? "",
      inicio: hora(t.inicioMin),
      fin: hora(t.finMin),
      tipo: tipoTramo(t),
      detalle: detalleTramo(t),
      horas: h(t.finMin - t.inicioMin),
    })),
  );

  const t2 = FORMATO_2_DECIMALES;
  const contenido = await generarXlsxHojas([
    {
      nombre: "Personas",
      columnas: [
        { cabecera: "Persona", clave: "persona", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 16 },
        { cabecera: "Horario", clave: "horario", ancho: 22 },
        { cabecera: "Horario de", clave: "fuente", ancho: 20 },
        { cabecera: "Entrada", clave: "entrada", ancho: 9 },
        { cabecera: "Salida", clave: "salida", ancho: 10 },
        { cabecera: "Tarde (h)", clave: "tarde", ancho: 10, formato: t2 },
        { cabecera: "Salida antes (h)", clave: "salidaAntes", ancho: 12, formato: t2 },
        { cabecera: "Huecos (h)", clave: "huecos", ancho: 10, formato: t2 },
        { cabecera: "No se conectó (h)", clave: "sinEntrar", ancho: 12, formato: t2 },
        { cabecera: "Sin conectar en su horario (h)", clave: "sinConectar", ancho: 14, formato: t2 },
        { cabecera: "Pausas ausencia (h)", clave: "pausasAusencia", ancho: 12, formato: t2 },
        { cabecera: "Pausas trabajo sin cola (h)", clave: "pausasTrabajo", ancho: 14, formato: t2 },
        { cabecera: "Hasta ponerse disponible (h)", clave: "arranque", ancho: 14, formato: t2 },
        { cabecera: "Ausencia apuntada", clave: "apuntada", ancho: 12 },
        { cabecera: "Conectada (h)", clave: "conectada", ancho: 12, formato: t2 },
      ],
      filas: personas,
    },
    {
      nombre: "Detalle",
      columnas: [
        { cabecera: "Persona", clave: "persona", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 16 },
        { cabecera: "Desde", clave: "inicio", ancho: 8 },
        { cabecera: "Hasta", clave: "fin", ancho: 8 },
        { cabecera: "Tipo", clave: "tipo", ancho: 26 },
        { cabecera: "Detalle", clave: "detalle", ancho: 34 },
        { cabecera: "Horas", clave: "horas", ancho: 9, formato: t2 },
      ],
      filas: tramos,
    },
  ]);

  return { contenido, personas: personas.length };
}

/**
 * Excel de «Por agente»: una hoja con una fila por persona y otra con una
 * fila por persona y motivo (tiempo acumulado y veces), más las ausencias
 * apuntadas aparte.
 */
export async function excelAusenciasPeriodo(datos: DatosPeriodo): Promise<{ contenido: Buffer; personas: number }> {
  const h = (min: number) => Math.round((min / 60) * 10000) / 10000;
  const personas = datos.filas.map((f) => ({
    persona: f.persona.codigo,
    nombre: f.persona.nombre ?? "",
    dias: f.resumen.diasConectada,
    conectada: h(f.resumen.conectadaMin),
    ausente: h(f.resumen.ausenteMin),
    pct: f.resumen.conectadaMin > 0 ? Math.round((f.resumen.ausenteMin / f.resumen.conectadaMin) * 10000) / 100 : null,
    ausencias: f.resumen.ausencias,
    apuntadas: f.apuntadas.map((a) => `${a.veces} ${a.tipoCodigo}`).join(", "),
  }));
  const motivos = datos.filas.flatMap((f) =>
    f.resumen.motivos.map((m) => ({
      persona: f.persona.codigo,
      nombre: f.persona.nombre ?? "",
      motivo: m.motivo,
      veces: m.veces,
      horas: h(m.minutos),
    })),
  );
  const apuntadas = datos.filas.flatMap((f) =>
    f.apuntadas.map((a) => ({
      persona: f.persona.codigo,
      nombre: f.persona.nombre ?? "",
      tipo: a.tipoNombre,
      veces: a.veces,
      dias: a.dias,
      horas: Math.round(a.horas * 100) / 100,
      trabajada: a.computaComoTrabajada ? "Sí" : "No",
    })),
  );
  const t2 = FORMATO_2_DECIMALES;
  const contenido = await generarXlsxHojas([
    {
      nombre: "Personas",
      columnas: [
        { cabecera: "Persona", clave: "persona", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 16 },
        { cabecera: "Días conectada", clave: "dias", ancho: 10 },
        { cabecera: "Tiempo conectado (h)", clave: "conectada", ancho: 14, formato: t2 },
        { cabecera: "Tiempo ausente (h)", clave: "ausente", ancho: 14, formato: t2 },
        { cabecera: "% ausente", clave: "pct", ancho: 10, formato: t2 },
        { cabecera: "Nº de ausencias", clave: "ausencias", ancho: 12 },
        { cabecera: "Ausencias apuntadas", clave: "apuntadas", ancho: 20 },
      ],
      filas: personas,
    },
    {
      nombre: "Por motivo",
      columnas: [
        { cabecera: "Persona", clave: "persona", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 16 },
        { cabecera: "Motivo", clave: "motivo", ancho: 24 },
        { cabecera: "Veces", clave: "veces", ancho: 8 },
        { cabecera: "Tiempo acumulado (h)", clave: "horas", ancho: 14, formato: t2 },
      ],
      filas: motivos,
    },
    {
      nombre: "Ausencias apuntadas",
      columnas: [
        { cabecera: "Persona", clave: "persona", ancho: 14 },
        { cabecera: "Nombre", clave: "nombre", ancho: 16 },
        { cabecera: "Tipo", clave: "tipo", ancho: 22 },
        { cabecera: "Veces", clave: "veces", ancho: 8 },
        { cabecera: "Días completos", clave: "dias", ancho: 10 },
        { cabecera: "Horas sueltas", clave: "horas", ancho: 10, formato: t2 },
        { cabecera: "Cuenta como trabajada", clave: "trabajada", ancho: 12 },
      ],
      filas: apuntadas,
    },
  ]);
  return { contenido, personas: personas.length };
}
