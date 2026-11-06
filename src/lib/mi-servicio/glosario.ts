import type { ExtrasInternos } from "./tipos";

// ============================================================
// Textos de «Mi servicio» (06/11/2026). Dos públicos:
//  - CLIENTE: lo que significa cada cifra en palabras de cliente. Sale en
//    los globos de la pantalla (para todos) y en el glosario del informe.
//  - INTERNO: definición técnica y opciones descartadas, solo para
//    supervisión, operaciones, dirección y admin; nunca en el informe.
// ============================================================

export type ClaveMiServicio =
  | "llamadas"
  | "finalizados"
  | "noValidos"
  | "exitos"
  | "horasLogadas"
  | "horasFicha"
  | "llamadasHora"
  | "exitosHora"
  | "finalizadosPorExito"
  | "finalizadosExito"
  | "bruto"
  | "neto";

export const GLOSARIO_CLIENTE: Record<ClaveMiServicio, { termino: string; definicion: string }> = {
  llamadas: {
    termino: "Llamadas",
    definicion:
      "Todas las llamadas de tus campañas: las que recibimos y las que hacemos, contesten o no. Debajo, las gestionadas: las que atendió una persona del equipo.",
  },
  finalizados: {
    termino: "Finalizados",
    definicion:
      "Contactos que cerramos en el periodo después de que una persona del equipo los atendiera y anotara el resultado. Cada contacto cuenta una vez, el día en que se cerró.",
  },
  noValidos: {
    termino: "No válidos",
    definicion:
      "Finalizados que no se podían aprovechar: su resultado es de los que tu servicio considera «no válido». Debajo, qué parte de los finalizados son.",
  },
  exitos: {
    termino: "Éxitos",
    definicion:
      "Gestiones que acabaron en éxito (el objetivo de tu campaña), contadas el día de la llamada. Debajo, qué parte de las llamadas gestionadas acaba en éxito.",
  },
  finalizadosExito: {
    termino: "Finalizados con éxito",
    definicion:
      "Contactos cerrados en éxito, contados el día del cierre. Son la base del aprovechamiento. Pueden diferir en unos pocos de «Éxitos», que se cuentan el día de la llamada.",
  },
  horasLogadas: {
    termino: "Horas logadas",
    definicion: "Horas que el equipo dedicado a tu servicio estuvo conectado, de principio a fin de su jornada.",
  },
  horasFicha: {
    termino: "Horas con ficha abierta",
    definicion:
      "Horas que el equipo tuvo abierta la ficha de las campañas elegidas. Con solo una parte de las campañas no se pueden dar las horas conectadas, porque cada persona trabaja en varias a la vez.",
  },
  llamadasHora: {
    termino: "Llamadas por hora",
    definicion: "Llamadas gestionadas por cada hora del equipo.",
  },
  exitosHora: {
    termino: "Éxitos por hora",
    definicion: "Éxitos por cada hora del equipo.",
  },
  finalizadosPorExito: {
    termino: "Finalizados por éxito",
    definicion: "Cuántos contactos hay que cerrar para conseguir un éxito: finalizados ÷ finalizados con éxito.",
  },
  bruto: {
    termino: "Aprovechamiento",
    definicion: "Qué parte de los finalizados acaba en éxito: finalizados con éxito ÷ finalizados.",
  },
  neto: {
    termino: "Aprovechamiento neto",
    definicion:
      "El aprovechamiento sin contar los no válidos: finalizados con éxito ÷ (finalizados − no válidos).",
  },
};

/** Notas internas de cada cifra (globos de los roles internos). */
export function notasInternas(extras: ExtrasInternos): Partial<Record<ClaveMiServicio, string>> {
  const prefijo = extras.prefijo
    ? `solo sus usuarios ${extras.prefijo}_nnnn, por el prefijo de su línea de facturación «horas logadas»`
    : "el cliente no tiene prefijo de usuarios (línea de facturación «horas logadas»): cuentan todos los usuarios que trabajaron en sus campañas";
  return {
    llamadas:
      "Interno: la caja «Llamadas» de Supervisión y Dirección: sin preparaciones de llamada manual, emails ni el tramo rechazado o desbordado del IVR. Descartado: contar solo las gestionadas (salen debajo).",
    finalizados:
      "Interno: los de Resultados (caja 3), contactos cerrados que tipificó un agente, por el día del cierre. " +
      `Descartado: los de facturación, que suman también los cierres administrativos y los que no tocó nadie (${extras.cerrados.toLocaleString("es-ES")} en este periodo y alcance).`,
    noValidos:
      "Interno: los valores marcados como «no válido» en Administración → Resultados. Sin configurar, no hay no válidos, ni su %, ni neto.",
    exitos:
      "Interno: la caja «Éxitos» (sesiones de éxito por el día de la llamada, regla 17). El embudo y el aprovechamiento usan los «finalizados con éxito» (contactos cerrados en éxito por el día del cierre), para no tener dos cifras distintas con el mismo nombre.",
    horasLogadas:
      `Interno: la caja «Horas logadas» (user_log; ${prefijo}). Con un tipo o una campaña elegida pasan a ser las horas con la ficha abierta en esas campañas (opción elegida el 06/11/2026). ` +
      "Descartadas: las horas logadas enteras de los usuarios que trabajaron en esas campañas (cuentan su tiempo en las demás y no se pueden repartir por campaña) y ocultar las horas y los «por hora».",
    horasFicha:
      "Interno: opción elegida el 06/11/2026 para un tipo o una campaña: Σ script_session.duration de esas campañas (sin las sesiones de 2 h o más ni las abiertas), la hora «por campaña» de la regla 17. " +
      "Descartadas: las horas logadas enteras de los usuarios que trabajaron en esas campañas (cuentan su tiempo en las demás y no se pueden repartir por campaña) y ocultar las horas y los «por hora».",
  };
}

/** Datos de contacto del pie del informe (los generales de tmsystem.es, 06/11/2026). */
export const CONTACTO_TMSYSTEM = {
  nombre: "TM System Contact Center",
  direccion: "Parque Tecnológico de la Salud, Av. del Conocimiento, 41, planta 2.ª, oficina A201, 18016 Granada",
  telefono: "958 53 57 70",
  email: "info@tmsystem.es",
  web: "tmsystem.es",
};
