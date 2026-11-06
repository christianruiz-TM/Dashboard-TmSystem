import { dibujoMiServicio } from "./dibujo";
import { CSS_GRAFICAS } from "./estilos";
import { CONTACTO_TMSYSTEM, GLOSARIO_CLIENTE, type ClaveMiServicio } from "./glosario";
import { LOGO_TMSYSTEM_PNG_BASE64 } from "./logo";
import { motorMiServicio } from "./motor";
import type { DatosMiServicio } from "./tipos";
import { vistaMiServicio } from "./vista";

// ============================================================
// Informe descargable de «Mi servicio» (06/11/2026): UN solo fichero HTML
// que no carga nada de fuera (logo en base64, CSS y JavaScript dentro), con
// la marca de TM System, listo para mandar al cliente.
//  - Lleva lo que había en pantalla al descargarlo: cliente, periodo y
//    filtros (los datos son los de cargarMiServicio).
//  - Ya pintado desde el servidor con todas sus campañas: se lee e imprime
//    aunque el programa que lo abra no ejecute JavaScript.
//  - Con JavaScript: casillas para quitar y poner campañas (recalcula todo
//    con el MISMO motor de la pantalla, que va dentro) y globos.
//  - Se imprime bien en A4 (o «Guardar como PDF»): sin controles, colores
//    exactos y sin cortar tarjetas.
//  - Nunca lleva lo interno: ni agentes ni los globos de los roles internos.
// ============================================================

export interface OpcionesInforme {
  /** Comentarios de quien lo descarga, para el cliente (texto, sin formato). */
  comentarios: string | null;
}

/** Nombre del fichero: «Informe GrupoHuertas 2026-11-01 a 2026-11-06.html». */
export function nombreFicheroInforme(datos: DatosMiServicio): string {
  const limpio = datos.servicio.replace(/[^\p{L}\p{N} _.-]+/gu, "").trim() || "cliente";
  return `Informe ${limpio} ${datos.desde}${datos.hasta !== datos.desde ? ` a ${datos.hasta}` : ""}.html`;
}

/** Términos del glosario que salen en el informe. */
function clavesGlosario(datos: DatosMiServicio): ClaveMiServicio[] {
  const claves: ClaveMiServicio[] = ["llamadas", "finalizados"];
  if (datos.configurado) claves.push("noValidos");
  claves.push("exitos", "finalizadosExito");
  // Con todas las campañas, horas logadas; quitando alguna, las de la ficha
  if (datos.horas) claves.push("horasLogadas");
  claves.push("horasFicha", "llamadasHora", "exitosHora", "finalizadosPorExito", "bruto");
  if (datos.configurado) claves.push("neto");
  return claves;
}

