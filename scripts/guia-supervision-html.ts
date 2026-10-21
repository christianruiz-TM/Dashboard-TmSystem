// ============================================================
// Genera la guía de planificación para supervisión como UN SOLO archivo HTML
// (capturas incluidas, sin internet ni dependencias), para dejarlo en una
// carpeta compartida y abrirlo con doble clic.
//
//   npm run guia:html [-- --salida "\\servidor\carpeta\Guia planificacion.html"]
//
// Los textos salen de src/components/planificacion/ayuda-contenido.ts (la
// fuente ÚNICA, la misma que la ventana «Ayuda» del panel) y las capturas
// numeradas de ayuda-capturas.json + public/ayuda/. Si cambia la ayuda,
// basta con volver a generarlo. Las pestañas son las mismas que las de la
// guía de Claude Docs.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GLOSARIO_AYUDA,
  TAREAS_AYUDA,
  TECLAS_AYUDA,
  TEMAS_AYUDA,
  normalizar,
  type TemaAyuda,
} from "../src/components/planificacion/ayuda-contenido";

const RAIZ = process.cwd();

interface Captura {
  src: string;
  ancho: number;
  alto: number;
  puntos: { n: number; x: number; y: number }[];
}

/** Pestañas de la guía por momento del mes (igual que en Claude Docs). */
const GRUPOS: { id: string; nombre: string; corto: string; intro: string; temas: string[] }[] = [
  {
    id: "preparar",
    nombre: "1 · Preparar el mes",
    corto: "Preparar el mes",
    intro:
      "Antes de que empiece el mes: mirar que los datos estén al día, confirmar la bolsa, sacar el borrador y retocarlo en el tablero.",
    temas: ["inicio", "bolsas", "tablero", "editar"],
  },
  {
    id: "publicar",
    nombre: "2 · Avisos y publicar",
    corto: "Avisos y publicar",
    intro:
      "Cuando el borrador está listo: arreglar los avisos y publicarlo. Publicar es dar el plan por bueno; después solo se cambia con un borrador nuevo.",
    temas: ["incidencias", "publicar"],
  },
  {
    id: "ausencias",
    nombre: "3 · Ausencias",
    corto: "Ausencias",
    intro: "En cuanto sepas de unas vacaciones, una libranza o una baja, apúntala. Cuenta al momento en el plan y en el saldo.",
    temas: ["ausencias"],
  },
  {
    id: "cada-dia",
    nombre: "4 · Cada día",
    corto: "Cada día",
    intro: "Lo que está pasando ahora mismo y las alertas. Las mismas alertas salen en la pantalla de Supervisión.",
    temas: ["hoy"],
  },
  {
    id: "fin-de-mes",
    nombre: "5 · Fin de mes",
    corto: "Fin de mes",
    intro: "Cuando acaba el mes (o durante, para ir viendo): ¿se cumplió el plan?, ¿a quién le sobran o le faltan horas? y el resumen por cliente.",
    temas: ["adherencia", "saldos", "cierre"],
  },
  {
    id: "configuracion",
    nombre: "6 · Configuración",
    corto: "Configuración",
    intro: "Clientes, agentes, turnos y otros datos que usa el plan. Solo supervisión.",
    temas: ["configuracion"],
  },
];

/** «Tu rutina» de la portada: cuándo, qué y a qué pestaña lleva. */
const RUTINA: [string, string, string[]][] = [
  ["Cada mañana", "Abre «Hoy» (o Supervisión) y atiende las alertas.", ["cada-dia"]],
  ["En cuanto sepas de una ausencia", "Apúntala.", ["ausencias"]],
  ["Cada lunes", "Mira «Para revisar»: por la noche se recalculan las semanas que aún no han empezado.", ["publicar"]],
  ["Antes del día 20", "Apunta las ausencias del mes siguiente y confirma su bolsa.", ["ausencias", "preparar"]],
  ["Del 20 a fin de mes", "Revisa el borrador del mes siguiente, cámbialo y publícalo.", ["preparar", "publicar"]],
  ["Al empezar el mes", "Mira la adherencia, los saldos y el cierre del mes que acaba de terminar.", ["fin-de-mes"]],
];

