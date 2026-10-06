"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndMonitor,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type Over,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Eraser,
  GitCompare,
  Info,
  OctagonAlert,
  Plus,
  Redo2,
  Save,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  aplicarOperacion,
  construirContextoEdicion,
  inicioEnPosicion,
  operacionesQuitarAusencias,
  type ContextoEdicion,
  type Operacion,
} from "@/lib/planificacion/edicion";
import {
  calcularMinimos,
  coberturaBase,
  construirContexto,
  generarFranjas,
  horaCorta,
  horasTexto,
  lunesDe,
  rangoCorto,
  semanasDelMes,
  validarPlan,
  type AgenteMotor,
  type Aviso,
} from "@/lib/planificacion/motor";
import {
  agentesConFila,
  barrasBolsa,
  bloquesPorAgenteDia,
  capacidadPlan,
  colorTexto,
  contarGravedades,
  diaCorto,
  fechaDiaMes,
  horasPorAgente,
  horasPorCliente,
  nombreMes,
  posicionPct,
  saldosPrevistos,
  type BloqueTablero,
  type DatosTablero,
  type VersionTablero,
  type VistaTablero,
} from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { BotonAyuda } from "./ayuda";
import { BarrasBolsa } from "./barras-bolsa";
import { BloqueFantasma, type ClienteVista } from "./bloque";
import {
  BotonBorradorDesdePublicada,
  DialogoMoverA,
  DialogoNuevoBloque,
  DialogoPublicar,
  type AccionFormulario,
  type OpcionAgente,
  type OpcionDia,
} from "./dialogos-edicion";
import { FilaAgente, type ContextoCeldas, type DiaColumna, type FilaAgenteDatos } from "./fila-agente";
import { LeyendaCobertura, MapaCoberturaDia } from "./mapa-cobertura";
import { MenuBloque, type AnclaMenu, type EstadoMenuBloque } from "./menu-bloque";
import { PanelIncidencias } from "./panel-incidencias";
import { VistaCliente } from "./vista-cliente";
import { VistaDia } from "./vista-dia";
import { PuntoAyuda } from "./punto-ayuda";

const NOMBRE_VISTA: Record<VistaTablero, string> = { agente: "Agente", cliente: "Cliente", dia: "Día" };

const ESTADO_VERSION: Record<VersionTablero["estado"], { texto: string; clase: string }> = {
  borrador: { texto: "Borrador (sin publicar)", clase: "bg-amber-100 text-amber-900" },
  publicada: { texto: "Publicada", clase: "bg-emerald-100 text-emerald-900" },
  sustituida: { texto: "Sustituida", clase: "bg-muted text-muted-foreground" },
  descartada: { texto: "Descartada", clase: "bg-muted text-muted-foreground" },
  simulacion: { texto: "Simulación", clase: "bg-sky-100 text-sky-900" },
};

const VACIO: BloqueTablero[] = [];

type AgenteFila = Pick<AgenteMotor, "numero" | "contratoSemanalH" | "turnos" | "ausencias">;

/** Respuesta de la Server Action de guardar (la define [mes]/acciones.ts). */
export type RespuestaGuardar =
  | { ok: true; revision: number; bloques: BloqueTablero[]; tramos: number }
  | { ok: false; error: string; conflicto: boolean };

/** Server Actions que usa el tablero (llegan del servidor, que es quien comprueba el rol). */
export interface AccionesServidor {
  guardar: (peticion: { versionId: number; revision: number; operaciones: Operacion[] }) => Promise<RespuestaGuardar>;
  publicar: AccionFormulario;
  copiarPublicada: AccionFormulario;
}

// ---------- Estado de edición: reductor PURO (deshacer / rehacer) ----------

interface Paso {
  bloques: BloqueTablero[];
  /** Operaciones desde el último guardado: es lo que se manda al servidor. */
  ops: Operacion[];
}

interface EstadoEdicion {
  /** Lo último guardado (descartar vuelve aquí). */
  guardados: BloqueTablero[];
  pasado: Paso[];
  presente: Paso;
  futuro: Paso[];
  aviso: { texto: string; error: boolean; n: number } | null;
  /** Bloque que enfocar tras pintar (teclado y menú). */
  foco: { id: number; n: number } | null;
}

type AccionEdicion =
  | { tipo: "aplicar"; ops: Operacion[]; ctx: ContextoEdicion; foco: boolean; texto?: string }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" }
  | { tipo: "reiniciar"; bloques: BloqueTablero[]; texto: string | null }
  | { tipo: "descartar" }
  | { tipo: "aviso"; texto: string; error: boolean };

const MAX_DESHACER = 200;