const CSS_INFORME = `
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:#f4f5f3;color:#1c252c;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.pagina{max-width:1180px;margin:0 auto;padding:28px 24px 40px}
.cab{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;background:#fff;border-radius:16px 16px 0 0;padding:22px 26px 18px}
.cab img{height:58px;width:auto;display:block}
.cab-t{text-align:right}
.cab-sup{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6f6e69}
.cab h1{margin:2px 0 0;font-size:26px;line-height:1.2;font-weight:700}
.cab-periodo{margin-top:2px;color:#52514e}
.banda{height:5px;background:linear-gradient(90deg,#f4ce3c 0 28%,#60d0e4 28% 100%);border-radius:0 0 4px 4px}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:12px 2px 0;font-size:12.5px;color:#52514e}
.meta b{color:#1c252c;font-weight:600}
.bloque{background:#fff;border:1px solid #e6e5df;border-radius:14px;padding:18px 20px;margin-top:16px}
.bloque h2{margin:0 0 4px;font-size:15px;font-weight:650}
.bloque .desc{margin:0 0 12px;font-size:12.5px;color:#6f6e69}
.comentarios p{margin:0;white-space:pre-wrap}
.controles .ctl-botones{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.controles button,.imprimir{font:inherit;font-size:12.5px;padding:5px 12px;border-radius:999px;border:1px solid #c3c2b7;background:#fff;color:#1c252c;cursor:pointer}
.controles button:hover,.imprimir:hover{border-color:#1c252c}
.imprimir{background:#1c252c;color:#fff;border-color:#1c252c}
.imprimir:hover{background:#000}
.ctl-casillas{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 14px;font-size:13px}
.ctl-casillas label{display:flex;align-items:center;gap:6px;cursor:pointer}
.ctl-casillas small{color:#6f6e69}
.ctl-aviso{margin:10px 0 0;font-size:12px;color:#6f6e69}
.t-fila{display:grid;gap:12px;margin-top:16px}
.t-fila-principal{grid-template-columns:repeat(5,minmax(0,1fr))}
.t-fila-ratio{grid-template-columns:repeat(5,minmax(0,1fr))}
.t{background:#fff;border:1px solid #e6e5df;border-radius:14px;padding:14px 16px 12px;display:flex;flex-direction:column;min-width:0}
.t-principal{border-top:3px solid #f4ce3c}
.t-cab{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6f6e69}
.t-ayuda{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid #c3c2b7;font-size:10px;cursor:help;flex:none}
.t-cuerpo{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}
.t-valor{font-size:26px;font-weight:650;line-height:1.15;white-space:nowrap}
.t-ratio .t-valor{font-size:22px}
.t-sub{font-size:12px;color:#52514e;margin-top:2px}
.t-anillo{width:64px;flex:none}
.t-mini{margin-top:auto;padding-top:8px}
.dos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.dos>.bloque{margin-top:16px}
.reparto{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px;font-size:13px}
.reparto li{display:grid;grid-template-columns:12px 1fr auto 72px;align-items:center;gap:8px}
.reparto i{width:10px;height:10px;border-radius:3px}
.reparto b{font-weight:600;font-variant-numeric:tabular-nums}
.reparto em{font-style:normal;color:#6f6e69;text-align:right;font-variant-numeric:tabular-nums}
details{margin-top:10px;font-size:13px}
summary{cursor:pointer;color:#52514e}
.tabla-scroll{overflow-x:auto}
.vacio{margin:4px 0;color:#6f6e69}
.glosario dl{margin:0;display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:8px 18px;font-size:13px}
.glosario dt{font-weight:600}
.glosario dd{margin:0;color:#52514e}
.pie{margin-top:20px;padding:16px 4px 0;border-top:1px solid #e6e5df;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;font-size:12px;color:#6f6e69}
.pie b{color:#1c252c}
@media (max-width:900px){.t-fila-principal,.t-fila-ratio{grid-template-columns:repeat(2,minmax(0,1fr))}.dos{grid-template-columns:1fr}.cab-t{text-align:left}}
@page{size:A4;margin:10mm 10mm 12mm}
@media print{
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{background:#fff;font-size:12px}
  .pagina{max-width:none;padding:0}
  .no-print,details{display:none!important}
  .cab{padding:0 0 12px}
  .cab img{height:46px}
  .bloque,.t{break-inside:avoid}
  .bloque{padding:12px 14px}
  .t{padding:10px 12px}
  .t-valor{font-size:18px}.t-ratio .t-valor{font-size:16px}
  .t-anillo{width:48px}
  .t-ayuda{display:none}
  .t-fila-principal,.t-fila-ratio{grid-template-columns:repeat(5,minmax(0,1fr))}
  .dos{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .tabla-scroll{overflow:visible}
  .ms-tabla{font-size:8.5px}
  .ms-tabla th,.ms-tabla td{padding:3px 4px}
  .ms-tabla th{white-space:normal}
  .salto{break-before:page}
}
`;