// ---------- Utilidades ----------

function esc(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Fecha local DD/MM/AAAA (nunca toISOString: daría la fecha UTC). */
function hoyLegible(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const temaPorId = new Map(TEMAS_AYUDA.map((t) => [t.id, t]));
const grupoDeTema = new Map(GRUPOS.flatMap((g) => g.temas.map((t) => [t, g] as const)));

// Que no se quede fuera ningún tema ni ninguna tarea si se añaden a la ayuda.
for (const t of TEMAS_AYUDA) {
  if (!grupoDeTema.has(t.id)) throw new Error(`El tema «${t.id}» no está en ninguna pestaña de GRUPOS`);
}
for (const t of TAREAS_AYUDA) {
  if (!temaPorId.has(t.tema)) throw new Error(`La tarea «${t.id}» apunta a un tema que no existe: «${t.tema}»`);
}

const capturas = JSON.parse(
  readFileSync(path.join(RAIZ, "src/components/planificacion/ayuda-capturas.json"), "utf8"),
) as Record<string, Captura>;

function imagenBase64(c: Captura): string {
  const fichero = path.join(RAIZ, "public", c.src.replace(/^\//, ""));
  return `data:image/webp;base64,${readFileSync(fichero).toString("base64")}`;
}

// ---------- Partes de la página ----------

function htmlCaptura(tema: TemaAyuda): string {
  const c = tema.captura ? capturas[tema.captura] : undefined;
  if (!c) return "";
  const numeros = c.puntos
    .map(
      (p) =>
        `<span class="num en-imagen" data-n="${p.n}" style="left:${((p.x / c.ancho) * 100).toFixed(2)}%;top:${((p.y / c.alto) * 100).toFixed(2)}%">${p.n}</span>`,
    )
    .join("");
  return `<figure class="captura">
  <button type="button" class="ampliar" title="Ver la imagen más grande">
    <img src="${imagenBase64(c)}" width="${c.ancho}" height="${c.alto}" alt="Pantalla «${esc(tema.titulo)}» con sus partes numeradas" loading="lazy">
    ${numeros}
  </button>
  <figcaption>Pantalla de ejemplo con datos inventados. Pulsa la imagen para verla más grande.</figcaption>
</figure>`;
}

function htmlTema(tema: TemaAyuda): string {
  const c = tema.captura ? capturas[tema.captura] : undefined;
  const queVeo = tema.queVeo
    .map((x, i) =>
      c ? `<li data-n="${i + 1}"><span class="num">${i + 1}</span><span>${esc(x)}</span></li>` : `<li>${esc(x)}</li>`,
    )
    .join("\n");
  const tareas = TAREAS_AYUDA.filter((t) => t.tema === tema.id);
  const pasoAPaso = tareas.length
    ? `<h4>Paso a paso</h4>
${tareas
  .map(
    (t) => `<details class="tarea" id="tarea-${t.id}">
  <summary>${esc(t.pregunta)}</summary>
  <ol>${t.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
</details>`,
  )
  .join("\n")}`
    : "";
  const teclas =
    tema.extra === "teclas"
      ? `<h4>Con el teclado (para quien lo prefiera)</h4>
<p>Primero pulsa el recuadro para seleccionarlo.</p>
<table class="teclas"><thead><tr><th>Tecla</th><th>Qué hace</th></tr></thead><tbody>
${TECLAS_AYUDA.map(([k, q]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(k === "?" ? "Abrir la ayuda del panel" : q)}</td></tr>`).join("\n")}
</tbody></table>`
      : "";
  return `<article class="tema" id="tema-${tema.id}">
<h3>${esc(tema.titulo)}</h3>
<p class="intro">${esc(tema.intro)}</p>
${htmlCaptura(tema)}
<div class="columnas">
  <div><h4>Lo que ves</h4><ol class="${c ? "numerada" : ""}">${queVeo}</ol></div>
  <div><h4>Lo que haces</h4><ol>${tema.queHacer.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
</div>
${pasoAPaso}
<h4>Si pasa esto, haz esto</h4>
<table class="casos"><thead><tr><th>Si pasa esto</th><th>Haz esto</th></tr></thead><tbody>
${tema.siPasa.map((s, i) => `<tr id="caso-${tema.id}-${i}"><td>${esc(s.caso)}</td><td>${esc(s.haz)}</td></tr>`).join("\n")}
</tbody></table>
${teclas}
</article>`;
}

/** Dibujo del mes: tres columnas y cada caja enlaza con su sitio. */
function htmlMes(): string {
  const cw = 216;
  const yc = 64;
  const ch = 316;
  const filas = [104, 172, 240, 308];
  const caja = (x: number, y: number, titulo: string, sub: string, href: string, principal = false) =>
    `<a href="${href}" class="caja${principal ? " principal" : ""}"><rect x="${x + 16}" y="${y}" width="184" height="56" rx="8"/>` +
    `<text x="${x + 28}" y="${y + 24}" class="t">${esc(titulo)}</text><text x="${x + 28}" y="${y + 42}" class="s">${esc(sub)}</text></a>`;
  const col = (x: number, titulo: string) =>
    `<rect x="${x}" y="${yc}" width="${cw}" height="${ch}" rx="8" class="col"/><text x="${x + 16}" y="${yc + 26}" class="t">${esc(titulo)}</text>`;
  const [c0, c1, c2] = [24, 268, 512];
  const mid = yc + ch / 2;
  return `<svg viewBox="0 0 760 404" role="img" aria-label="El mes tiene tres momentos: preparar, seguir cada día y cerrar" class="mes">
<defs><marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="punta"/></marker></defs>
<text x="24" y="34" class="titulo">El mes tiene tres momentos: preparar, seguir cada día y cerrar</text>
<path d="M${c0 + cw} ${mid}H${c1}" class="linea" marker-end="url(#flecha)"/><path d="M${c1 + cw} ${mid}H${c2}" class="linea" marker-end="url(#flecha)"/>
${col(c0, "Antes del mes")}
${caja(c0, filas[0], "1. Ausencias y bolsa", "Antes de generar el plan", "#ausencias")}
${caja(c0, filas[1], "2. Día 20: borrador", "Se prepara solo de noche", "#tema-inicio")}
${caja(c0, filas[2], "3. Revisa el tablero", "Cambia lo que falte y guarda", "#tema-tablero")}
${caja(c0, filas[3], "4. Publica", "Arregla antes los rojos", "#tema-publicar", true)}
${col(c1, "Durante el mes")}
${caja(c1, filas[0], "Cada día: Hoy", "Atiende las alertas", "#tema-hoy")}
${caja(c1, filas[1], "Cada lunes", "Mira «Para revisar»", "#tarea-revisar-noche")}
${caja(c1, filas[2], "Si algo cambia", "Nuevo borrador y publica", "#tarea-cambiar-publicado")}
${col(c2, "Al acabar el mes")}
${caja(c2, filas[0], "Adherencia", "¿Se cumplió el plan?", "#tema-adherencia")}
${caja(c2, filas[1], "Saldos", "Horas de más o de menos", "#tema-saldos")}
${caja(c2, filas[2], "Cierre de mes", "Horas reales y Excel", "#tema-cierre")}
</svg>`;
}

function htmlPortada(): string {
  const tarjetas = GRUPOS.map((g) => {
    const tareas = g.temas.flatMap((id) => TAREAS_AYUDA.filter((t) => t.tema === id));
    return `<div class="grupo-tareas"><h4><a href="#${g.id}">${esc(g.nombre)}</a></h4><ul>${tareas
      .map((t) => `<li><a href="#tarea-${t.id}">${esc(t.pregunta)}</a></li>`)
      .join("")}</ul></div>`;
  }).join("\n");
  const enlace = (id: string) => {
    const g = GRUPOS.find((x) => x.id === id)!;
    return `<a href="#${g.id}" class="chip">${esc(g.nombre)}</a>`;
  };
  return `<section class="vista" id="empieza" data-nombre="Empieza aquí">
<h2>Empieza aquí</h2>
<p class="intro">Todo lo que hace falta para preparar, seguir y cerrar el plan de turnos, separado por momentos del mes. Busca arriba lo que necesitas o pulsa lo que quieres hacer. Lo mismo sale al pulsar «Ayuda» (o la tecla «?») en cada pantalla del panel.</p>
<div class="dibujo">${htmlMes()}<p class="pie">Pulsa una caja para ir a su explicación.</p></div>
<h3>¿Qué quieres hacer?</h3>
<div class="tarjetas">${tarjetas}</div>
<h3>Tu rutina</h3>
<table class="rutina"><thead><tr><th>Cuándo</th><th>Qué haces</th><th>Dónde</th></tr></thead><tbody>
${RUTINA.map(([cuando, que, donde]) => `<tr><td>${esc(cuando)}</td><td>${esc(que)}</td><td>${donde.map(enlace).join(" ")}</td></tr>`).join("\n")}
</tbody></table>
<p class="nota">¿Una palabra que no entiendes? Mira <a href="#palabras">Palabras</a>. Si algo da error o los datos no salen en verde, avisa a TI.</p>
</section>`;
}

function htmlGrupo(i: number): string {
  const g = GRUPOS[i];
  const anterior = i === 0 ? { id: "empieza", nombre: "Empieza aquí" } : GRUPOS[i - 1];
  const siguiente = i === GRUPOS.length - 1 ? { id: "palabras", nombre: "Palabras" } : GRUPOS[i + 1];
  const indice =
    g.temas.length > 1
      ? `<p class="indice">En esta parte: ${g.temas.map((id) => `<a href="#tema-${id}">${esc(temaPorId.get(id)!.titulo)}</a>`).join(" · ")}</p>`
      : "";
  return `<section class="vista" id="${g.id}" data-nombre="${esc(g.nombre)}">
<h2>${esc(g.nombre)}</h2>
<p class="intro">${esc(g.intro)}</p>
${indice}
${g.temas.map((id) => htmlTema(temaPorId.get(id)!)).join("\n")}
<nav class="pasar"><a href="#${anterior.id}">← ${esc(anterior.nombre)}</a><a href="#${siguiente.id}">${esc(siguiente.nombre)} →</a></nav>
</section>`;
}

function htmlPalabras(): string {
  const orden = [...GLOSARIO_AYUDA].sort((a, b) => a[0].localeCompare(b[0], "es"));
  return `<section class="vista" id="palabras" data-nombre="Palabras">
<h2>Palabras que salen en las pantallas</h2>
<dl class="glosario">${orden.map(([p, q], i) => `<div id="palabra-${i}"><dt>${esc(p)}</dt><dd>${esc(q)}</dd></div>`).join("\n")}</dl>
<nav class="pasar"><a href="#configuracion">← ${esc(GRUPOS[GRUPOS.length - 1].nombre)}</a><a href="#empieza">Empieza aquí →</a></nav>
</section>`;
}

/** Índice del buscador: lo mismo que busca la ventana «Ayuda» del panel. */
function indiceBusqueda() {
  const orden = [...GLOSARIO_AYUDA].sort((a, b) => a[0].localeCompare(b[0], "es"));
  return [
    ...TAREAS_AYUDA.map((t) => ({
      k: "Cómo hago…",
      t: t.pregunta,
      d: grupoDeTema.get(t.tema)!.nombre,
      h: `#tarea-${t.id}`,
      p: normalizar(t.pregunta),
      x: normalizar([t.pregunta, t.palabras ?? "", ...t.pasos].join(" ")),
    })),
    ...TEMAS_AYUDA.flatMap((tema) =>
      tema.siPasa.map((s, i) => ({
        k: "Si pasa esto",
        t: s.caso,
        d: s.haz,
        h: `#caso-${tema.id}-${i}`,
        p: normalizar(s.caso),
        x: normalizar([s.caso, s.haz, tema.etiqueta].join(" ")),
      })),
    ),
    ...orden.map(([p, q], i) => ({ k: "Palabras", t: p, d: q, h: `#palabra-${i}`, p: normalizar(p), x: normalizar(`${p} ${q}`) })),
  ];
}

