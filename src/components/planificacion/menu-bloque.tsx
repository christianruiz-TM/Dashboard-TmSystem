"use client";

import { Menu } from "@base-ui/react/menu";
import { ArrowRightLeft, ChevronRight, Combine, Pin, PinOff, Scissors, Trash2, Undo2 } from "lucide-react";
import { horaCorta, rangoCorto } from "@/lib/planificacion/motor";
import type { Operacion } from "@/lib/planificacion/edicion";
import type { BloqueTablero } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import type { ClienteVista } from "./bloque";

/** Ancla del menú: el propio bloque o, con el botón derecho, el punto donde se pulsó. */
export type AnclaMenu = Element | { getBoundingClientRect: () => DOMRect };

export interface EstadoMenuBloque {
  bloque: BloqueTablero;
  ancla: AnclaMenu;
}

const POPUP =
  "z-50 min-w-48 rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none";
const ITEM =
  "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-3.5 [&_svg]:shrink-0";

/**
 * Menú de un bloque del tablero (uno solo para todo el tablero, anclado al
 * bloque que se pulsa): cambiar de cliente, devolver al cliente base,
 * dividir, unir, mover a…, fijar y eliminar. Es la alternativa de teclado y
 * de lector de pantalla al arrastre: se abre con clic, Intro, Espacio,
 * la tecla Menú o el botón derecho.
 */
export function MenuBloque({
  estado,
  onCerrar,
  clientes,
  clienteBase,
  habilidades,
  nombreAgente,
  pasoMin,
  siguienteUnible,
  onOperacion,
  onMoverA,
}: {
  estado: EstadoMenuBloque | null;
  onCerrar: () => void;
  /** Clientes del plan, en el orden de la configuración. */
  clientes: readonly ClienteVista[];
  clienteBase: string;
  /** Clientes de los que el agente tiene usuario (los demás no se ofrecen). */
  habilidades: (agente: string) => readonly string[];
  nombreAgente: (agente: string) => string;
  pasoMin: number;
  /** ¿Hay justo después un bloque contiguo del mismo cliente? */
  siguienteUnible: (bloque: BloqueTablero) => boolean;
  onOperacion: (op: Operacion) => void;
  onMoverA: (bloque: BloqueTablero) => void;
}) {
  const b = estado?.bloque;
  const puede = b ? new Set(habilidades(b.agenteNumero)) : new Set<string>();
  const cortes: number[] = [];
  if (b) for (let m = b.inicioMin + pasoMin; m < b.finMin; m += pasoMin) cortes.push(m);
  const operar = (op: Operacion) => () => {
    onCerrar();
    onOperacion(op);
  };

  return (
    <Menu.Root
      open={estado != null}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      modal={false}
    >
      {/* Base UI registra el nodo del menú en su árbol desde el Trigger: sin él,
          los submenús se tienen por «hermanos» y cierran el menú al abrirse.
          Este no se ve ni se enfoca; el menú se ancla al bloque (anchor). */}
      <Menu.Trigger nativeButton={false} render={<span hidden aria-hidden />} />
      <Menu.Portal>
        <Menu.Positioner anchor={estado?.ancla ?? null} side="bottom" align="start" sideOffset={4} className="z-50">
          <Menu.Popup className={POPUP} finalFocus={false}>
            {b ? (
              <>
                <Menu.Group>
                  <Menu.GroupLabel className="px-2 py-1 text-xs text-muted-foreground">
                    {nombreAgente(b.agenteNumero)} · {b.clienteCodigo} {rangoCorto(b.inicioMin, b.finMin)}
                    {b.fijado ? " · fijado" : ""}
                  </Menu.GroupLabel>
                </Menu.Group>

                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={ITEM}>
                    <ArrowRightLeft /> Cambiar de cliente
                    <ChevronRight className="ml-auto" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner className="z-50" sideOffset={2}>
                      <Menu.Popup className={POPUP}>
                        {clientes.map((c) => {
                          const actual = c.codigo === b.clienteCodigo;
                          const sinUsuario = !puede.has(c.codigo);
                          return (
                            <Menu.Item
                              key={c.codigo}
                              className={ITEM}
                              disabled={actual || sinUsuario}
                              onClick={operar({ tipo: "cambiarCliente", id: b.id, clienteCodigo: c.codigo })}
                            >
                              <span
                                className="inline-block size-3 rounded-[3px] border border-black/15"
                                style={{ backgroundColor: c.color }}
                                aria-hidden
                              />
                              {c.codigo}
                              <span className="ml-auto pl-3 text-xs text-muted-foreground">
                                {actual ? "actual" : sinUsuario ? "sin usuario" : c.nombre}
                              </span>
                            </Menu.Item>
                          );
                        })}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>

                {b.clienteCodigo !== clienteBase ? (
                  <Menu.Item
                    className={ITEM}
                    disabled={!puede.has(clienteBase)}
                    onClick={operar({ tipo: "cambiarCliente", id: b.id, clienteCodigo: clienteBase })}
                  >
                    <Undo2 /> Devolver a {clienteBase}
                  </Menu.Item>
                ) : null}

                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={ITEM} disabled={cortes.length === 0}>
                    <Scissors /> Dividir a las…
                    <ChevronRight className="ml-auto" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner className="z-50" sideOffset={2}>
                      <Menu.Popup className={POPUP}>
                        {cortes.map((m) => (
                          <Menu.Item key={m} className={ITEM} onClick={operar({ tipo: "dividir", id: b.id, enMin: m })}>
                            {horaCorta(m)} h ({rangoCorto(b.inicioMin, m)} y {rangoCorto(m, b.finMin)})
                          </Menu.Item>
                        ))}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>

                {siguienteUnible(b) ? (
                  <Menu.Item className={ITEM} onClick={operar({ tipo: "unir", id: b.id })}>
                    <Combine /> Unir con el siguiente
                  </Menu.Item>
                ) : null}

                <Menu.Item
                  className={ITEM}
                  onClick={() => {
                    onCerrar();
                    onMoverA(b);
                  }}
                >
                  <ArrowRightLeft className="rotate-90" /> Mover a…
                </Menu.Item>

                <Menu.Item className={ITEM} onClick={operar({ tipo: "fijar", id: b.id, fijado: !b.fijado })}>
                  {b.fijado ? <PinOff /> : <Pin />} {b.fijado ? "Desfijar" : "Fijar (no cambia al regenerar)"}
                </Menu.Item>

                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={cn(ITEM, "text-destructive")} onClick={operar({ tipo: "eliminar", id: b.id })}>
                  <Trash2 /> Eliminar (deja el hueco libre)
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