function reductorEdicion(estado: EstadoEdicion, accion: AccionEdicion): EstadoEdicion {
  const n = (estado.aviso?.n ?? estado.foco?.n ?? 0) + 1;
  switch (accion.tipo) {
    case "aplicar": {
      let bloques = estado.presente.bloques;
      let foco: number | null = null;
      const hechas: Operacion[] = [];
      for (const op of accion.ops) {
        const r = aplicarOperacion(bloques, op, accion.ctx);
        // Un lote es todo o nada, como al guardar
        if (!r.ok) return { ...estado, aviso: { texto: r.error, error: true, n } };
        if (!r.cambia) continue;
        bloques = r.bloques;
        foco = r.foco ?? foco;
        hechas.push(op);
      }
      if (hechas.length === 0) return estado;
      return {
        ...estado,
        pasado: [...estado.pasado, estado.presente].slice(-MAX_DESHACER),
        presente: { bloques, ops: [...estado.presente.ops, ...hechas] },
        futuro: [],
        aviso: accion.texto ? { texto: accion.texto, error: false, n } : null,
        foco: accion.foco && foco != null ? { id: foco, n } : estado.foco,
      };
    }
    case "deshacer": {
      const previo = estado.pasado[estado.pasado.length - 1];
      if (!previo) return estado;
      return {
        ...estado,
        pasado: estado.pasado.slice(0, -1),
        presente: previo,
        futuro: [estado.presente, ...estado.futuro],
        aviso: { texto: "Deshecho.", error: false, n },
      };
    }
    case "rehacer": {
      const siguiente = estado.futuro[0];
      if (!siguiente) return estado;
      return {
        ...estado,
        pasado: [...estado.pasado, estado.presente],
        presente: siguiente,
        futuro: estado.futuro.slice(1),
        aviso: { texto: "Rehecho.", error: false, n },
      };
    }
    case "reiniciar":
      return {
        guardados: accion.bloques,
        pasado: [],
        presente: { bloques: accion.bloques, ops: [] },
        futuro: [],
        aviso: accion.texto ? { texto: accion.texto, error: false, n } : null,
        foco: null,
      };
    case "descartar":
      return {
        ...estado,
        pasado: [],
        presente: { bloques: estado.guardados, ops: [] },
        futuro: [],
        aviso: { texto: "Cambios descartados.", error: false, n },
        foco: null,
      };
    case "aviso":
      return { ...estado, aviso: { texto: accion.texto, error: accion.error, n } };
  }
}

// ---------- Arrastre ----------

/** Operación «mover» que resultaría de soltar `active` sobre `over` (null si no cae en una celda). */
function moverAlSoltar(active: Active, over: Over | null, ctx: ContextoEdicion): Operacion | null {
  const b = active.data.current?.bloque as BloqueTablero | undefined;
  const destino = over?.data.current as { agente: string; fecha: string } | undefined;
  const rect = active.rect.current.translated;
  if (!b || !over || !destino || !rect || over.rect.width <= 0) return null;
  const fraccion = (rect.left - over.rect.left) / over.rect.width;
  const inicioMin = inicioEnPosicion(fraccion, b.finMin - b.inicioMin, ctx);
  return { tipo: "mover", id: b.id, agenteNumero: destino.agente, fecha: destino.fecha, inicioMin };
}

const INSTRUCCIONES =
  "Bloque del plan. Intro o Espacio abre su menú: cambiar de cliente, dividir, mover a, fijar o eliminar. " +
  "Flechas izquierda y derecha: moverlo una franja; con Mayúsculas, alargar o acortar el final; con Alt, el principio. " +
  "Flechas arriba y abajo: pasarlo al agente anterior o siguiente. Suprimir: eliminarlo. Control+Z deshace.";

const ANUNCIOS: Announcements = {
  onDragStart: () => "Arrastrando el bloque.",
  onDragOver: ({ over }) => (over ? `Sobre ${String(over.id).replace("|", " el ")}.` : "Fuera del tablero."),
  onDragEnd: ({ over }) => (over ? "Bloque soltado." : "Arrastre cancelado."),
  onDragCancel: () => "Arrastre cancelado.",
};

/** Texto del destino bajo el bloque arrastrado, y si se podría soltar ahí. */
function DestinoArrastre({
  ctx,
  nombres,
  probar,
}: {
  ctx: ContextoEdicion;
  nombres: Record<string, string>;
  probar: (op: Operacion) => string | null;
}) {
  const [texto, setTexto] = useState<{ clave: string; texto: string; error: boolean } | null>(null);
  const actualizar = (active: Active, over: Over | null) => {
    const op = moverAlSoltar(active, over, ctx);
    if (!op || op.tipo !== "mover") {
      setTexto(null);
      return;
    }
    const b = active.data.current?.bloque as BloqueTablero;
    const clave = `${op.agenteNumero}|${op.fecha}|${op.inicioMin}`;
    if (texto?.clave === clave) return;
    const fin = op.inicioMin + (b.finMin - b.inicioMin);
    const error = probar(op);
    const t = `${op.agenteNumero} ${nombres[op.agenteNumero] ?? ""} · ${fechaDiaMes(op.fecha)} ${rangoCorto(op.inicioMin, fin)}`;
    setTexto({ clave, texto: error ? `${t} — ${error}` : t, error: error != null });
  };
  useDndMonitor({
    onDragMove: ({ active, over }) => actualizar(active, over),
    onDragOver: ({ active, over }) => actualizar(active, over),
    onDragEnd: () => setTexto(null),
    onDragCancel: () => setTexto(null),
  });
  if (!texto) return null;
  return (
    <div
      className={cn(
        "absolute top-full left-0 mt-1 max-w-md rounded px-1.5 py-0.5 text-[11px] whitespace-normal text-background shadow",
        texto.error ? "bg-destructive" : "bg-foreground",
      )}
    >
      {texto.texto}
    </div>
  );
}

/**
 * Tablero de planificación de un mes. Recibe la versión con su foto de
 * entrada y lo recalcula todo en el navegador con las funciones puras del
 * motor: mínimos, cobertura, validaciones, barras, saldo. En un borrador y
 * para supervisión es EDITABLE: arrastrar, estirar, dividir, cambiar de
 * cliente... (también por menú y teclado), con deshacer. Las ediciones se
 * guardan por lotes de operaciones con la revisión leída; el servidor las
 * repite y valida. La vista, la semana y el día viajan en la URL sin recargar.
 */
