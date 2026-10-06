"use client";

import { memo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Pin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { explicarBloque, horasTexto, rangoCorto, type AusenciaMotor, type Regla } from "@/lib/planificacion/motor";
import { posicionPct, type BloqueTablero } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import type { AnclaMenu } from "./menu-bloque";

/** Cliente tal como lo pinta el tablero (color vivo de configuración y su texto por contraste). */
export interface ClienteVista {
  codigo: string;
  nombre: string;
  color: string;
  texto: string;
}

/**
 * Lo que un bloque editable puede pedir al tablero. Las funciones son
 * estables (useCallback en el tablero): así los bloques memoizados no se
 * vuelven a pintar al arrastrar otro.
 */
export interface AccionesBloque {
  abrirMenu: (bloque: BloqueTablero, ancla: AnclaMenu) => void;
  /** Atajos de teclado sobre un bloque enfocado. true si la tecla se ha usado. */
  teclado: (bloque: BloqueTablero, e: React.KeyboardEvent) => boolean;
  redimensionar: (bloque: BloqueTablero, inicioMin: number, finMin: number) => void;
  pasoMin: number;
}

interface PropsBloque {
  bloque: BloqueTablero;
  cliente: ClienteVista;
  clienteBase: string;
  inicioDiaMin: number;
  finDiaMin: number;
  nombreAgente: string;
  /** null = solo lectura. */
  edicion: AccionesBloque | null;
}

/**
 * Un bloque del plan, posicionado en % dentro del día (el día va de
 * plan.inicioDiaMin a plan.finDiaMin). Es un botón: se enfoca con el teclado
 * y el tooltip explica por qué está ahí (regla + datos del motor). Si se
 * puede editar, además se arrastra, se estira por los bordes y abre su menú.
 */
export const Bloque = memo(function Bloque(props: PropsBloque) {
  return props.edicion ? <BloqueEditable {...props} edicion={props.edicion} /> : <VistaBloque {...props} />;
});

function contenido(bloque: BloqueTablero, rango: string) {
  return (
    <>
      {bloque.fijado ? <Pin className="mr-0.5 size-2.5 shrink-0" aria-hidden /> : null}
      {/* Solo lo que cabe: nada en bloques muy estrechos, el código, y el horario si hay sitio */}
      <span className="hidden truncate @[1.9rem]:inline">
        {bloque.clienteCodigo}
        <span className="hidden @[4.5rem]:inline"> {rango}</span>
      </span>
    </>
  );
}

function Explicacion({ bloque, cliente, clienteBase, nombreAgente, rango }: PropsBloque & { rango: string }) {
  const explicacion = explicarBloque({ ...bloque, regla: bloque.regla as Regla }, clienteBase);
  return (
    <TooltipContent className="max-w-sm flex-col items-start gap-1">
      <div className="font-semibold">
        {nombreAgente} · {cliente.nombre} · {rango} ({horasTexto((bloque.finMin - bloque.inicioMin) / 60)})
      </div>
      <div>{explicacion}</div>
      {bloque.fijado && bloque.regla !== "fijado" ? <div className="opacity-80">Fijado: no cambia al regenerar.</div> : null}
    </TooltipContent>
  );
}

const CLASE_BLOQUE =
  "@container absolute inset-y-1 flex items-center overflow-hidden rounded-sm border border-black/15 px-1 text-[10px] leading-none font-medium whitespace-nowrap outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-foreground";

function VistaBloque(props: PropsBloque) {
  const { bloque, cliente, inicioDiaMin, finDiaMin, nombreAgente } = props;
  const { left, width } = posicionPct(bloque.inicioMin, bloque.finMin, inicioDiaMin, finDiaMin);
  const rango = rangoCorto(bloque.inicioMin, bloque.finMin);
  const explicacion = explicarBloque({ ...bloque, regla: bloque.regla as Regla }, props.clienteBase);
  return (
    <Tooltip>
      <TooltipTrigger
        className={CLASE_BLOQUE}
        data-bloque-id={bloque.id}
        data-cliente={bloque.clienteCodigo}
        data-rango={rango}
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: cliente.color, color: cliente.texto }}
        aria-label={`${nombreAgente}, ${cliente.nombre} de ${rango}${bloque.fijado ? ", fijado" : ""}. ${explicacion}`}
      >
        {contenido(bloque, rango)}
      </TooltipTrigger>
      <Explicacion {...props} rango={rango} />
    </Tooltip>
  );
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function BloqueEditable(props: PropsBloque & { edicion: AccionesBloque }) {
  const { bloque, cliente, inicioDiaMin, finDiaMin, nombreAgente, edicion } = props;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: bloque.id,
    data: { bloque },
    attributes: { roleDescription: "bloque del plan" },
  });
  // Vista previa mientras se estira con el ratón (el cambio se aplica al soltar)
  const [previa, setPrevia] = useState<{ inicioMin: number; finMin: number } | null>(null);
  // Al soltar un borde el navegador lanza también un clic: que no abra el menú
  const ignorarClic = useRef(false);
  const inicio = previa?.inicioMin ?? bloque.inicioMin;
  const fin = previa?.finMin ?? bloque.finMin;
  const { left, width } = posicionPct(inicio, fin, inicioDiaMin, finDiaMin);
  const rango = rangoCorto(inicio, fin);
  const explicacion = explicarBloque({ ...bloque, regla: bloque.regla as Regla }, props.clienteBase);

  /** Estirar por un borde con pointer events propios (dnd-kit no redimensiona). */
  const estirar = (lado: "inicio" | "fin") => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const asa = e.currentTarget;
    const celda = asa.closest<HTMLElement>("[data-celda]");
    if (!celda) return;
    const minPorPx = (finDiaMin - inicioDiaMin) / celda.getBoundingClientRect().width;
    const x0 = e.clientX;
    const paso = edicion.pasoMin;
    let actual = { inicioMin: bloque.inicioMin, finMin: bloque.finMin };
    ignorarClic.current = true;
    asa.setPointerCapture(e.pointerId);
    const mover = (ev: PointerEvent) => {
      const delta = Math.round(((ev.clientX - x0) * minPorPx) / paso) * paso;
      actual =
        lado === "inicio"
          ? { inicioMin: clamp(bloque.inicioMin + delta, inicioDiaMin, bloque.finMin - paso), finMin: bloque.finMin }
          : { inicioMin: bloque.inicioMin, finMin: clamp(bloque.finMin + delta, bloque.inicioMin + paso, finDiaMin) };
      setPrevia(actual);
    };
    const terminar = (aplicar: boolean) => () => {
      asa.removeEventListener("pointermove", mover);
      asa.removeEventListener("pointerup", soltar);
      asa.removeEventListener("pointercancel", cancelar);
      setPrevia(null);
      setTimeout(() => {
        ignorarClic.current = false;
      }, 0);
      if (aplicar && (actual.inicioMin !== bloque.inicioMin || actual.finMin !== bloque.finMin)) {
        edicion.redimensionar(bloque, actual.inicioMin, actual.finMin);
      }
    };
    const soltar = terminar(true);
    const cancelar = terminar(false);
    asa.addEventListener("pointermove", mover);
    asa.addEventListener("pointerup", soltar);
    asa.addEventListener("pointercancel", cancelar);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        data-bloque-id={bloque.id}
        data-cliente={bloque.clienteCodigo}
        data-rango={rango}
        className={cn(
          CLASE_BLOQUE,
          "cursor-grab touch-none active:cursor-grabbing",
          isDragging && "opacity-40",
          previa && "z-10 ring-2 ring-foreground",
        )}
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: cliente.color, color: cliente.texto }}
        aria-label={`${nombreAgente}, ${cliente.nombre} de ${rango}${bloque.fijado ? ", fijado" : ""}. ${explicacion}`}
        onClick={(e) => {
          if (!ignorarClic.current) edicion.abrirMenu(bloque, e.currentTarget);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const { clientX: x, clientY: y } = e;
          edicion.abrirMenu(bloque, { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) });
        }}
        onKeyDown={(e) => {
          if (edicion.teclado(bloque, e)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <span
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-black/20"
          onPointerDown={estirar("inicio")}
          aria-hidden
        />
        {contenido(bloque, rango)}
        <span
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize hover:bg-black/20"
          onPointerDown={estirar("fin")}
          aria-hidden
        />
      </TooltipTrigger>
      <Explicacion {...props} rango={rango} />
    </Tooltip>
  );
}

/** Lo que se ve bajo el puntero al arrastrar un bloque (DragOverlay). */
export function BloqueFantasma({ bloque, cliente, ancho }: { bloque: BloqueTablero; cliente: ClienteVista; ancho: number }) {
  return (
    <div
      className="flex h-7 items-center overflow-hidden rounded-sm border border-black/30 px-1 text-[10px] font-medium whitespace-nowrap shadow-lg"
      style={{ width: ancho, backgroundColor: cliente.color, color: cliente.texto }}
    >
      {bloque.clienteCodigo} {rangoCorto(bloque.inicioMin, bloque.finMin)}
    </div>
  );
}

/** Ausencia (vacaciones, permiso...) en rayado con el color de su tipo. */
export function BandaAusencia({
  ausencia,
  tipo,
  inicioDiaMin,
  finDiaMin,
}: {
  ausencia: AusenciaMotor;
  tipo: { nombre: string; color: string } | undefined;
  inicioDiaMin: number;
  finDiaMin: number;
}) {
  const { left, width } = posicionPct(ausencia.inicioMin, ausencia.finMin, inicioDiaMin, finDiaMin);
  if (width === 0) return null;
  const color = tipo?.color ?? "#BFBFBF";
  const completa = ausencia.inicioMin <= inicioDiaMin && ausencia.finMin >= finDiaMin;
  const texto = `${tipo?.nombre ?? ausencia.tipo} · ${completa ? "todo el día" : rangoCorto(ausencia.inicioMin, ausencia.finMin)}`;
  return (
    <Tooltip>
      <TooltipTrigger
        className="absolute inset-y-0.5 flex items-center overflow-hidden rounded-sm border border-dashed px-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          borderColor: color,
          backgroundImage: `repeating-linear-gradient(135deg, ${color}66 0 5px, transparent 5px 10px)`,
        }}
        aria-label={`Ausencia: ${texto}`}
      >
        <span className="truncate">{ausencia.tipo}</span>
      </TooltipTrigger>
      <TooltipContent>{texto}</TooltipContent>
    </Tooltip>
  );
}
