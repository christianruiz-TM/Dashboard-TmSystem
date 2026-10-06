"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CopyPlus, Send } from "lucide-react";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { horaCorta, rangoCorto, type Aviso } from "@/lib/planificacion/motor";
import type { Operacion } from "@/lib/planificacion/edicion";
import { TITULOS_AVISO, type BloqueTablero } from "@/lib/planificacion/tablero";
import { PuntoAyuda } from "./punto-ayuda";

export type EstadoFormulario = { error: string | null };
export type AccionFormulario = (previo: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

export interface OpcionAgente {
  numero: string;
  nombre: string;
  habilidades: readonly string[];
}

export interface OpcionDia {
  fecha: string;
  etiqueta: string;
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

/**
 * «Mover a…»: la alternativa de teclado al arrastre. Comprueba la operación
 * antes de aplicarla (`probar`, con las mismas reglas que al soltar) y avisa
 * en el propio diálogo si no se puede.
 */
export function DialogoMoverA({
  bloque,
  onCerrar,
  agentes,
  dias,
  franjas,
  pasoMin,
  finDiaMin,
  probar,
  onAplicar,
}: {
  bloque: BloqueTablero | null;
  onCerrar: () => void;
  agentes: readonly OpcionAgente[];
  dias: readonly OpcionDia[];
  franjas: readonly number[];
  pasoMin: number;
  finDiaMin: number;
  probar: (op: Operacion) => string | null;
  onAplicar: (op: Operacion) => void;
}) {
  return (
    <Dialog open={bloque != null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {bloque ? (
          <FormularioMover
            key={bloque.id}
            bloque={bloque}
            agentes={agentes}
            dias={dias}
            franjas={franjas}
            pasoMin={pasoMin}
            finDiaMin={finDiaMin}
            probar={probar}
            onAplicar={(op) => {
              onAplicar(op);
              onCerrar();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FormularioMover({
  bloque,
  agentes,
  dias,
  franjas,
  pasoMin,
  finDiaMin,
  probar,
  onAplicar,
}: {
  bloque: BloqueTablero;
  agentes: readonly OpcionAgente[];
  dias: readonly OpcionDia[];
  franjas: readonly number[];
  pasoMin: number;
  finDiaMin: number;
  probar: (op: Operacion) => string | null;
  onAplicar: (op: Operacion) => void;
}) {
  const duracion = bloque.finMin - bloque.inicioMin;
  const [agente, setAgente] = useState(bloque.agenteNumero);
  const [fecha, setFecha] = useState(bloque.fecha);
  const [inicio, setInicio] = useState(bloque.inicioMin);
  const op: Operacion = { tipo: "mover", id: bloque.id, agenteNumero: agente, fecha, inicioMin: inicio };
  const mismo = agente === bloque.agenteNumero && fecha === bloque.fecha && inicio === bloque.inicioMin;
  const error = mismo ? null : probar(op);
  const horas = franjas.filter((f) => f + duracion <= finDiaMin && (f - franjas[0]) % pasoMin === 0);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismo && !error) onAplicar(op);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Mover {bloque.clienteCodigo} {rangoCorto(bloque.inicioMin, bloque.finMin)}
        </DialogTitle>
        <DialogDescription>
          Lo que haya en el destino se recorta. Si el bloque no es del cliente base, su hueco vuelve al cliente base dentro del turno.
        </DialogDescription>
      </DialogHeader>
      <Campo id="mover-agente" etiqueta="Agente">
        <SelectNativo id="mover-agente" value={agente} onChange={(e) => setAgente(e.target.value)}>
          {agentes.map((a) => (
            <option key={a.numero} value={a.numero}>
              {a.numero} {a.nombre}
              {a.habilidades.includes(bloque.clienteCodigo) ? "" : ` (sin usuario de ${bloque.clienteCodigo})`}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="mover-fecha" etiqueta="Día">
          <SelectNativo id="mover-fecha" value={fecha} onChange={(e) => setFecha(e.target.value)}>
            {dias.map((d) => (
              <option key={d.fecha} value={d.fecha}>
                {d.etiqueta}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="mover-inicio" etiqueta="Desde">
          <SelectNativo id="mover-inicio" value={inicio} onChange={(e) => setInicio(Number(e.target.value))}>
            {horas.map((f) => (
              <option key={f} value={f}>
                {rangoCorto(f, f + duracion)} h
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={mismo || error != null}>
          Mover
        </Button>
      </DialogFooter>
    </form>
  );
}

/** «Añadir bloque»: en un hueco (doble clic) o desde la barra de edición. */
export function DialogoNuevoBloque({
  inicial,
  onCerrar,
  agentes,
  dias,
  franjas,
  pasoMin,
  finDiaMin,
  clientes,
  probar,
  onAplicar,
}: {
  inicial: { agente: string; fecha: string; inicioMin: number } | null;
  onCerrar: () => void;
  agentes: readonly OpcionAgente[];
  dias: readonly OpcionDia[];
  franjas: readonly number[];
  pasoMin: number;
  finDiaMin: number;
  clientes: readonly { codigo: string; nombre: string }[];
  probar: (op: Operacion) => string | null;
  onAplicar: (op: Operacion) => void;
}) {
  return (
    <Dialog open={inicial != null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {inicial ? (
          <FormularioNuevo
            key={`${inicial.agente}|${inicial.fecha}|${inicial.inicioMin}`}
            inicial={inicial}
            agentes={agentes}
            dias={dias}
            franjas={franjas}
            pasoMin={pasoMin}
            finDiaMin={finDiaMin}
            clientes={clientes}
            probar={probar}
            onAplicar={(op) => {
              onAplicar(op);
              onCerrar();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FormularioNuevo({
  inicial,
  agentes,
  dias,
  franjas,
  pasoMin,
  finDiaMin,
  clientes,
  probar,
  onAplicar,
}: {
  inicial: { agente: string; fecha: string; inicioMin: number };
  agentes: readonly OpcionAgente[];
  dias: readonly OpcionDia[];
  franjas: readonly number[];
  pasoMin: number;
  finDiaMin: number;
  clientes: readonly { codigo: string; nombre: string }[];
  probar: (op: Operacion) => string | null;
  onAplicar: (op: Operacion) => void;
}) {
  const [agente, setAgente] = useState(inicial.agente);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [inicio, setInicio] = useState(inicial.inicioMin);
  const [fin, setFin] = useState(Math.min(inicial.inicioMin + pasoMin, finDiaMin));
  const habilidades = agentes.find((a) => a.numero === agente)?.habilidades ?? [];
  const [cliente, setCliente] = useState(habilidades[0] ?? clientes[0]?.codigo ?? "");
  const op: Operacion = { tipo: "crear", agenteNumero: agente, fecha, inicioMin: inicio, finMin: fin, clienteCodigo: cliente };
  const error = fin <= inicio ? "El bloque tiene que acabar después de empezar." : probar(op);
  const finales = [...franjas.map((f) => f + pasoMin)].filter((f) => f <= finDiaMin);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onAplicar(op);
      }}
    >
      <DialogHeader>
        <DialogTitle>Añadir bloque</DialogTitle>
        <DialogDescription>Lo que ya hubiera a esas horas se recorta.</DialogDescription>
      </DialogHeader>
      <Campo id="nuevo-agente" etiqueta="Agente">
        <SelectNativo id="nuevo-agente" value={agente} onChange={(e) => setAgente(e.target.value)}>
          {agentes.map((a) => (
            <option key={a.numero} value={a.numero}>
              {a.numero} {a.nombre}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <div className="grid grid-cols-3 gap-3">
        <Campo id="nuevo-fecha" etiqueta="Día">
          <SelectNativo id="nuevo-fecha" value={fecha} onChange={(e) => setFecha(e.target.value)}>
            {dias.map((d) => (
              <option key={d.fecha} value={d.fecha}>
                {d.etiqueta}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="nuevo-inicio" etiqueta="Desde">
          <SelectNativo id="nuevo-inicio" value={inicio} onChange={(e) => setInicio(Number(e.target.value))}>
            {franjas.map((f) => (
              <option key={f} value={f}>
                {horaCorta(f)} h
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="nuevo-fin" etiqueta="Hasta">
          <SelectNativo id="nuevo-fin" value={fin} onChange={(e) => setFin(Number(e.target.value))}>
            {finales.map((f) => (
              <option key={f} value={f}>
                {horaCorta(f)} h
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>
      <Campo id="nuevo-cliente" etiqueta="Cliente">
        <SelectNativo id="nuevo-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
          {clientes.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo} · {c.nombre}
              {habilidades.includes(c.codigo) ? "" : " (sin usuario)"}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={error != null}>
          Añadir
        </Button>
      </DialogFooter>
    </form>
  );
}

function BotonEnviar({ children, disabled, variant = "default" }: { children: React.ReactNode; disabled?: boolean; variant?: "default" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={disabled || pending}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

/**
 * «Publicar…». Con incidencias duras no se puede. Con avisos blandos hay que
 * marcarlo expresamente («Publicar con N avisos») y escribir el motivo, que
 * queda en la versión y en la auditoría. El servidor lo vuelve a comprobar
 * todo con los datos de ese momento.
 */
export function DialogoPublicar({
  accion,
  versionId,
  numero,
  nombreMes,
  revision,
  duras,
  blandas,
  pendientes,
  publicadaAnterior,
}: {
  accion: AccionFormulario;
  versionId: number;
  numero: number;
  nombreMes: string;
  revision: number;
  duras: readonly Aviso[];
  blandas: readonly Aviso[];
  /** Operaciones sin guardar: hay que guardar antes. */
  pendientes: number;
  publicadaAnterior: number | null;
}) {
  const [estado, enviar] = useActionState(accion, { error: null });
  const [acepto, setAcepto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const grupos = new Map<string, number>();
  for (const a of blandas) grupos.set(a.codigo, (grupos.get(a.codigo) ?? 0) + 1);
  const n = blandas.length;
  const bloqueado = duras.length > 0 || pendientes > 0;
  const listo = !bloqueado && (n === 0 || (acepto && motivo.trim().length >= 10));

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <Send /> Publicar…
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Publicar la v{numero} de {nombreMes}
          </DialogTitle>
          <DialogDescription>
            {publicadaAnterior != null
              ? `La publicada actual (v${publicadaAnterior}) pasará a «sustituida». `
              : ""}
            Una versión publicada ya no se edita: para cambiarla se crea un borrador nuevo a partir de ella.
          </DialogDescription>
        </DialogHeader>
        <form action={enviar} className="grid gap-3">
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="blandas" value={n} />
          {pendientes > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>Hay {pendientes} cambios sin guardar: guárdalos o descártalos antes de publicar.</AlertDescription>
            </Alert>
          ) : null}
          {duras.length > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>No se puede publicar con {duras.length} incidencias duras. Por ejemplo:</p>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {duras.slice(0, 3).map((a, i) => (
                    <li key={i}>{a.mensaje}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {!bloqueado && n === 0 ? <p className="text-sm">Sin incidencias ni avisos: lista para publicar.</p> : null}
          {!bloqueado && n > 0 ? (
            <>
              <div className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">{n} avisos blandos:</p>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {[...grupos].map(([codigo, cuantos]) => (
                    <li key={codigo}>
                      {TITULOS_AVISO[codigo] ?? codigo}: {cuantos}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="motivo-publicar">Motivo (queda en el registro)</Label>
                <textarea
                  id="motivo-publicar"
                  name="motivo"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={1000}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="p. ej. el déficit de los jueves de 17 a 18 h está aceptado mientras no cambien los turnos"
                />
              </div>
              <div className="flex items-center">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-foreground" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                  Publicar con {n} avisos
                </label>
                <PuntoAyuda id="publicar-avisos" />
              </div>
            </>
          ) : (
            <input type="hidden" name="motivo" value="" />
          )}
          {estado.error ? (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <BotonEnviar disabled={!listo}>{n > 0 ? `Publicar con ${n} avisos` : "Publicar"}</BotonEnviar>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Nuevo borrador a partir de esta versión» (la publicada no se edita). */
export function BotonBorradorDesdePublicada({ accion, versionId, numero }: { accion: AccionFormulario; versionId: number; numero: number }) {
  const [estado, enviar] = useActionState(accion, { error: null });
  return (
    <form action={enviar} className="inline-flex max-w-sm flex-col items-end gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <BotonEnviar variant="outline">
        <CopyPlus /> Nuevo borrador desde la v{numero}
      </BotonEnviar>
      {estado.error ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