export function Tablero({
  datos,
  vistaInicial,
  semanaInicial,
  diaInicial,
  acciones,
  editable = false,
  puedeEditar = false,
  accionesServidor,
}: {
  datos: DatosTablero;
  vistaInicial: VistaTablero;
  semanaInicial: string;
  diaInicial: string;
  /** Botones de supervisión (Generar...). Vacío en lectura. */
  acciones?: React.ReactNode;
  /** Borrador y rol de supervisión: se puede editar y publicar. */
  editable?: boolean;
  /** El rol puede editar (para ofrecer «nuevo borrador desde la publicada»). */
  puedeEditar?: boolean;
  accionesServidor?: AccionesServidor;
}) {
  const { entrada, nombres, version } = datos;
  const base = entrada.clienteBase;
  const paso = entrada.pasoMin;

  const [vista, setVista] = useState<VistaTablero>(vistaInicial);
  const [semana, setSemana] = useState(semanaInicial);
  const [dia, setDia] = useState(diaInicial);
  const [resaltado, setResaltado] = useState<string | null>(null);

  // ---------- Edición ----------
  const [edicion, despachar] = useReducer(reductorEdicion, null, () => ({
    guardados: datos.bloques,
    pasado: [],
    presente: { bloques: datos.bloques, ops: [] },
    futuro: [],
    aviso: null,
    foco: null,
  }));
  const bloques = edicion.presente.bloques;
  const pendientes = edicion.presente.ops;
  const [revision, setRevision] = useState(version.revision);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const [menu, setMenu] = useState<EstadoMenuBloque | null>(null);
  const [moverA, setMoverA] = useState<BloqueTablero | null>(null);
  const [nuevo, setNuevo] = useState<{ agente: string; fecha: string; inicioMin: number } | null>(null);
  const [arrastre, setArrastre] = useState<{ bloque: BloqueTablero; ancho: number } | null>(null);
  const ultimoArrastre = useRef(0);
  const pxFranja = useRef(0);
  const sePuedeEditar = editable && accionesServidor != null && conflicto == null;

  // ---------- Derivados de la entrada (no cambian al navegar ni al editar) ----------
  const franjas = useMemo(() => generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, paso), [entrada, paso]);
  const semanas = useMemo(() => semanasDelMes(entrada.dias), [entrada]);
  const semanaDe = useMemo(() => Object.fromEntries(entrada.dias.map((d) => [d.fecha, d.lunes])), [entrada]);
  const clientes = useMemo(
    () =>
      new Map<string, ClienteVista>(
        entrada.clientes.map((c) => [c.codigo, { codigo: c.codigo, nombre: c.nombre, color: c.color, texto: colorTexto(c.color) }]),
      ),
    [entrada],
  );
  const contexto = useMemo(() => construirContexto(entrada, calcularMinimos(entrada)), [entrada]);
  // Filas: los que el motor planificó y quien tenga bloques guardados (igual que el servidor)
  const numerosFila = useMemo(() => agentesConFila(datos.activos, datos.bloques), [datos.activos, datos.bloques]);
  const ctxEdicion = useMemo(() => construirContextoEdicion(entrada, numerosFila, contexto), [entrada, numerosFila, contexto]);
  const diasColumna = useMemo<DiaColumna[]>(
    () =>
      entrada.dias.map((d) => ({
        fecha: d.fecha,
        diaSemana: d.diaSemana,
        laborable: d.laborable,
        festivo: contexto.festivos.has(d.fecha),
      })),
    [entrada, contexto],
  );
  const agentes = useMemo<AgenteFila[]>(() => {
    const porNumero = new Map(entrada.agentes.map((a) => [a.numero, a]));
    // Con bloques pero fuera de la foto (p. ej. un fijado de alguien que ya no está en plantilla)
    return numerosFila.map((numero) => porNumero.get(numero) ?? { numero, contratoSemanalH: null, turnos: {}, ausencias: [] });
  }, [numerosFila, entrada]);
  const noPlanificados = useMemo(() => {
    const conFila = new Set(numerosFila);
    return entrada.agentes
      .filter((a) => !conFila.has(a.numero))
      .map((a) => ({
        numero: a.numero,
        // Los mensajes del motor empiezan por el nº («0950: sin sesiones...»)
        motivo:
          datos.avisosGeneracion
            .find((x) => x.agente === a.numero)
            ?.mensaje.replace(`${a.numero}: `, "") ?? "sin bloques este mes",
      }));
  }, [numerosFila, entrada, datos.avisosGeneracion]);
  const capacidadH = useMemo(() => {
    const activos = new Set(datos.activos);
    return capacidadPlan(entrada, entrada.agentes.filter((a) => activos.has(a.numero)));
  }, [entrada, datos.activos]);

  // ---------- Derivados del plan (cambian al editar) ----------
  const incidencias = useMemo(() => validarPlan(bloques, contexto), [bloques, contexto]);
  const cobertura = useMemo(() => coberturaBase(bloques, contexto), [bloques, contexto]);
  const porAgenteDia = useMemo(() => bloquesPorAgenteDia(bloques), [bloques]);
  const horasCliente = useMemo(() => horasPorCliente(bloques, semanaDe), [bloques, semanaDe]);
  const horasAgentes = useMemo(() => horasPorAgente(bloques, semanaDe), [bloques, semanaDe]);
  const saldos = useMemo(
    () => saldosPrevistos(entrada, agentes, bloques, (t) => datos.tiposAusencia[t]?.computaComoTrabajada ?? false),
    [entrada, agentes, bloques, datos.tiposAusencia],
  );
  const barras = useMemo(
    () => barrasBolsa(entrada.clientes, horasCliente, entrada.objetivos, entrada.bolsas),
    [entrada, horasCliente],
  );
  const planificadoH = useMemo(() => bloques.reduce((a, b) => a + (b.finMin - b.inicioMin) / 60, 0), [bloques]);
  const recuento = useMemo(
    () => contarGravedades([...incidencias, ...datos.avisosGeneracion]),
    [incidencias, datos.avisosGeneracion],
  );
  const incidenciasAgente = useMemo(() => {
    const mapa = new Map<string, { duras: number; blandas: number }>();
    for (const a of incidencias) {
      if (!a.agente || !a.fecha) continue;
      const k = `${a.agente}|${semanaDe[a.fecha] ?? lunesDe(a.fecha)}`;
      const r = mapa.get(k) ?? { duras: 0, blandas: 0 };
      if (a.gravedad === "dura") r.duras++;
      else if (a.gravedad === "blanda") r.blandas++;
      mapa.set(k, r);
    }
    return mapa;
  }, [incidencias, semanaDe]);
  const opsAusencias = useMemo(
    () => (sePuedeEditar ? operacionesQuitarAusencias(bloques, ctxEdicion) : []),
    [sePuedeEditar, bloques, ctxEdicion],
  );

  // ---------- Acciones de edición (estables: los bloques van memoizados) ----------
  const aplicar = useCallback(
    (ops: Operacion[], opciones: { foco?: boolean; texto?: string } = {}) => {
      if (guardando) return;
      despachar({ tipo: "aplicar", ops, ctx: ctxEdicion, foco: opciones.foco ?? true, texto: opciones.texto });
    },
    [ctxEdicion, guardando],
  );
  const probar = useCallback(
    (op: Operacion) => {
      const r = aplicarOperacion(bloques, op, ctxEdicion);
      return r.ok ? null : r.error;
    },
    [bloques, ctxEdicion],
  );
  const abrirMenu = useCallback((b: BloqueTablero, ancla: AnclaMenu) => {
    // Al soltar un arrastre el navegador lanza un clic: no abrir el menú
    if (Date.now() - ultimoArrastre.current < 300) return;
    setMenu({ bloque: b, ancla });
  }, []);
  const teclado = useCallback(
    (b: BloqueTablero, e: React.KeyboardEvent) => {
      const una = (op: Operacion) => aplicar([op]);
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowRight": {
          const d = e.key === "ArrowLeft" ? -paso : paso;
          if (e.shiftKey) una({ tipo: "redimensionar", id: b.id, inicioMin: b.inicioMin, finMin: b.finMin + d });
          else if (e.altKey) una({ tipo: "redimensionar", id: b.id, inicioMin: b.inicioMin + d, finMin: b.finMin });
          else una({ tipo: "mover", id: b.id, agenteNumero: b.agenteNumero, fecha: b.fecha, inicioMin: b.inicioMin + d });
          return true;
        }
        case "ArrowUp":
        case "ArrowDown": {
          const i = numerosFila.indexOf(b.agenteNumero);
          const otro = numerosFila[i + (e.key === "ArrowUp" ? -1 : 1)];
          if (otro) una({ tipo: "mover", id: b.id, agenteNumero: otro, fecha: b.fecha, inicioMin: b.inicioMin });
          return true;
        }
        case "Delete":
        case "Backspace":
          una({ tipo: "eliminar", id: b.id });
          return true;
        case "ContextMenu":
          abrirMenu(b, e.currentTarget);
          return true;
        case "F10":
          if (!e.shiftKey) return false;
          abrirMenu(b, e.currentTarget);
          return true;
        default:
          return false;
      }
    },
    [aplicar, paso, numerosFila, abrirMenu],
  );
  const redimensionar = useCallback(
    (b: BloqueTablero, inicioMin: number, finMin: number) => aplicar([{ tipo: "redimensionar", id: b.id, inicioMin, finMin }], { foco: false }),
    [aplicar],
  );
  const nuevoBloque = useCallback(
    (agente: string, fecha: string, minuto: number) => {
      const inicioMin = Math.max(
        entrada.inicioDiaMin,
        Math.min(entrada.finDiaMin - paso, entrada.inicioDiaMin + Math.floor((minuto - entrada.inicioDiaMin) / paso) * paso),
      );
      setNuevo({ agente, fecha, inicioMin });
    },
    [entrada, paso],
  );
  const accionesBloque = useMemo(
    () => (sePuedeEditar ? { abrirMenu, teclado, redimensionar, pasoMin: paso, nuevoBloque } : null),
    [sePuedeEditar, abrirMenu, teclado, redimensionar, paso, nuevoBloque],
  );

  const ctxCeldas = useMemo<ContextoCeldas>(
    () => ({
      clientes,
      clienteBase: base,
      inicioDiaMin: entrada.inicioDiaMin,
      finDiaMin: entrada.finDiaMin,
      nFranjas: franjas.length,
      tiposAusencia: datos.tiposAusencia,
      edicion: accionesBloque,
    }),
    [clientes, base, entrada, franjas, datos.tiposAusencia, accionesBloque],
  );

  // Foco tras una edición con teclado o menú (el bloque puede haber cambiado de celda)
  useEffect(() => {
    if (!edicion.foco) return;
    document.querySelector<HTMLElement>(`[data-bloque-id="${edicion.foco.id}"]`)?.focus();
  }, [edicion.foco]);

  // Guardar
  const guardar = useCallback(() => {
    if (!accionesServidor || pendientes.length === 0 || guardando || conflicto) return;
    const operaciones = pendientes;
    iniciarGuardado(async () => {
      try {
        const r = await accionesServidor.guardar({ versionId: version.id, revision, operaciones });
        if (r.ok) {
          setRevision(r.revision);
          despachar({
            tipo: "reiniciar",
            bloques: r.bloques,
            texto: `Guardado (${operaciones.length} ${operaciones.length === 1 ? "operación" : "operaciones"}, ${r.tramos} ${r.tramos === 1 ? "tramo cambiado" : "tramos cambiados"}).`,
          });
        } else if (r.conflicto) {
          setConflicto(r.error);
        } else {
          despachar({ tipo: "aviso", texto: r.error, error: true });
        }
      } catch {
        despachar({ tipo: "aviso", texto: "No se ha podido guardar (¿sin conexión?): vuelve a intentarlo.", error: true });
      }
    });
  }, [accionesServidor, pendientes, guardando, conflicto, version.id, revision]);

  // Atajos globales: deshacer, rehacer y guardar (no dentro de formularios, diálogos ni menús)
  useEffect(() => {
    if (!sePuedeEditar) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [role=dialog], [role=menu]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        if (!guardando) despachar({ tipo: "deshacer" });
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        if (!guardando) despachar({ tipo: "rehacer" });
      } else if (k === "s") {
        e.preventDefault();
        guardar();
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [sePuedeEditar, guardando, guardar]);

  // Avisar antes de salir con cambios sin guardar (en conflicto ya no se pueden
  // guardar: el aviso del tablero lo dice y «Recargar» no debe preguntar otra vez)
  const hayPendientes = pendientes.length > 0 && conflicto == null;
  useEffect(() => {
    if (!hayPendientes) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayPendientes]);

  // ---------- Arrastre ----------
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ajustarAFranja = useMemo<Modifier>(
    () =>
      ({ transform }) =>
        pxFranja.current > 0 ? { ...transform, x: Math.round(transform.x / pxFranja.current) * pxFranja.current } : transform,
    [],
  );
  const modificadores = useMemo(() => [ajustarAFranja, restrictToWindowEdges], [ajustarAFranja]);
  const alEmpezarArrastre = useCallback(
    (e: DragStartEvent) => {
      const b = e.active.data.current?.bloque as BloqueTablero | undefined;
      if (!b) return;
      const nodo = document.querySelector<HTMLElement>(`[data-bloque-id="${b.id}"]`);
      const celda = nodo?.closest<HTMLElement>("[data-celda]");
      pxFranja.current = celda ? celda.getBoundingClientRect().width / franjas.length : 0;
      setMenu(null);
      setArrastre({ bloque: b, ancho: nodo?.getBoundingClientRect().width ?? 60 });
    },
    [franjas.length],
  );
  const alSoltar = useCallback(
    (e: DragEndEvent) => {
      setArrastre(null);
      ultimoArrastre.current = Date.now();
      const op = moverAlSoltar(e.active, e.over, ctxEdicion);
      if (op) aplicar([op], { foco: false });
    },
    [ctxEdicion, aplicar],
  );

  // ---------- Lo visible ----------
  // Días que se pintan: de lunes a viernes, y el fin de semana solo si hay turno o bloques
  const diaVisible = useCallback(
    (d: DiaColumna) =>
      d.diaSemana < 5 || bloques.some((b) => b.fecha === d.fecha) || agentes.some((a) => (a.turnos[d.fecha] ?? []).length > 0),
    [bloques, agentes],
  );
  // Semanas con algún día que pintar (en noviembre, la del 26/10 solo trae el domingo 01/11)
  const semanasNav = useMemo(() => {
    const conDia = new Set(diasColumna.filter(diaVisible).map((d) => semanaDe[d.fecha]));
    const lista = semanas.filter((s) => conDia.has(s.lunes));
    return lista.length > 0 ? lista : semanas;
  }, [semanas, diasColumna, diaVisible, semanaDe]);
  const semanaActual = semanasNav.find((s) => s.lunes === semana) ?? semanasNav[0];
  const diasSemana = useMemo(
    () => diasColumna.filter((d) => semanaDe[d.fecha] === semanaActual.lunes && diaVisible(d)),
    [diasColumna, semanaDe, semanaActual, diaVisible],
  );
  const diaActual = diasColumna.find((d) => d.fecha === dia) ?? diasSemana[0] ?? diasColumna[0];

  const construirFilas = useCallback(
    (dias: readonly DiaColumna[]): FilaAgenteDatos[] =>
      agentes.map((a) => {
        const bloquesDia: Record<string, BloqueTablero[]> = {};
        const turnos: FilaAgenteDatos["turnos"] = {};
        const ausencias: FilaAgenteDatos["ausencias"] = {};
        for (const d of dias) {
          bloquesDia[d.fecha] = porAgenteDia.get(`${a.numero}|${d.fecha}`) ?? VACIO;
          turnos[d.fecha] = d.festivo ? [] : (a.turnos[d.fecha] ?? []);
          ausencias[d.fecha] = a.ausencias.filter((x) => x.fecha === d.fecha);
        }
        const lunes = semanaDe[dias[0]?.fecha] ?? "";
        const incid = incidenciasAgente.get(`${a.numero}|${lunes}`);
        return {
          numero: a.numero,
          nombre: nombres[a.numero] ?? "",
          contratoSemanalH: a.contratoSemanalH,
          horasSemana: horasAgentes.semana.get(`${a.numero}|${lunes}`) ?? 0,
          horasMes: horasAgentes.mes.get(a.numero) ?? 0,
          saldoSemana: saldos.get(`${a.numero}|${lunes}`) ?? null,
          saldoMes: saldos.get(`${a.numero}|mes`) ?? null,
          bloques: bloquesDia,
          turnos,
          ausencias,
          duras: incid?.duras ?? 0,
          blandas: incid?.blandas ?? 0,
        };
      }),
    [agentes, porAgenteDia, semanaDe, incidenciasAgente, nombres, horasAgentes, saldos],
  );
  const filasSemana = useMemo(() => construirFilas(diasSemana), [construirFilas, diasSemana]);
  const filasDia = useMemo(() => (diaActual ? construirFilas([diaActual]) : []), [construirFilas, diaActual]);

  // ---------- URL: vista, semana y día sin recargar ----------
  useEffect(() => {
    // En un setTimeout para que lo reciba el replaceState que parchea Next (lo
    // instala en un efecto del router, que corre DESPUÉS de este en el primer
    // montaje): así conserva su estado interno del historial y sabe la URL
    // nueva. Con el original, «Atrás» desde otra página no volvía al tablero.
    const id = window.setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      p.set("vista", vista);
      p.set("semana", vista === "dia" && diaActual ? semanaDe[diaActual.fecha] : semanaActual.lunes);
      if (vista === "dia" && diaActual) p.set("dia", diaActual.fecha);
      else p.delete("dia");
      const url = `${window.location.pathname}?${p.toString()}`;
      if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
    }, 0);
    return () => window.clearTimeout(id);
  }, [vista, semanaActual, diaActual, semanaDe]);

  useEffect(() => {
    if (resaltado) document.getElementById(`fila-${resaltado}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [resaltado, semana, vista]);

  // ---------- Navegación ----------
  const iSemana = semanasNav.findIndex((s) => s.lunes === semanaActual.lunes);
  const irSemana = (delta: number) => {
    const s = semanasNav[iSemana + delta];
    if (s) setSemana(s.lunes);
  };
  const laborables = diasColumna.filter((d) => d.laborable || bloques.some((b) => b.fecha === d.fecha));
  const iDia = laborables.findIndex((d) => d.fecha === diaActual?.fecha);
  const irDia = (fecha: string) => {
    setDia(fecha);
    setSemana(semanaDe[fecha]);
  };
  const irAviso = useCallback(
    (a: Aviso) => {
      if (a.fecha) {
        const lunes = semanaDe[a.fecha] ?? lunesDe(a.fecha);
        if (semanas.some((s) => s.lunes === lunes)) setSemana(lunes);
        if (semanaDe[a.fecha]) setDia(a.fecha);
      }
      if (a.agente) {
        setVista((v) => (v === "cliente" ? "agente" : v));
        setResaltado(a.agente);
      }
    },
    [semanaDe, semanas],
  );

  // ---------- Opciones de los diálogos ----------
  const opcionesAgentes = useMemo<OpcionAgente[]>(
    () =>
      numerosFila.map((numero) => ({
        numero,
        nombre: nombres[numero] ?? "",
        habilidades: contexto.agentes[numero]?.habilidades ?? [],
      })),
    [numerosFila, nombres, contexto],
  );
  const opcionesDias = useMemo<OpcionDia[]>(
    () =>
      diasColumna.map((d) => ({
        fecha: d.fecha,
        etiqueta: `${diaCorto(d.diaSemana)} ${fechaDiaMes(d.fecha)}${d.festivo ? " (festivo)" : ""}`,
      })),
    [diasColumna],
  );
  const listaClientes = useMemo(() => entrada.clientes.map((c) => clientes.get(c.codigo)!), [entrada, clientes]);
  const siguienteUnible = useCallback(
    (b: BloqueTablero) =>
      bloques.some(
        (x) => x.agenteNumero === b.agenteNumero && x.fecha === b.fecha && x.inicioMin === b.finMin && x.clienteCodigo === b.clienteCodigo,
      ),
    [bloques],
  );

  const estado = ESTADO_VERSION[version.estado];
  const vigente = datos.versiones.find((v) => v.estado === "borrador") ?? datos.versiones.find((v) => v.estado === "publicada");
  const hayBorrador = datos.versiones.some((v) => v.estado === "borrador");
  const publicadaAnterior = datos.versiones.find((v) => v.estado === "publicada")?.numero ?? null;
  const ticks = franjas.filter((f) => (f - entrada.inicioDiaMin) % 240 === 0);
  const capacidadGenerar = datos.capacidadH;

  const vistaPlan =
    vista === "agente" ? (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `12rem repeat(${diasSemana.length}, minmax(0, 1fr))` }}>
          <div className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Agente</div>
          {diasSemana.map((d) => (
            <div key={d.fecha} className="border-l px-1 pt-1">
              <button
                type="button"
                className="text-xs font-medium hover:underline"
                onClick={() => {
                  setDia(d.fecha);
                  setVista("dia");
                }}
                title="Ver el día"
              >
                {diaCorto(d.diaSemana)} {fechaDiaMes(d.fecha)}
              </button>
              {d.festivo ? <span className="ml-1 text-[10px] text-muted-foreground">festivo</span> : null}
              <div className="relative h-3 text-[9px] text-muted-foreground" aria-hidden>
                {ticks.map((f) => (
                  <span
                    key={f}
                    className="absolute"
                    style={{ left: `${posicionPct(f, f + paso, entrada.inicioDiaMin, entrada.finDiaMin).left}%` }}
                  >
                    {horaCorta(f)}
                  </span>
                ))}
                <span className="absolute right-0">{horaCorta(entrada.finDiaMin)}</span>
              </div>
            </div>
          ))}

          <div className="sticky left-0 z-10 flex items-center border-t border-r bg-card px-2 text-xs font-medium">
            {base} / mínimo
          </div>
          {diasSemana.map((d) => (
            <MapaCoberturaDia
              key={d.fecha}
              fecha={d.fecha}
              diaSemana={d.diaSemana}
              franjas={franjas}
              pasoMin={paso}
              cobertura={cobertura[d.fecha]}
              minimos={contexto.minimos[d.fecha]}
              clienteBase={base}
            />
          ))}

          {filasSemana.map((f) => (
            <FilaAgente key={f.numero} fila={f} dias={diasSemana} ctx={ctxCeldas} resaltado={resaltado === f.numero} />
          ))}
        </div>
      </div>
    ) : vista === "cliente" ? (
      <VistaCliente
        clientes={entrada.clientes.map((c) => ({ ...clientes.get(c.codigo)!, modo: c.modo }))}
        dias={diasSemana}
        franjas={franjas}
        pasoMin={paso}
        clienteBase={base}
        bloques={bloques}
        cobertura={cobertura}
        minimos={contexto.minimos}
        nombres={nombres}
      />
    ) : diaActual ? (
      <VistaDia
        dia={diaActual}
        filas={filasDia}
        franjas={franjas}
        pasoMin={paso}
        clienteBase={base}
        cobertura={cobertura[diaActual.fecha]}
        minimos={contexto.minimos[diaActual.fecha]}
        ctx={ctxCeldas}
        resaltado={resaltado}
      />
    ) : null;

  return (
    <TooltipProvider delay={150}>
      <div className="space-y-4">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              <Link href="/planificacion" className="hover:underline">
                Planificación
              </Link>{" "}
              /
            </div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              {nombreMes(version.mes)}
              <Badge className={estado.clase}>
                {estado.texto} · v{version.numero}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Generada el {version.creadaAt} por {version.creadaPor ?? "—"} con datos hasta el{" "}
              {fechaDiaMes(entrada.fechaDatos)}/{entrada.fechaDatos.slice(0, 4)}
              {version.publicadaAt ? ` · publicada el ${version.publicadaAt} por ${version.publicadaPor ?? "—"}` : ""} ·{" "}
              {horasTexto(planificadoH)} planificadas de{" "}
              <span
                title={
                  capacidadGenerar != null && Math.abs(capacidadGenerar - capacidadH) > 0.004
                    ? `Al generar eran ${horasTexto(capacidadGenerar)}: las ausencias de después ya cuentan.`
                    : "Turnos − ausencias − festivos de los agentes planificados."
                }
              >
                {horasTexto(capacidadH)} de capacidad
              </span>{" "}
              · {bloques.length} bloques
            </p>
            <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Páginas del mes">
              <Link href={`/planificacion/${version.mes}/ausencias`} className="inline-flex items-center gap-1 underline">
                <CalendarOff className="size-3" /> Ausencias
              </Link>
              <Link href={`/planificacion/${version.mes}/bolsas`} className="inline-flex items-center gap-1 underline">
                <Wallet className="size-3" /> Bolsas y objetivos
              </Link>
              <Link href={`/planificacion/${version.mes}/versiones`} className="inline-flex items-center gap-1 underline">
                <GitCompare className="size-3" /> Versiones y cambios ({datos.versiones.length})
              </Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <BotonAyuda pantalla="tablero" atajo />
            {acciones}
            {editable && accionesServidor ? (
              <DialogoPublicar
                // Se vuelve a montar con cada guardado: así el recuento es siempre el del plan guardado
                key={revision}
                accion={accionesServidor.publicar}
                versionId={version.id}
                numero={version.numero}
                nombreMes={nombreMes(version.mes)}
                revision={revision}
                duras={incidencias.filter((a) => a.gravedad === "dura")}
                blandas={[...incidencias, ...datos.avisosGeneracion].filter((a) => a.gravedad === "blanda")}
                pendientes={pendientes.length}
                publicadaAnterior={publicadaAnterior}
              />
            ) : null}
            {puedeEditar && accionesServidor && version.estado === "publicada" && !hayBorrador ? (
              <BotonBorradorDesdePublicada accion={accionesServidor.copiarPublicada} versionId={version.id} numero={version.numero} />
            ) : null}
          </div>
        </div>

        {vigente && vigente.id !== version.id ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Estás viendo una versión {estado.texto.toLowerCase()}. La vigente es la{" "}
            <Link href={`/planificacion/${version.mes}`} className="font-medium underline">
              v{vigente.numero}
            </Link>
            .
          </div>
        ) : null}

        {conflicto ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {conflicto} Tus {pendientes.length} cambios sin guardar no se pueden aplicar encima: recarga para ver la
                versión actual.
              </span>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                Recargar
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Barra de edición */}
        {editable && accionesServidor && !conflicto ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => despachar({ tipo: "deshacer" })}
              disabled={edicion.pasado.length === 0 || guardando}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 /> Deshacer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => despachar({ tipo: "rehacer" })}
              disabled={edicion.futuro.length === 0 || guardando}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 /> Rehacer
            </Button>
            <Button size="sm" onClick={guardar} disabled={pendientes.length === 0 || guardando} title="Guardar (Ctrl+S)">
              <Save /> {guardando ? "Guardando…" : `Guardar cambios${pendientes.length > 0 ? ` (${pendientes.length})` : ""}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => despachar({ tipo: "descartar" })} disabled={pendientes.length === 0 || guardando}>
              Descartar
            </Button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNuevo({ agente: numerosFila[0] ?? "", fecha: diaActual?.fecha ?? entrada.dias[0].fecha, inicioMin: entrada.inicioDiaMin })}
              disabled={guardando || numerosFila.length === 0}
            >
              <Plus /> Añadir bloque
            </Button>
            {opsAusencias.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  aplicar(opsAusencias, {
                    foco: false,
                    texto: `Quitado lo que pisaba ausencias en ${opsAusencias.length} ${opsAusencias.length === 1 ? "día" : "días"}.`,
                  })
                }
                disabled={guardando}
              >
                <Eraser /> Quitar lo que pisa ausencias ({opsAusencias.length})
              </Button>
            ) : null}
            <span
              className={cn("ml-auto text-xs", edicion.aviso?.error ? "font-medium text-destructive" : "text-muted-foreground")}
              role="status"
              aria-live="polite"
            >
              {edicion.aviso?.texto ??
                (pendientes.length > 0
                  ? `${pendientes.length} ${pendientes.length === 1 ? "cambio" : "cambios"} sin guardar`
                  : "Arrastra, estira o pulsa un bloque para cambiarlo. Con «?», la ayuda.")}
            </span>
          </div>
        ) : null}

        {/* Controles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Vista del tablero">
            {(Object.keys(NOMBRE_VISTA) as VistaTablero[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  vista === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {NOMBRE_VISTA[v]}
              </button>
            ))}
          </div>

          {vista === "dia" && diaActual ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Día anterior"
                disabled={iDia <= 0}
                onClick={() => irDia(laborables[iDia - 1].fecha)}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-44 text-center text-sm font-medium">
                {diaCorto(diaActual.diaSemana)} {fechaDiaMes(diaActual.fecha)} · semana {semanas.find((s) => s.lunes === semanaDe[diaActual.fecha])?.rotacion}
                {diaActual.festivo ? " · festivo" : ""}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Día siguiente"
                disabled={iDia < 0 || iDia >= laborables.length - 1}
                onClick={() => irDia(laborables[iDia + 1].fecha)}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Semana anterior" disabled={iSemana <= 0} onClick={() => irSemana(-1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-44 text-center text-sm font-medium">
                Semana {fechaDiaMes(semanaActual.fechas[0])}–{fechaDiaMes(semanaActual.fechas[semanaActual.fechas.length - 1])} ·{" "}
                {semanaActual.rotacion}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Semana siguiente"
                disabled={iSemana >= semanasNav.length - 1}
                onClick={() => irSemana(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}

          <a href="#incidencias" className="flex items-center gap-3 text-sm hover:underline">
            <span className="inline-flex items-center gap-1">
              <OctagonAlert className="size-4 text-destructive" /> {recuento.dura} duras
            </span>
            <span className="inline-flex items-center gap-1">
              <TriangleAlert className="size-4 text-amber-600" /> {recuento.blanda} blandas
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Info className="size-4" /> {recuento.info}
            </span>
          </a>
        </div>

        {/* Bolsas y objetivos del mes */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">
              Horas del mes frente a bolsas y objetivos
              <PuntoAyuda id="barras-horas" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasBolsa barras={barras} clientes={clientes} semanas={semanas} horasCliente={horasCliente} />
          </CardContent>
        </Card>

        {/* Vista */}
        {sePuedeEditar ? (
          <DndContext
            sensors={sensores}
            collisionDetection={pointerWithin}
            modifiers={modificadores}
            onDragStart={alEmpezarArrastre}
            onDragEnd={alSoltar}
            onDragCancel={() => setArrastre(null)}
            accessibility={{ screenReaderInstructions: { draggable: INSTRUCCIONES }, announcements: ANUNCIOS }}
          >
            <div className={cn(guardando && "pointer-events-none opacity-70")} aria-busy={guardando}>
              {vistaPlan}
            </div>
            <DragOverlay dropAnimation={null}>
              {arrastre ? (
                <div className="relative">
                  <BloqueFantasma
                    bloque={arrastre.bloque}
                    cliente={clientes.get(arrastre.bloque.clienteCodigo) ?? { codigo: arrastre.bloque.clienteCodigo, nombre: "", color: "#E5E5E5", texto: "#000000" }}
                    ancho={arrastre.ancho}
                  />
                  <DestinoArrastre ctx={ctxEdicion} nombres={nombres} probar={probar} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          vistaPlan
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <LeyendaCobertura clienteBase={base} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-muted-foreground/15" aria-hidden /> turno sin bloque
            </span>
            {[...clientes.values()].map((c) => (
              <span key={c.codigo} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-5 rounded-sm border border-black/15"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                {c.codigo}
              </span>
            ))}
          </div>
        </div>

        {noPlanificados.length > 0 ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Sin planificar este mes</CardTitle>
              <CardDescription>Agentes de la plantilla que el motor dejó fuera.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {noPlanificados.map((a) => (
                  <li key={a.numero}>
                    <span className="font-medium text-foreground">
                      {a.numero} {nombres[a.numero] ?? ""}
                    </span>
                    : {a.motivo}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <PanelIncidencias
          incidencias={incidencias}
          avisosGeneracion={datos.avisosGeneracion}
          nombres={nombres}
          onIr={irAviso}
        />

        {sePuedeEditar ? (
          <>
            <MenuBloque
              estado={menu}
              onCerrar={() => {
                const id = menu?.bloque.id;
                setMenu(null);
                if (id != null) {
                  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-bloque-id="${id}"]`)?.focus());
                }
              }}
              clientes={listaClientes}
              clienteBase={base}
              habilidades={(agente) => contexto.agentes[agente]?.habilidades ?? []}
              nombreAgente={(agente) => `${agente} ${nombres[agente] ?? ""}`.trim()}
              pasoMin={paso}
              siguienteUnible={siguienteUnible}
              onOperacion={(op) => aplicar([op])}
              onMoverA={setMoverA}
            />
            <DialogoMoverA
              bloque={moverA}
              onCerrar={() => setMoverA(null)}
              agentes={opcionesAgentes}
              dias={opcionesDias}
              franjas={franjas}
              pasoMin={paso}
              finDiaMin={entrada.finDiaMin}
              probar={probar}
              onAplicar={(op) => {
                aplicar([op]);
                if (op.tipo === "mover" && semanaDe[op.fecha]) {
                  setSemana(semanaDe[op.fecha]);
                  setDia(op.fecha);
                }
              }}
            />
            <DialogoNuevoBloque
              inicial={nuevo}
              onCerrar={() => setNuevo(null)}
              agentes={opcionesAgentes}
              dias={opcionesDias}
              franjas={franjas}
              pasoMin={paso}
              finDiaMin={entrada.finDiaMin}
              clientes={listaClientes}
              probar={probar}
              onAplicar={(op) => aplicar([op])}
            />
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
