"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CircleHelp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import capturas from "./ayuda-capturas.json";
import {
  buscarAyuda,
  GLOSARIO_AYUDA,
  TAREAS_AYUDA,
  TEMA_DE,
  TEMAS_AYUDA,
  type PantallaAyuda,
  type TareaAyuda,
  type TemaAyuda,
} from "./ayuda-contenido";

// ============================================================
// Ventana «Ayuda» de las pantallas de planificación, para supervisión y en
// lenguaje sencillo. Se abre en el tema de la pantalla donde se pulsa; arriba
// hay un buscador («vacaciones», «publicar»…). Los textos están en
// ayuda-contenido.ts (de ahí sale también la guía compartida) y las capturas
// numeradas en ayuda-capturas.json + public/ayuda/ (scripts/ayuda-capturas.mjs).
// ============================================================

export type { PantallaAyuda };

interface Captura {
  src: string;
  ancho: number;
  alto: number;
  puntos: { n: number; x: number; y: number }[];
}
const CAPTURAS = capturas as Record<string, Captura>;

const TEMAS = [
  { id: "como", etiqueta: "Cómo hago…" },
  ...TEMAS_AYUDA.map((t) => ({ id: t.id, etiqueta: t.etiqueta })),
  { id: "palabras", etiqueta: "Palabras" },
];

const TECLAS: [string, string][] = [
  ["← →", "Mover una hora"],
  ["Mayús + ← →", "Acortar o alargar el final"],
  ["Alt + ← →", "Mover el principio"],
  ["↑ ↓", "Pasarlo a la persona de arriba o de abajo"],
  ["Supr", "Eliminarlo"],
  ["Intro", "Abrir su menú"],
  ["Ctrl + Z / Ctrl + Y", "Deshacer / rehacer"],
  ["Ctrl + S", "Guardar"],
  ["?", "Abrir esta ayuda"],
];

/** Círculo amarillo con un número: el mismo en la captura y en la lista. */
function Numero({ n, className, style }: { n: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      style={style}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#F5CF3D] text-xs font-bold text-black ${className ?? ""}`}
    >
      {n}
    </span>
  );
}

