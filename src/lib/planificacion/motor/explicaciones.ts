import { horasTexto } from "./franjas";
import type { BloqueMotor } from "./tipos";

// ============================================================
// Texto de la explicación de cada bloque (tooltip del tablero). Sale de
// `regla` + `datos`, que el motor guarda al decidir:
//   «UGR aquí: holgura GH 4, contacto 65 %, objetivo de la semana 70,00 h
//    (42,00 h asignadas)»
// ============================================================

type BloqueExplicable = Pick<BloqueMotor, "clienteCodigo" | "regla" | "datos" | "fijado">;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function explicarBloque(bloque: BloqueExplicable, clienteBase: string): string {
  const c = bloque.clienteCodigo;
  const d = bloque.datos ?? {};
  switch (bloque.regla) {
    case "base_turno": {
      const rot = txt(d.rotacion);
      return `${c}: base del turno${rot ? ` (semana ${rot})` : ""}. Las horas que no van a otro cliente se quedan en ${clienteBase}.`;
    }
    case "minimo_erlang":
      return `${c}: cubre su mínimo de ${num(d.minimo) ?? "?"} agentes (Erlang C).`;
    case "objetivo": {
      const hol = num(d.holguraMin);
      const contacto = num(d.contacto);
      const objetivo = num(d.objetivoSemana);
      const asignadas = num(d.asignadasSemana);
      const partes = [
        hol != null ? `holgura ${clienteBase} ${hol}` : null,
        contacto != null ? `contacto ${Math.round(contacto * 100)} %` : "contacto sin datos",
        objetivo != null
          ? `objetivo de la semana ${horasTexto(objetivo)}${asignadas != null ? ` (${horasTexto(asignadas)} asignadas)` : ""}`
          : null,
      ].filter(Boolean);
      return `${c} aquí: ${partes.join(", ")}`;
    }
    case "manual": {
      const quien = txt(d.editadoPor);
      const cuando = txt(d.editadoAt);
      const antes = txt(d.reglaAnterior);
      return `${c}: cambiado a mano${quien ? ` por ${quien}` : ""}${cuando ? ` el ${cuando}` : ""}${antes ? ` (antes: ${antes})` : ""}.`;
    }
    case "fijado":
      return `${c}: fijado; el motor no lo toca al regenerar.`;
    case "devuelto_a_base": {
      const de = txt(d.clienteAnterior);
      return `${c}: horas devueltas a ${clienteBase}${de ? ` porque la lista de ${de} se agotó` : ""}.`;
    }
    default:
      return `${c}: ${bloque.regla}`;
  }
}