// ---------- Estilos y comportamiento ----------

const CSS = String.raw`
:root{--fondo:#f6f5f1;--papel:#fff;--tinta:#1c1b1a;--suave:#5f5b55;--borde:#dedbd3;--marca:#F5CF3D;--marca-tinta:#1c1b1a;--azul:#1f7fb0;--azul-fondo:#e7f1fb;--resalte:#fff4c7;--col:#efede7}
@media (prefers-color-scheme: dark){:root{--fondo:#151413;--papel:#1f1e1c;--tinta:#ece9e2;--suave:#aaa59b;--borde:#3a3834;--azul:#6cc3ec;--azul-fondo:#1b2d38;--resalte:#3b3417;--col:#262522}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:120px}
body{margin:0;background:var(--fondo);color:var(--tinta);font:16px/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
a{color:var(--azul)}
header{position:sticky;top:0;z-index:5;background:var(--marca-tinta);color:#fff;border-bottom:4px solid var(--marca)}
.cabecera{max-width:1200px;margin:0 auto;padding:12px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.marca{display:flex;align-items:center;gap:10px;flex:1 1 280px}
.marca .logo{background:var(--marca);color:var(--marca-tinta);font-weight:800;border-radius:6px;padding:2px 8px;letter-spacing:.5px}
.marca h1{font-size:18px;margin:0;font-weight:600}
.marca small{display:block;color:#c9c5bc;font-size:12px;font-weight:400}
.buscar{flex:1 1 300px;position:relative}
.buscar input{width:100%;font-size:16px;padding:10px 12px 10px 38px;border-radius:8px;border:2px solid transparent;background:#fff;color:#1c1b1a}
.buscar input:focus{outline:none;border-color:var(--marca)}
.buscar svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:18px;height:18px;stroke:#777}
.envoltura{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:240px 1fr;gap:24px;padding:20px 16px 60px}
nav.menu{position:sticky;top:96px;align-self:start}
nav.menu a{display:block;padding:9px 12px;border-radius:8px;color:var(--tinta);text-decoration:none;margin-bottom:2px}
nav.menu a:hover{background:var(--col)}
nav.menu a.activa{background:var(--marca);color:var(--marca-tinta);font-weight:600}
nav.menu .ayuda{margin-top:16px;font-size:13px;color:var(--suave);padding:0 12px}
main{min-width:0}
.vista{background:var(--papel);border:1px solid var(--borde);border-radius:12px;padding:24px 28px}
.js .vista{display:none}.js .vista.visible{display:block}
h2{font-size:26px;margin:0 0 6px}
h3{font-size:21px;margin:28px 0 6px}
h4{font-size:16px;margin:20px 0 8px}
.intro{color:var(--suave);margin-top:0}
.indice{font-size:14px;background:var(--col);border-radius:8px;padding:8px 12px}
.tema{border-top:1px solid var(--borde);margin-top:24px;padding-top:4px}
.tema:first-of-type{border-top:0;margin-top:8px}
.captura{margin:12px 0 4px}
.captura .ampliar{position:relative;display:block;width:100%;padding:0;border:1px solid var(--borde);border-radius:8px;overflow:hidden;cursor:zoom-in;background:#fff}
.captura img{display:block;width:100%;height:auto}
.captura figcaption{font-size:12px;color:var(--suave);margin-top:4px}
.num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;border:2px solid #1c1b1a;background:var(--marca);color:#1c1b1a;font-size:12px;font-weight:700;transition:transform .15s}
.num.en-imagen{position:absolute;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.35)}
.num.en-imagen.encendido{transform:translate(-50%,-50%) scale(1.6);box-shadow:0 0 0 6px rgba(245,207,61,.5)}
.columnas{display:grid;grid-template-columns:1fr 1fr;gap:24px}
ol.numerada{list-style:none;padding:0}
ol.numerada li{display:flex;gap:10px;align-items:flex-start;padding:6px 8px;border-radius:8px;cursor:default}
ol.numerada li:hover,ol.numerada li.encendido{background:var(--resalte)}
ol{padding-left:22px}
li{margin:3px 0}
details.tarea{border:1px solid var(--borde);border-radius:8px;margin:8px 0;background:var(--papel)}
details.tarea summary{cursor:pointer;padding:10px 14px;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:8px}
details.tarea summary::-webkit-details-marker{display:none}
details.tarea summary::after{content:"+";font-weight:700;color:var(--suave)}
details.tarea[open] summary::after{content:"−"}
details.tarea[open]{background:var(--azul-fondo);border-color:var(--azul)}
details.tarea ol{margin:0 14px 12px 8px}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--borde)}
th{background:var(--col);font-weight:600}
table.casos td:first-child{font-weight:600;width:38%}
tr:target,details:target,div:target{animation:destello 2.2s ease-out}
@keyframes destello{0%,40%{background:var(--resalte)}100%{background:transparent}}
kbd{font-family:inherit;font-size:13px;border:1px solid var(--borde);border-bottom-width:2px;border-radius:4px;padding:1px 6px;background:var(--col)}
.dibujo{margin:16px 0}
svg.mes{width:100%;height:auto;font-family:inherit}
svg.mes .titulo{font-size:15px;font-weight:600;fill:var(--tinta)}
svg.mes .col{fill:var(--col);stroke:var(--borde)}
svg.mes .t{font-size:13px;font-weight:600;fill:var(--tinta)}
svg.mes .s{font-size:11.5px;fill:var(--suave)}
svg.mes .caja rect{fill:var(--papel);stroke:#9c978d;stroke-width:1.25}
svg.mes .caja:hover rect,svg.mes .caja:focus rect{stroke:var(--azul);stroke-width:2}
svg.mes .caja.principal rect{fill:var(--resalte);stroke:#c9a400;stroke-width:2}
svg.mes .linea{fill:none;stroke:#9c978d;stroke-width:1.25}
svg.mes .punta{fill:#9c978d}
.pie{font-size:13px;color:var(--suave);margin:4px 0 0}
.tarjetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.grupo-tareas{border:1px solid var(--borde);border-radius:10px;padding:4px 14px 10px;background:var(--papel)}
.grupo-tareas h4{margin:10px 0 6px}
.grupo-tareas h4 a{color:var(--tinta);text-decoration:none;border-bottom:3px solid var(--marca)}
.grupo-tareas ul{padding-left:18px;margin:0}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;background:var(--col);text-decoration:none;color:var(--tinta);font-size:13px;margin:2px 4px 2px 0;white-space:nowrap}
.chip:hover{background:var(--marca);color:#1c1b1a}
.nota{margin-top:20px;font-size:14px;color:var(--suave)}
.glosario{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.glosario div{border:1px solid var(--borde);border-radius:8px;padding:10px 14px}
.glosario dt{font-weight:700}.glosario dd{margin:2px 0 0;color:var(--suave)}
nav.pasar{display:flex;justify-content:space-between;gap:12px;margin-top:32px;padding-top:16px;border-top:1px solid var(--borde)}
nav.pasar a{text-decoration:none;font-weight:600}
#resultados h3{font-size:15px;text-transform:uppercase;letter-spacing:.5px;color:var(--suave);margin:20px 0 6px}
#resultados a.resultado{display:block;padding:10px 14px;border:1px solid var(--borde);border-radius:8px;margin:6px 0;text-decoration:none;color:var(--tinta)}
#resultados a.resultado:hover{border-color:var(--azul);background:var(--azul-fondo)}
#resultados a.resultado small{display:block;color:var(--suave)}
dialog{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;background:#fff}
dialog::backdrop{background:rgba(0,0,0,.75)}
dialog .marco{position:relative;width:min(1400px,94vw)}
dialog .marco img{display:block;width:100%;height:auto}
dialog button.cerrar{position:absolute;top:8px;right:8px;z-index:2;border:0;border-radius:999px;background:#1c1b1a;color:#fff;font-size:15px;padding:6px 12px;cursor:pointer}
@media (max-width:860px){
 html{scroll-padding-top:64px}
 header{position:static}
 .marca h1{font-size:16px}.marca small{display:none}
 .envoltura{grid-template-columns:1fr;padding-top:12px}
 nav.menu{position:sticky;top:0;z-index:4;display:flex;overflow-x:auto;gap:6px;background:var(--fondo);padding:6px 0}
 nav.menu a{white-space:nowrap;margin:0;border:1px solid var(--borde);background:var(--papel)}
 nav.menu .ayuda{display:none}
 .vista{padding:18px 16px}
 .columnas{grid-template-columns:1fr;gap:0}
 table.casos thead{display:none}
 table.casos tr{display:block;border-bottom:1px solid var(--borde);padding:8px 0}
 table.casos td{display:block;border:0;padding:2px 4px;width:auto!important}
}
@media print{
 header .buscar,nav.menu,nav.pasar,.pie,.captura figcaption{display:none}
 header{position:static}
 .envoltura{display:block}
 .js .vista{display:block!important;break-before:page;border:0}
 #resultados{display:none!important}
 details.tarea>*{display:block}
}
`;

