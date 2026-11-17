import { hora, type Tramo, type TramoDia } from "@/lib/rrhh/dia";
import { textoTramo } from "@/lib/rrhh/textos";
import { cn } from "@/lib/utils";

// ============================================================
// Panel de RRHH: la jornada de una persona en una barra (16/11/2026). El
// horario esperado es el contorno discontinuo; lo conectado, una pista fina
// verde; las pausas, lo que no conectó y lo apuntado, marcas altas (lo que
// RRHH busca salta a la vista). Cada tramo lleva su globo. Todas las filas
// con la misma escala (`escala`). Sin hooks: componente de servidor.
// Colores en globals.css (.rrhh-*), validados en claro y oscuro.
// ============================================================

export interface Escala {
  desdeMin: number;
  hastaMin: number;
}

/** Escala común: de la primera a la última hora con algo, en horas enteras (como poco 8-20). */
export function escalaDe(filas: readonly { horario: readonly Tramo[]; tramos: readonly Tramo[] }[]): Escala {
  let desde = 8 * 60;
  let hasta = 20 * 60;
  for (const f of filas) {
    for (const t of [...f.horario, ...f.tramos]) {
      desde = Math.min(desde, t.inicioMin);
      hasta = Math.max(hasta, t.finMin);
    }
  }
  return { desdeMin: Math.max(0, Math.floor(desde / 60) * 60), hastaMin: Math.min(1440, Math.ceil(hasta / 60) * 60) };
}

const pct = (min: number, e: Escala) => `${(((min - e.desdeMin) / (e.hastaMin - e.desdeMin)) * 100).toFixed(3)}%`;
const ancho = (t: Tramo, e: Escala) => `${(((t.finMin - t.inicioMin) / (e.hastaMin - e.desdeMin)) * 100).toFixed(3)}%`;

function claseTramo(t: TramoDia): string {
  switch (t.tipo) {
    case "conectada":
      return "rrhh-con inset-y-[11px]";
    case "arranque":
      return "rrhh-arr inset-y-[6px]";
    case "pausa":
      return cn(t.categoria === "ausencia" ? "rrhh-aus" : "rrhh-tra", "inset-y-[6px]");
    case "sin_conectar":
      return "rrhh-sin inset-y-[6px]";
    case "ausencia":
      return "rrhh-apu inset-y-[6px]";
  }
}

/** Rayas de las horas, detrás de las barras. */
function Rejilla({ escala }: { escala: Escala }) {
  const horas: number[] = [];
  for (let m = escala.desdeMin; m <= escala.hastaMin; m += 60) horas.push(m);
  return (
    <>
      {horas.map((m) => (
        <div key={m} aria-hidden className="rrhh-rejilla absolute inset-y-0 w-px" style={{ left: pct(m, escala) }} />
      ))}
    </>
  );
}

export function BarraDia({
  tramos,
  horario,
  escala,
  ahoraMin,
  etiqueta,
}: {
  tramos: readonly TramoDia[];
  horario: readonly Tramo[];
  escala: Escala;
  ahoraMin: number | null;
  /** Para lectores de pantalla: de quién es la barra. */
  etiqueta: string;
}) {
  return (
    <div className="relative h-7 min-w-64" role="img" aria-label={`${etiqueta}: ${tramos.map(textoTramo).join("; ") || "sin datos"}`}>
      <Rejilla escala={escala} />
      {horario.map((h) => (
        <div
          key={`h${h.inicioMin}`}
          aria-hidden
          title={`Su horario: ${hora(h.inicioMin)}–${hora(h.finMin)}`}
          className="rrhh-hor absolute inset-y-[2px] rounded-[5px]"
          style={{ left: pct(h.inicioMin, escala), width: ancho(h, escala) }}
        />
      ))}
      {tramos.map((t) => (
        <div
          key={`${t.tipo}${t.inicioMin}`}
          title={textoTramo(t)}
          className={cn("absolute rounded-[3px]", claseTramo(t))}
          style={{
            left: pct(t.inicioMin, escala),
            width: ancho(t, escala),
            minWidth: t.tipo === "conectada" ? undefined : 2,
            // 1 px de fondo entre marcas seguidas (el espaciador de la guía de gráficas)
            outline: t.tipo === "conectada" ? undefined : "1px solid var(--card)",
          }}
        />
      ))}
      {ahoraMin != null && ahoraMin > escala.desdeMin && ahoraMin < escala.hastaMin ? (
        <div aria-hidden title="Ahora" className="absolute inset-y-0 w-[2px] rounded-full bg-foreground" style={{ left: pct(ahoraMin, escala) }} />
      ) : null}
    </div>
  );
}

/** Eje con las horas, para la cabecera de la columna de las barras. */
export function EjeHoras({ escala }: { escala: Escala }) {
  const horas: number[] = [];
  const paso = escala.hastaMin - escala.desdeMin > 12 * 60 ? 120 : 60;
  for (let m = escala.desdeMin; m <= escala.hastaMin; m += paso) horas.push(m);
  return (
    <div className="relative h-4 min-w-64 text-[11px] font-normal text-muted-foreground tabular-nums" aria-hidden>
      {horas.map((m) => (
        <span key={m} className="absolute -translate-x-1/2" style={{ left: pct(m, escala) }}>
          {String(m / 60).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

/** Leyenda de la barra (siempre visible: el color no va solo). */
export function LeyendaBarra() {
  const items: { clase: string; texto: string; fina?: boolean; contorno?: boolean }[] = [
    { clase: "rrhh-hor", texto: "Su horario", contorno: true },
    { clase: "rrhh-con", texto: "Conectada", fina: true },
    { clase: "rrhh-aus", texto: "Pausa (ausencia)" },
    { clase: "rrhh-tra", texto: "Pausa (trabajo sin cola)" },
    { clase: "rrhh-arr", texto: "Hasta ponerse disponible" },
    { clase: "rrhh-sin", texto: "Sin conectar en su horario" },
    { clase: "rrhh-apu", texto: "Ausencia apuntada" },
  ];
  return (
    <ul className="rrhh-raiz flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.texto} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-block w-4 rounded-[3px]", i.clase, i.fina ? "h-1.5" : "h-3", i.contorno && "bg-transparent")} />
          {i.texto}
        </li>
      ))}
    </ul>
  );
}