export function informeHtml(datos: DatosMiServicio, opciones: OpcionesInforme): string {
  const motor = motorMiServicio();
  const dibujo = dibujoMiServicio(motor.fmt);
  const vista = vistaMiServicio(motor, dibujo);
  const esc = dibujo.esc;
  const fmt = motor.fmt;
  const panel = motor.calcular(datos);
  const s = vista.secciones(datos, panel, GLOSARIO_CLIENTE);
  const hueco = (clave: string) => `<div id="ms-${clave}">${s[clave] ?? ""}</div>`;

  const periodo =
    datos.desde === datos.hasta ? `Día ${fmt.fecha(datos.desde)}` : `Del ${fmt.fecha(datos.desde)} al ${fmt.fecha(datos.hasta)}`;
  const filtro = [
    datos.filtro.tipo ? `<span>Campañas: <b>${esc(datos.filtro.tipo)}</b></span>` : "",
    datos.filtro.campania ? `<span>Campaña: <b>${esc(datos.filtro.campania)}</b></span>` : "",
  ].join("");
  const comentarios = opciones.comentarios?.trim();
  const glosario = clavesGlosario(datos)
    .map((k) => `<dt>${esc(GLOSARIO_CLIENTE[k].termino)}</dt><dd>${esc(GLOSARIO_CLIENTE[k].definicion)}</dd>`)
    .join("");

  // Los datos van como JSON en una etiqueta aparte: «<» escapado para que
  // ningún texto (un nombre de campaña, un resultado) pueda cerrar la etiqueta
  const json = JSON.stringify({ datos, textos: GLOSARIO_CLIENTE })
    .replace(/</g, "\\u003c")
    // U+2028 y U+2029: separadores de línea que no pueden ir sueltos en un <script>
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
  // `__name`: esbuild (tsx y vitest) puede envolver las funciones con
  // __name(f, "nombre") al compilar; en el navegador no existe, así que se
  // define aquí sin hacer nada
  const programa =
    "(function(){var __name=function(f){return f};try{" +
    'var d=JSON.parse(document.getElementById("ms-datos").textContent);' +
    `var motor=(${motorMiServicio.toString()})();` +
    `var dibujo=(${dibujoMiServicio.toString()})(motor.fmt);` +
    `var vista=(${vistaMiServicio.toString()})(motor,dibujo);` +
    "vista.iniciar(document,d.datos,d.textos);" +
    '}catch(e){var c=document.getElementById("ms-controles");if(c)c.innerHTML="<p class=\\"vacio\\">Este programa no deja filtrar las campañas: el informe se ve completo.</p>";}})();';
  if (/<\/script/i.test(programa)) throw new Error("El programa del informe no puede llevar «</script»");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Informe de servicio · ${esc(datos.servicio)} · ${esc(periodo)}</title>
<style>${CSS_GRAFICAS}${CSS_INFORME}</style>
</head>
<body>
<div class="pagina ms-raiz">
  <header class="cab">
    <img src="data:image/png;base64,${LOGO_TMSYSTEM_PNG_BASE64}" alt="TM System Contact Center">
    <div class="cab-t">
      <div class="cab-sup">Informe de servicio</div>
      <h1>${esc(datos.servicio)}</h1>
      <div class="cab-periodo">${esc(periodo)}</div>
    </div>
  </header>
  <div class="banda"></div>
  <div class="meta">
    <span>Datos a <b>${esc(datos.generado)}</b></span>
    ${filtro}
    <span id="ms-incluidas">${s.incluidas}</span>
  </div>
${
  comentarios
    ? `  <section class="bloque comentarios">
    <h2>Comentarios</h2>
    <p>${esc(comentarios)}</p>
  </section>`
    : ""
}
  <section class="bloque controles no-print">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">
      <h2 style="margin:0">Campañas del informe</h2>
      <button type="button" class="imprimir" id="ms-imprimir">Imprimir o guardar en PDF</button>
    </div>
    <div id="ms-controles">${vista.controlesHtml(datos)}</div>
    <p class="ctl-aviso">Marca o desmarca campañas para ver solo sus cifras. Al quitar alguna, las horas pasan a ser las de la ficha abierta en las campañas marcadas.</p>
  </section>
  ${hueco("kpis")}
  <section class="bloque">
    <h2>Evolución</h2>
    <p class="desc">${panel.serie.granularidad === "semana" ? "Por semanas" : "Día a día"}: cada medida con su escala. Pasa el ratón por ${panel.serie.granularidad === "semana" ? "una semana" : "un día"} para ver sus cifras.</p>
    ${hueco("tira")}
    <details><summary>Ver la tabla</summary><div class="tabla-scroll">${hueco("tablaDias")}</div></details>
  </section>
  <div class="dos">
    <section class="bloque">
      <h2>Del contacto al éxito</h2>
      <p class="desc">Cada paso, con el % sobre el anterior.</p>
      ${hueco("embudo")}
    </section>
    <section class="bloque">
      <h2>Cómo acabaron los finalizados</h2>
      <p class="desc">Contactos cerrados en el periodo, según su resultado.</p>
      ${hueco("reparto")}
    </section>
  </div>
${
  datos.configurado
    ? `  <section class="bloque salto">
    <h2>Resultados</h2>
    <p class="desc">Finalizados por ${esc((datos.niveles[0] || "resultado").toLowerCase())}, con su parte de éxito y de no válidos.</p>
    ${hueco("resultados")}
  </section>
  <section class="bloque">
    <h2>Motivos de no válido</h2>
    <p class="desc">Por qué no se pudieron aprovechar los no válidos.</p>
    ${hueco("motivos")}
  </section>`
    : ""
}
  <section class="bloque${datos.configurado ? "" : " salto"}">
    <h2>Por campaña</h2>
    <p class="desc">Finalizados de cada campaña y su aprovechamiento.</p>
    ${hueco("campanias")}
    <div class="tabla-scroll" style="margin-top:14px">${hueco("tablaCampanias")}</div>
  </section>
  <section class="bloque glosario">
    <h2>Qué significa cada cifra</h2>
    <dl>${glosario}</dl>
  </section>
  <footer class="pie">
    <div><b>${esc(CONTACTO_TMSYSTEM.nombre)}</b><br>${esc(CONTACTO_TMSYSTEM.direccion)}</div>
    <div>${esc(CONTACTO_TMSYSTEM.telefono)} · ${esc(CONTACTO_TMSYSTEM.email)} · ${esc(CONTACTO_TMSYSTEM.web)}</div>
  </footer>
</div>
<script type="application/json" id="ms-datos">${json}</script>
<script>${programa}</script>
</body>
</html>
`;
}