function ImagenNumerada({ id, titulo }: { id: string; titulo: string }) {
  const c = CAPTURAS[id];
  if (!c) return null;
  return (
    <figure className="space-y-1">
      <div className="relative overflow-hidden rounded-md border">
        <Image src={c.src} width={c.ancho} height={c.alto} alt={`Pantalla «${titulo}» con sus partes numeradas`} className="h-auto w-full" unoptimized />
        {c.puntos.map((p) => (
          <Numero
            key={p.n}
            n={p.n}
            className="absolute -translate-x-1/2 -translate-y-1/2 shadow-md"
            // la posición sale de la captura (píxeles) y se pasa a % para que escale con la imagen
            style={{ left: `${(p.x / c.ancho) * 100}%`, top: `${(p.y / c.alto) * 100}%` }}
          />
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Pantalla de ejemplo con datos inventados.{" "}
        <a href={c.src} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          Ver la imagen más grande
        </a>
      </figcaption>
    </figure>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="font-semibold">{titulo}</h4>
      {children}
    </section>
  );
}

function VistaTema({ tema }: { tema: TemaAyuda }) {
  const conCaptura = tema.captura != null && CAPTURAS[tema.captura] != null;
  return (
    <div className="space-y-5 text-sm leading-relaxed">
      <div>
        <h3 className="text-base font-semibold">{tema.titulo}</h3>
        <p className="text-muted-foreground">{tema.intro}</p>
      </div>
      <Seccion titulo="¿Qué veo aquí?">
        {conCaptura ? <ImagenNumerada id={tema.captura!} titulo={tema.titulo} /> : null}
        <ul className="space-y-2">
          {tema.queVeo.map((t, i) => (
            <li key={i} className="flex gap-2">
              {conCaptura ? <Numero n={i + 1} /> : <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />}
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Seccion>
      <Seccion titulo="¿Qué tengo que hacer?">
        <ol className="ml-5 list-decimal space-y-1">
          {tema.queHacer.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </Seccion>
      <Seccion titulo="Si pasa esto, haz esto">
        <ul className="space-y-2">
          {tema.siPasa.map((c, i) => (
            <li key={i} className="rounded-md border px-3 py-2">
              <div className="font-medium">{c.caso}</div>
              <div className="text-muted-foreground">{c.haz}</div>
            </li>
          ))}
        </ul>
      </Seccion>
      {tema.extra === "teclas" ? (
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer font-medium">Con el teclado (para quien lo prefiera)</summary>
          <p className="mt-2 text-muted-foreground">Primero pulsa el recuadro para seleccionarlo.</p>
          <table className="mt-2 w-full text-xs [&_td]:border-t [&_td]:py-1 [&_td]:pr-3">
            <tbody>
              {TECLAS.map(([tecla, que]) => (
                <tr key={tecla}>
                  <td className="font-medium whitespace-nowrap">{tecla}</td>
                  <td>{que}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function Tarea({ tarea, abierta = false, irA }: { tarea: TareaAyuda; abierta?: boolean; irA: (tema: string) => void }) {
  const tema = TEMAS_AYUDA.find((t) => t.id === tarea.tema);
  return (
    <details className="group rounded-md border px-3 py-2" open={abierta}>
      <summary className="cursor-pointer font-medium">{tarea.pregunta}</summary>
      <ol className="mt-2 ml-5 list-decimal space-y-1">
        {tarea.pasos.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
      {tema ? (
        <button type="button" className="mt-2 text-xs underline underline-offset-2" onClick={() => irA(tema.id)}>
          Ver la explicación de «{tema.etiqueta}»
        </button>
      ) : null}
    </details>
  );
}

function VistaTareas({ irA }: { irA: (tema: string) => void }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <div>
        <h3 className="text-base font-semibold">Cómo hago…</h3>
        <p className="text-muted-foreground">Las dudas de cada día, paso a paso. Pulsa una para abrirla.</p>
      </div>
      <div className="space-y-2">
        {TAREAS_AYUDA.map((t, i) => (
          <Tarea key={t.id} tarea={t} abierta={i === 0} irA={irA} />
        ))}
      </div>
    </div>
  );
}

function VistaPalabras() {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <h3 className="text-base font-semibold">Palabras que salen en las pantallas</h3>
      <table className="w-full [&_td]:border-t [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top">
        <tbody>
          {GLOSARIO_AYUDA.map(([termino, texto]) => (
            <tr key={termino}>
              <td className="font-medium whitespace-nowrap">{termino}</td>
              <td>{texto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resultados({ consulta, irA }: { consulta: string; irA: (tema: string) => void }) {
  const r = buscarAyuda(consulta);
  const nada = r.tareas.length + r.casos.length + r.palabras.length === 0;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2 text-sm leading-relaxed">
      {nada ? (
        <p className="text-muted-foreground">
          No hay nada con «{consulta.trim()}». Prueba con otra palabra (por ejemplo, «vacaciones», «publicar» o «saldo») o
          borra la búsqueda y mira «Cómo hago…».
        </p>
      ) : null}
      {r.tareas.length > 0 ? (
        <Seccion titulo="Cómo hago…">
          <div className="space-y-2">
            {r.tareas.map((t, i) => (
              <Tarea key={t.id} tarea={t} abierta={i === 0} irA={irA} />
            ))}
          </div>
        </Seccion>
      ) : null}
      {r.casos.length > 0 ? (
        <Seccion titulo="Si pasa esto, haz esto">
          <ul className="space-y-2">
            {r.casos.map((c, i) => (
              <li key={i} className="rounded-md border px-3 py-2">
                <div className="font-medium">{c.caso}</div>
                <div className="text-muted-foreground">{c.haz}</div>
                <button type="button" className="mt-1 text-xs underline underline-offset-2" onClick={() => irA(c.tema)}>
                  En «{c.etiqueta}»
                </button>
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
      {r.palabras.length > 0 ? (
        <Seccion titulo="Palabras">
          <ul className="space-y-1">
            {r.palabras.map(([termino, texto]) => (
              <li key={termino}>
                <span className="font-medium">{termino}:</span> {texto}
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
    </div>
  );
}

/**
 * Botón «Ayuda» de una pantalla de planificación. Abre en el tema de esa
 * pantalla; con `atajo`, también se abre con la tecla «?» (fuera de campos
 * de texto).
 */
export function BotonAyuda({ pantalla, atajo = false }: { pantalla: PantallaAyuda; atajo?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [tema, setTema] = useState(TEMA_DE[pantalla]);
  const [consulta, setConsulta] = useState("");

  useEffect(() => {
    if (!atajo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      e.preventDefault();
      setTema(TEMA_DE[pantalla]);
      setConsulta("");
      setAbierta(true);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [atajo, pantalla]);

  const irA = (id: string) => {
    setConsulta("");
    setTema(id);
  };

  return (
    <Dialog
      open={abierta}
      onOpenChange={(a) => {
        setAbierta(a);
        if (a) {
          setTema(TEMA_DE[pantalla]);
          setConsulta("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" title={atajo ? "Ayuda (tecla ?)" : "Ayuda"} />}>
        <CircleHelp /> Ayuda
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Ayuda de planificación</DialogTitle>
          <DialogDescription>Qué es cada cosa de la pantalla y qué hacer en cada caso.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Busca lo que quieres hacer (por ejemplo, vacaciones)"
            aria-label="Buscar en la ayuda"
            className="pl-8"
          />
        </div>
        {consulta.trim().length >= 3 ? (
          <Resultados consulta={consulta} irA={irA} />
        ) : (
          <Tabs
            orientation="vertical"
            value={tema}
            onValueChange={(v) => setTema(String(v))}
            className="min-h-0 flex-1 flex-col gap-3 md:flex-row"
          >
            {/* En el móvil, un desplegable: la lista de temas ocupaba la pantalla entera */}
            <label className="md:hidden">
              <span className="sr-only">Tema de la ayuda</span>
              <select
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                {TEMAS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <TabsList variant="line" className="hidden w-52 shrink-0 flex-col items-stretch md:flex">
              {TEMAS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex-none justify-start px-2 py-1">
                  {t.etiqueta}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="como" className="min-h-0 overflow-y-auto pr-2">
              <VistaTareas irA={irA} />
            </TabsContent>
            {TEMAS_AYUDA.map((t) => (
              <TabsContent key={t.id} value={t.id} className="min-h-0 overflow-y-auto pr-2">
                <VistaTema tema={t} />
              </TabsContent>
            ))}
            <TabsContent value="palabras" className="min-h-0 overflow-y-auto pr-2">
              <VistaPalabras />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
