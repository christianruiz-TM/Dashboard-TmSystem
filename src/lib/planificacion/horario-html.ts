// ============================================================
// Copia del plan publicado para las agentes en UN solo fichero HTML (sin
// internet, sin librerías): se manda por correo o WhatsApp y se abre en el
// móvil o en el ordenador. Lógica PURA (texto), con tests.
//
// Mejora progresiva: sin JavaScript (vista previa de un adjunto, p. ej. en
// el iPhone) se ve el horario de TODAS y la tabla del equipo. Con
// JavaScript: «¿Quién eres?» deja solo el tuyo (se recuerda en ese
// navegador), marca hoy y «Añadir a mi calendario» descarga un .ics con tus
// turnos. Nunca sale el cliente.
// ============================================================
import {
  aclarar,
  duracionHorario,
  LETRA_DIA,
  NOMBRE_DIA,
  tramoCorto,
  tramosLargos,
  type ColumnaHorario,
  type DiaHorario,
  type HorarioMes,
} from "./horario-agentes";

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const rgb = (c: { r: number; g: number; b: number }) =>
  `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)})`;

/** Texto de un día sin trabajo. */
function textoSinTrabajo(d: DiaHorario, nombres: ReadonlyMap<string, string>): string {
  if (d.estado === "ausencia") return nombres.get(d.ausencia ?? "") ?? d.ausencia ?? "";
  return d.estado === "festivo" ? "Festivo" : "Libre";
}

/** Semanas (de lunes a domingo) dentro del mes: índices de columnas. */
function semanas(columnas: readonly ColumnaHorario[]): number[][] {
  const grupos: number[][] = [];
  columnas.forEach((c, i) => {
    if (i === 0 || c.diaSemana === 0) grupos.push([]);
    grupos[grupos.length - 1].push(i);
  });
  return grupos;
}

function tituloSemana(columnas: readonly ColumnaHorario[], indices: readonly number[]): string {
  const a = columnas[indices[0]];
  const b = columnas[indices[indices.length - 1]];
  return `Del ${NOMBRE_DIA[a.diaSemana].toLowerCase()} ${a.dia} al ${NOMBRE_DIA[b.diaSemana].toLowerCase()} ${b.dia}`;
}

export interface OpcionesHtml {
  /** «23/10/2026 10:15» (hora local del servidor): cuándo se hizo el fichero. */
  generado: string;
}

/** «GH_0851 · Begoña» (o solo el código si no hay nombre). */
const etiqueta = (f: { codigo: string; nombre: string }) => (f.codigo === f.nombre ? f.codigo : `${f.codigo} · ${f.nombre}`);