// Sin plantillas con «${» ni comillas invertidas: va dentro de String.raw.
const JS = String.raw`
(function(){
  document.documentElement.className+=" js";
  var vistas=[].slice.call(document.querySelectorAll(".vista"));
  var enlacesMenu=[].slice.call(document.querySelectorAll("nav.menu a"));
  var resultados=document.getElementById("resultados");
  var campo=document.getElementById("buscar");
  var indice=JSON.parse(document.getElementById("indice").textContent);

  function mostrar(id){
    vistas.forEach(function(v){v.classList.toggle("visible",v.id===id)});
    enlacesMenu.forEach(function(a){
      var activa=a.getAttribute("href")==="#"+id;
      a.classList.toggle("activa",activa);
      // En el móvil el menú es una fila que se desplaza: que se vea la activa.
      var menu=a.parentNode;
      if(activa&&menu.scrollWidth>menu.clientWidth){menu.scrollLeft=a.offsetLeft-menu.offsetLeft-(menu.clientWidth-a.offsetWidth)/2}
    });
  }
  function irA(hash,desplazar){
    var id=(hash||"").replace(/^#/,"")||"empieza";
    var el=document.getElementById(id);
    if(!el){mostrar("empieza");return}
    var vista=el.classList.contains("vista")?el:el.closest(".vista");
    if(!vista){mostrar("empieza");return}
    if(vista.id!=="resultados"&&campo.value){campo.value=""}
    mostrar(vista.id);
    if(el.tagName==="DETAILS"){el.open=true}
    if(el===vista){window.scrollTo(0,0)}
    else if(desplazar!==false){setTimeout(function(){el.scrollIntoView({block:"start"})},0)}
  }
  window.addEventListener("hashchange",function(){irA(location.hash)});
  irA(location.hash);

  // Buscador: todas las palabras de 3 letras o más, sin mirar tildes ni mayúsculas.
  function normalizar(t){return t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
  function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
  var anterior=null;
  campo.addEventListener("input",function(){
    var palabras=normalizar(campo.value).split(/[^a-z0-9]+/).filter(function(p){return p.length>=3});
    if(!palabras.length){
      if(anterior!==null){irA(anterior);anterior=null}
      return;
    }
    if(anterior===null){anterior=location.hash||"#empieza"}
    var hallados=indice.filter(function(r){return palabras.every(function(p){return r.x.indexOf(p)>=0})});
    hallados.sort(function(a,b){
      var pa=palabras.every(function(p){return a.p.indexOf(p)>=0})?0:1;
      var pb=palabras.every(function(p){return b.p.indexOf(p)>=0})?0:1;
      return pa-pb;
    });
    var html="<h2>Resultados de «"+esc(campo.value.trim())+"»</h2>";
    if(!hallados.length){html+="<p class='intro'>No sale nada. Prueba con otra palabra (por ejemplo «vacaciones», «publicar» o «saldo») o mira <a href='#empieza'>Empieza aquí</a>.</p>"}
    ["Cómo hago…","Si pasa esto","Palabras"].forEach(function(k){
      var deEste=hallados.filter(function(r){return r.k===k});
      if(!deEste.length)return;
      html+="<h3>"+k+"</h3>";
      deEste.forEach(function(r){html+="<a class='resultado' href='"+r.h+"'><strong>"+esc(r.t)+"</strong><small>"+esc(r.d)+"</small></a>"});
    });
    resultados.innerHTML=html;
    mostrar("resultados");
  });
  resultados.addEventListener("click",function(e){
    var a=e.target.closest("a");
    if(a){anterior=null;campo.value="";if(a.getAttribute("href")===location.hash){e.preventDefault();irA(location.hash)}}
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="/"&&document.activeElement!==campo){e.preventDefault();campo.focus()}
    if(e.key==="Escape"&&document.activeElement===campo&&campo.value){campo.value="";campo.dispatchEvent(new Event("input"))}
  });

  // Al pasar por «Lo que ves», se enciende su número en la captura.
  document.querySelectorAll("ol.numerada li").forEach(function(li){
    var tema=li.closest(".tema");
    function encender(si){
      li.classList.toggle("encendido",si);
      var n=tema.querySelector(".num.en-imagen[data-n='"+li.getAttribute("data-n")+"']");
      if(n)n.classList.toggle("encendido",si);
    }
    li.addEventListener("mouseenter",function(){encender(true)});
    li.addEventListener("mouseleave",function(){encender(false)});
    li.addEventListener("click",function(){
      encender(true);
      var f=tema.querySelector(".captura");
      if(f&&f.getBoundingClientRect().top<0)f.scrollIntoView({block:"start"});
      setTimeout(function(){encender(false)},1600);
    });
  });

  // Ver la captura en grande.
  var zoom=document.getElementById("zoom");
  document.querySelectorAll(".captura .ampliar").forEach(function(b){
    b.addEventListener("click",function(){
      var marco=zoom.querySelector(".marco");
      marco.innerHTML="<button class='cerrar' type='button'>Cerrar ✕</button>"+b.innerHTML;
      marco.querySelector(".cerrar").addEventListener("click",function(){zoom.close()});
      if(zoom.showModal){zoom.showModal()}else{window.open(b.querySelector("img").src)}
    });
  });
  zoom.addEventListener("click",function(e){if(e.target===zoom)zoom.close()});
})();
`;

// ---------- Página ----------

function pagina(): string {
  const menu = [
    `<a href="#empieza">Empieza aquí</a>`,
    ...GRUPOS.map((g) => `<a href="#${g.id}">${esc(g.nombre)}</a>`),
    `<a href="#palabras">Palabras</a>`,
  ].join("\n");
  const indice = JSON.stringify(indiceBusqueda()).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guía de planificación</title>
<meta name="description" content="Guía de planificación de turnos para supervisión (TmSystem)">
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="cabecera">
    <div class="marca"><span class="logo">TM</span><h1>Guía de planificación para supervisión<small>Actualizada el ${hoyLegible()} · lo mismo que la «Ayuda» del panel</small></h1></div>
    <label class="buscar"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="buscar" type="search" placeholder="¿Qué necesitas? Por ejemplo: vacaciones, publicar, saldo…" autocomplete="off" aria-label="Buscar en la guía"></label>
  </div>
</header>
<div class="envoltura">
  <nav class="menu" aria-label="Partes de la guía">
${menu}
    <p class="ayuda">Truco: pulsa «/» para buscar.</p>
  </nav>
  <main>
${htmlPortada()}
${GRUPOS.map((_, i) => htmlGrupo(i)).join("\n")}
${htmlPalabras()}
<section class="vista" id="resultados" data-nombre="Resultados" aria-live="polite"></section>
  </main>
</div>
<dialog id="zoom" aria-label="Captura en grande"><div class="marco"></div></dialog>
<script type="application/json" id="indice">${indice}</script>
<script>${JS}</script>
</body>
</html>
`;
}

const salida = path.resolve(argumento("--salida") ?? path.join(RAIZ, "guia-supervision.html"));
const html = pagina();
writeFileSync(salida, html, "utf8");
console.log(`Guía generada: ${salida} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