export function horarioHtml(h: HorarioMes, o: OpcionesHtml): string {
  const nombresTipo = new Map(h.tipos.map((t) => [t.codigo, t.nombre]));
  const colorTipo = new Map(h.tipos.map((t) => [t.codigo, rgb(aclarar(t.color, 0.65))]));
  const grupos = semanas(h.columnas);
  const publicado = h.version.publicadaAt ? `Plan publicado el ${h.version.publicadaAt.slice(0, 10)}` : "Plan publicado";

  const personas = h.filas
    .map((f) => {
      const bloquesSemana = grupos
        .map((indices) => {
          const dias = indices
            .map((i) => {
              const c = h.columnas[i];
              const d = f.dias[i];
              const estilo = d.estado === "ausencia" ? ` style="--fondo:${colorTipo.get(d.ausencia ?? "") ?? "#eee"}"` : "";
              const que =
                d.estado === "trabaja"
                  ? `<span class="horas">${escapar(tramosLargos(d.tramos))}</span>`
                  : `<span class="sin">${escapar(textoSinTrabajo(d, nombresTipo))}</span>`;
              return (
                `<li class="dia ${d.estado}${c.finDeSemana ? " finde" : ""}" data-fecha="${c.fecha}"${estilo}>` +
                `<span class="fecha"><span class="dsem">${NOMBRE_DIA[c.diaSemana]}</span><span class="dnum">${c.dia}</span></span>` +
                `<span class="que">${que}</span>` +
                `<span class="cuanto">${d.estado === "trabaja" ? escapar(duracionHorario(d.minutos)) : ""}</span>` +
                `</li>`
              );
            })
            .join("");
          return `<div class="semana"><h3>${escapar(tituloSemana(h.columnas, indices))}</h3><ul class="dias">${dias}</ul></div>`;
        })
        .join("");
      return (
        `<section class="persona" id="p-${escapar(f.numero)}" data-numero="${escapar(f.numero)}">` +
        `<h2>${escapar(f.nombre)}${f.codigo === f.nombre ? "" : ` <span class="num">${escapar(f.codigo)}</span>`}</h2>` +
        bloquesSemana +
        `</section>`
      );
    })
    .join("");

  const cabeceraTabla = h.columnas
    .map(
      (c) =>
        `<th scope="col" class="${[c.finDeSemana ? "finde" : "", c.festivo ? "festivo" : "", c.empiezaSemana ? "lunes" : ""].join(" ").trim()}" data-fecha="${c.fecha}">` +
        `<span class="letra">${LETRA_DIA[c.diaSemana]}</span><span class="n">${c.dia}</span></th>`,
    )
    .join("");
  const filasTabla = h.filas
    .map((f) => {
      const celdas = f.dias
        .map((d, i) => {
          const c = h.columnas[i];
          const clases = [d.estado, c.finDeSemana ? "finde" : "", c.empiezaSemana ? "lunes" : ""].join(" ").trim();
          if (d.estado === "trabaja") return `<td class="${clases}">${d.tramos.map((t) => escapar(tramoCorto(t))).join("<br>")}</td>`;
          if (d.estado === "ausencia") {
            return `<td class="${clases}" style="background:${colorTipo.get(d.ausencia ?? "") ?? "#eee"}" title="${escapar(nombresTipo.get(d.ausencia ?? "") ?? "")}">${escapar(d.ausencia ?? "")}</td>`;
          }
          return `<td class="${clases}">${d.estado === "festivo" ? "Fest." : "Libre"}</td>`;
        })
        .join("");
      return `<tr data-numero="${escapar(f.numero)}"><th scope="row">${escapar(etiqueta(f))}</th>${celdas}</tr>`;
    })
    .join("");

  const leyendaTipos = h.tipos
    .map((t) => `<li><span class="muestra" style="background:${colorTipo.get(t.codigo)}"></span><b>${escapar(t.codigo)}</b> = ${escapar(t.nombre)}</li>`)
    .join("");

  // Datos para el .ics (solo lo que hace falta: días y tramos de cada una)
  const datos = {
    mes: h.mes,
    version: h.version.numero,
    agentes: Object.fromEntries(
      h.filas.map((f) => [
        f.numero,
        {
          nombre: f.nombre,
          dias: f.dias.filter((d) => d.estado === "trabaja").map((d) => ({ f: d.fecha, t: d.tramos.map((t) => [t.inicioMin, t.finMin]) })),
        },
      ]),
    ),
  };
  const json = JSON.stringify(datos).replace(/</g, "\\u003c");

  const opciones = h.filas.map((f) => `<option value="${escapar(f.numero)}">${escapar(etiqueta(f))}</option>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Horario de ${escapar(h.mesTexto)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="cab">
  <p class="marca">TmSystem</p>
  <h1>Horario de ${escapar(h.mesTexto)}</h1>
  <p class="sub">${escapar(publicado)} (versión ${h.version.numero}). Si cambia, te llegará un archivo nuevo: vale siempre el más reciente.</p>
</header>

<nav class="elige" aria-label="Elegir persona">
  <label for="quien">¿Quién eres?</label>
  <select id="quien"><option value="">Elige tu nombre…</option>${opciones}</select>
  <div class="botones">
    <button type="button" id="ics" disabled>Añadir a mi calendario</button>
    <button type="button" id="equipo-btn" aria-expanded="false" aria-controls="equipo">Ver todo el equipo</button>
  </div>
  <p class="nota" id="nota-ics" hidden>Se descarga un archivo con tus turnos. Ábrelo y elige «Añadir» en tu calendario. Si te llega un horario nuevo, borra antes los turnos del anterior.</p>
</nav>

<main>
  <div class="personas">${personas}</div>

  <section id="equipo" class="equipo" aria-labelledby="equipo-titulo">
    <h2 id="equipo-titulo">Todo el equipo</h2>
    <div class="tabla"><table>
      <thead><tr><th scope="col" class="esquina">Persona</th>${cabeceraTabla}</tr></thead>
      <tbody>${filasTabla}</tbody>
    </table></div>
  </section>

  <section class="leyenda" aria-label="Cómo se lee">
    <h2>Cómo se lee</h2>
    <ul>
      <li><b>9–14</b> = trabajas de 9:00 a 14:00. Si hay varias líneas (por ejemplo <b>9–14</b> y <b>16–20</b>), son varios tramos ese día, con un descanso entre ellos.</li>
      <li><b>Libre</b> = ese día no trabajas.</li>
      ${h.hayFestivos ? "<li><b>Festivo</b> (en la tabla, <b>Fest.</b>) = festivo: no trabajas, salvo que salgan horas ese día.</li>" : ""}
      ${leyendaTipos}
    </ul>
    <p class="gen">Archivo preparado el ${escapar(o.generado)}.</p>
  </section>
</main>

<script type="application/json" id="datos">${json}</script>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = `
:root{--fondo-pag:#f6f6f4;--tarjeta:#fff;--texto:#141414;--suave:#5f5f5f;--borde:#dedcd6;--marca:#F5CF3D;--trabaja:#fff7d1;--libre:#f1f1ef;--finde:#ebe9e4;--hoy:#2EA9E0}
@media (prefers-color-scheme: dark){:root{--fondo-pag:#141414;--tarjeta:#1f1f1f;--texto:#f2f2f2;--suave:#b0b0b0;--borde:#3a3a3a;--trabaja:#3a3214;--libre:#262626;--finde:#2c2c2c}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo-pag);color:var(--texto);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.cab{background:#111;color:#fff;padding:16px;border-bottom:6px solid var(--marca)}
.cab h1{margin:2px 0 4px;font-size:1.5rem}
.marca{margin:0;font-weight:700;color:var(--marca);letter-spacing:.04em}
.sub{margin:0;color:#ddd;font-size:.9rem;max-width:60ch}
main,.elige{padding:0 16px;max-width:900px;margin:0 auto}
.elige{display:none;padding-top:16px}
.js .elige{display:block}
.elige label{display:block;font-weight:600;margin-bottom:6px}
.elige select{width:100%;font-size:1.1rem;padding:10px;border-radius:10px;border:1px solid var(--borde);background:var(--tarjeta);color:var(--texto)}
.botones{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
button{font:inherit;font-weight:600;padding:10px 14px;border-radius:10px;border:1px solid #111;background:var(--marca);color:#111;cursor:pointer}
button#equipo-btn{background:var(--tarjeta);color:var(--texto);border-color:var(--borde)}
button:disabled{opacity:.45;cursor:not-allowed}
.nota{font-size:.85rem;color:var(--suave);margin:8px 0 0}
.persona{background:var(--tarjeta);border:1px solid var(--borde);border-radius:14px;padding:12px 14px;margin:16px 0}
.js .persona{display:none}
.js .persona.activa{display:block}
.persona h2{margin:0 0 4px;font-size:1.3rem}
.num{font-size:.85rem;font-weight:400;color:var(--suave)}
.semana h3{font-size:.85rem;text-transform:uppercase;letter-spacing:.04em;color:var(--suave);margin:14px 0 6px}
.dias{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.dia{display:grid;grid-template-columns:7.2rem 1fr auto;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--libre)}
.dia.trabaja{background:var(--trabaja);border-left:5px solid var(--marca)}
.dia.ausencia{background:var(--fondo);color:#111}
.dia.finde:not(.trabaja){background:var(--finde)}
.dia.hoy{outline:3px solid var(--hoy);outline-offset:1px}
.dia.hoy .dsem::after{content:" · hoy";color:var(--hoy);font-weight:700}
.fecha{display:flex;gap:6px;align-items:baseline}
.dsem{font-size:.9rem}
.dnum{font-weight:700;font-size:1.1rem}
.horas{font-weight:700}
.sin{color:var(--suave)}
.dia.ausencia .sin{color:#111;font-weight:600}
.cuanto{font-size:.85rem;color:var(--suave);white-space:nowrap}
.equipo{margin:24px 0}
.js .equipo.oculto{display:none}
.equipo h2,.leyenda h2{font-size:1.2rem;margin:0 0 8px}
.tabla{overflow-x:auto;border:1px solid var(--borde);border-radius:10px;background:var(--tarjeta)}
table{border-collapse:collapse;font-size:.78rem;min-width:100%}
th,td{border:1px solid var(--borde);padding:3px 4px;text-align:center;white-space:nowrap}
thead th{position:sticky;top:0;background:var(--tarjeta)}
tbody th{position:sticky;left:0;background:var(--tarjeta);text-align:left;font-weight:600;max-width:11rem;overflow:hidden;text-overflow:ellipsis;z-index:1}
.esquina{left:0;z-index:2;text-align:left}
thead .letra{display:block;color:var(--suave);font-weight:400}
thead .n{display:block;font-weight:700}
td.trabaja{background:var(--trabaja);font-weight:700}
td.libre,td.festivo{color:var(--suave)}
td.ausencia{color:#111;font-weight:700}
.finde{background:var(--finde)}
th.festivo,td.festivo{background:var(--finde)}
.lunes{border-left:2px solid var(--texto)}
th.hoy{background:var(--hoy);color:#fff}
th.hoy .letra{color:#fff}
tr.yo th,tr.yo td{box-shadow:inset 0 2px 0 var(--hoy),inset 0 -2px 0 var(--hoy)}
.leyenda{background:var(--tarjeta);border:1px solid var(--borde);border-radius:14px;padding:12px 14px;margin:16px 0 32px}
.leyenda ul{margin:0;padding-left:18px}
.leyenda li{margin:4px 0}
.muestra{display:inline-block;width:.9em;height:.9em;border-radius:3px;border:1px solid var(--borde);vertical-align:-1px;margin-right:4px}
.gen{font-size:.8rem;color:var(--suave);margin:10px 0 0}
@media (max-width:420px){.dia{grid-template-columns:5.9rem 1fr;}.cuanto{grid-column:2}}
@media print{.elige,.equipo{display:none!important}.cab{background:none;color:#000}.sub{color:#333}.persona{break-inside:avoid-page}}
`;

// Sin plantillas ni sintaxis moderna rara: tiene que ir en móviles viejos.
const JS = `
(function(){
  var raiz=document.documentElement; raiz.className+=" js";
  var datos; try{datos=JSON.parse(document.getElementById("datos").textContent);}catch(e){return;}
  var sel=document.getElementById("quien"), btnIcs=document.getElementById("ics"), btnEq=document.getElementById("equipo-btn");
  var equipo=document.getElementById("equipo"), nota=document.getElementById("nota-ics");
  var CLAVE="horario-tmsystem-agente", verEquipo=false;
  function leer(){try{return localStorage.getItem(CLAVE)||"";}catch(e){return "";}}
  function guardar(v){try{if(v)localStorage.setItem(CLAVE,v);else localStorage.removeItem(CLAVE);}catch(e){}}
  function dos(n){return (n<10?"0":"")+n;}
  var ahora=new Date(), hoy=ahora.getFullYear()+"-"+dos(ahora.getMonth()+1)+"-"+dos(ahora.getDate());
  var marcas=document.querySelectorAll('[data-fecha="'+hoy+'"]');
  for(var i=0;i<marcas.length;i++)marcas[i].className+=" hoy";
  function mostrar(n){
    var ps=document.querySelectorAll(".persona");
    for(var i=0;i<ps.length;i++){ps[i].className=ps[i].getAttribute("data-numero")===n?"persona activa":"persona";}
    var fs=document.querySelectorAll("tbody tr");
    for(var j=0;j<fs.length;j++){fs[j].className=fs[j].getAttribute("data-numero")===n?"yo":"";}
    var ver=!n||verEquipo;
    equipo.className=ver?"equipo":"equipo oculto";
    btnEq.style.display=n?"":"none";
    btnEq.setAttribute("aria-expanded",ver?"true":"false");
    btnEq.textContent=verEquipo?"Ocultar el equipo":"Ver todo el equipo";
    btnIcs.disabled=!n||!datos.agentes[n]||datos.agentes[n].dias.length===0;
    nota.hidden=!n;
    var dia=n&&document.querySelector("#p-"+n+' .dia.hoy');
    if(dia&&dia.scrollIntoView)dia.scrollIntoView({block:"center"});
  }
  var pedido=location.hash.slice(1), guardado=leer();
  if(datos.agentes[pedido])sel.value=pedido; else if(guardado&&datos.agentes[guardado])sel.value=guardado;
  sel.addEventListener("change",function(){guardar(sel.value);verEquipo=false;mostrar(sel.value);});
  btnEq.addEventListener("click",function(){verEquipo=!verEquipo;mostrar(sel.value);});
  function fechaIcs(f,min){var p=f.split("-");var d=new Date(+p[0],+p[1]-1,+p[2],0,min);
    return d.getFullYear()+dos(d.getMonth()+1)+dos(d.getDate())+"T"+dos(d.getHours())+dos(d.getMinutes())+"00";}
  btnIcs.addEventListener("click",function(){
    var n=sel.value,a=datos.agentes[n]; if(!a)return;
    var u=new Date(),sello=u.getUTCFullYear()+dos(u.getUTCMonth()+1)+dos(u.getUTCDate())+"T"+dos(u.getUTCHours())+dos(u.getUTCMinutes())+dos(u.getUTCSeconds())+"Z";
    var l=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TmSystem//Horario//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Horario TmSystem",
      "BEGIN:VTIMEZONE","TZID:Europe/Madrid",
      "BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT",
      "BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD",
      "END:VTIMEZONE"];
    for(var i=0;i<a.dias.length;i++){var d=a.dias[i];for(var k=0;k<d.t.length;k++){
      l.push("BEGIN:VEVENT","UID:"+datos.mes+"-"+n+"-"+d.f+"-"+k+"@horario.tmsystem","DTSTAMP:"+sello,"SEQUENCE:"+datos.version,
        "DTSTART;TZID=Europe/Madrid:"+fechaIcs(d.f,d.t[k][0]),"DTEND;TZID=Europe/Madrid:"+fechaIcs(d.f,d.t[k][1]),"SUMMARY:Trabajo","TRANSP:OPAQUE","END:VEVENT");}}
    l.push("END:VCALENDAR");
    var blob=new Blob([l.join("\\r\\n")+"\\r\\n"],{type:"text/calendar;charset=utf-8"});
    var url=URL.createObjectURL(blob),enl=document.createElement("a");
    enl.href=url;enl.download="horario-"+datos.mes+"-"+n+".ics";document.body.appendChild(enl);enl.click();
    setTimeout(function(){URL.revokeObjectURL(url);enl.parentNode.removeChild(enl);},1000);
  });
  mostrar(sel.value);
})();
`;
