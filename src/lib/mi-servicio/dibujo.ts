import type { FormatosMiServicio } from "./motor";
import type { EtapaEmbudo, PuntoMiServicio } from "./tipos";

/** Un panel de la tira diaria: qué medida, con qué nombre y color. */
export interface PanelTira {
  clave: "ll" | "fi" | "ex" | "ho";
  titulo: string;
  /** Variable CSS del color («--ms-ll»). */
  color: string;
  formato: "entero" | "horas";
  /** Total del título; sin él, la suma de los periodos. */
  total?: number;
}

/** Una barra de composición: éxito, no válido y resto de un total. */
export interface ItemComposicion {
  nombre: string;
  total: number;
  fe: number;
  /** null: el cliente no tiene «no válidos» (la barra va sin ese tramo). */
  nv: number | null;
  /** Texto a la derecha de la barra. */
  detalle: string;
  /** Líneas del globo (la primera, en negrita). */
  globo: string[];
}

/**
 * DIBUJO de «Mi servicio» (06/11/2026): las gráficas en SVG, como texto, y
 * la interacción del globo. Las mismas en la pantalla y en el informe, que
 * lleva esta función dentro (`dibujoMiServicio.toString()`): AUTOCONTENIDA,
 * como el motor, sin imports ni variables de fuera. Recibe los formatos del
 * motor.
 *
 * Especificaciones (skill de visualización): columnas y barras de 24 px como
 * mucho con el extremo de datos redondeado (4 px) y la base recta, 2 px de
 * hueco entre tramos, rejilla de 1 px recesiva, una sola escala por gráfica
 * (las medidas distintas van en paneles distintos de la tira), los textos
 * con los colores de texto y nunca con el de la serie, y un globo en cada
 * marca. Los colores van en variables CSS (--ms-ll, --ms-fi, --ms-fe,
 * --ms-nv, --ms-va, --ms-ho) que define quien las pinta, con modo oscuro.
 */
export function dibujoMiServicio(fmt: FormatosMiServicio) {
  function esc(s: unknown): string {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/\n/g, "&#10;");
  }
  /** Coordenada con un decimal (SVG más corto). */
  function c(v: number): string {
    return String(Math.round(v * 10) / 10);
  }
  /** Máximo «redondo» del eje (1, 2, 2,5, 5 × 10ⁿ). */
  function maximoEje(v: number): number {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function formatea(formato: "entero" | "horas", v: number): string {
    return formato === "horas" ? fmt.horas(v) : fmt.entero(v);
  }
  /** Columna con el extremo de arriba redondeado y la base recta. */
  function columna(x: number, base: number, w: number, h: number): string {
    const r = Math.min(4, h, w / 2);
    const y = base - h;
    return (
      "M" + c(x) + "," + c(base) + "V" + c(y + r) + "Q" + c(x) + "," + c(y) + " " + c(x + r) + "," + c(y) +
      "H" + c(x + w - r) + "Q" + c(x + w) + "," + c(y) + " " + c(x + w) + "," + c(y + r) + "V" + c(base) + "Z"
    );
  }
  /** Barra horizontal; con `redondo`, el extremo derecho redondeado. */
  function barra(x: number, y: number, w: number, h: number, redondo: boolean): string {
    if (!redondo) return "M" + c(x) + "," + c(y) + "h" + c(w) + "v" + c(h) + "h" + c(-w) + "Z";
    const r = Math.min(4, w, h / 2);
    return (
      "M" + c(x) + "," + c(y) + "H" + c(x + w - r) + "Q" + c(x + w) + "," + c(y) + " " + c(x + w) + "," + c(y + r) +
      "V" + c(y + h - r) + "Q" + c(x + w) + "," + c(y + h) + " " + c(x + w - r) + "," + c(y + h) + "H" + c(x) + "Z"
    );
  }
  function recorta(texto: string, max: number): string {
    return texto.length > max ? texto.slice(0, Math.max(1, max - 1)) + "…" : texto;
  }
  function svg(ancho: number, alto: number, titulo: string, cuerpo: string): string {
    return (
      '<svg class="ms-svg" viewBox="0 0 ' + ancho + " " + alto + '" width="100%" role="img" aria-label="' +
      esc(titulo) + '" preserveAspectRatio="xMinYMin meet">' + cuerpo + "</svg>"
    );
  }

  /**
   * Tira diaria: un panel por medida (llamadas, finalizados, éxitos, horas),
   * cada uno con su escala, con las columnas alineadas por día. Al pasar el
   * ratón por un día se resalta en todos los paneles y el globo da las cifras.
   */
  function tira(puntos: PuntoMiServicio[], paneles: PanelTira[], ancho?: number): string {
    const W = ancho || 960;
    const ML = 4;
    const MR = 64;
    const CAB = 24;
    const ALTO = 64;
    const SEP = 16;
    const EJE = 20;
    const n = Math.max(1, puntos.length);
    const banda = (W - ML - MR) / n;
    const grosor = Math.min(24, Math.max(2, banda * 0.66));
    let y = 0;
    let cuerpo = "";
    for (const p of paneles) {
      const valores = puntos.map((x) => x[p.clave]);
      const total = p.total != null ? p.total : valores.reduce((s, v) => s + v, 0);
      const max = maximoEje(Math.max.apply(null, valores.concat([0])));
      const y0 = y + CAB;
      const base = y0 + ALTO;
      cuerpo +=
        '<text class="ms-tt" x="' + ML + '" y="' + (y + 15) + '">' + esc(p.titulo) +
        '<tspan class="ms-tv" dx="8">' + esc(formatea(p.formato, total)) + "</tspan></text>" +
        '<line class="ms-rejilla" x1="' + ML + '" x2="' + (W - MR) + '" y1="' + y0 + '" y2="' + y0 + '"/>' +
        '<text class="ms-tick" x="' + (W - MR + 6) + '" y="' + (y0 + 4) + '">' + esc(formatea(p.formato, max)) + "</text>" +
        '<line class="ms-base" x1="' + ML + '" x2="' + (W - MR) + '" y1="' + base + '" y2="' + base + '"/>' +
        '<text class="ms-tick" x="' + (W - MR + 6) + '" y="' + (base + 4) + '">0</text>';
      valores.forEach((v, i) => {
        if (!(v > 0)) return;
        const h = Math.max(1, (v / max) * ALTO);
        const x = ML + i * banda + (banda - grosor) / 2;
        cuerpo += '<path class="ms-barra" data-i="' + i + '" style="fill:var(' + p.color + ')" d="' + columna(x, base, grosor, h) + '"/>';
      });
      y = base + SEP;
    }
    // Días del eje: los que quepan sin pisarse
    const cada = Math.max(1, Math.ceil(n / Math.floor((W - ML - MR) / 64)));
    puntos.forEach((x, i) => {
      if (i % cada !== 0) return;
      cuerpo += '<text class="ms-tick" text-anchor="middle" x="' + c(ML + i * banda + banda / 2) + '" y="' + (y + 6) + '">' + esc(x.etiqueta) + "</text>";
    });
    const alto = y + EJE;
    // Zonas del globo, encima de todo: un día entero, todos los paneles
    puntos.forEach((x, i) => {
      const lineas = [x.etiquetaLarga].concat(paneles.map((p) => p.titulo + ": " + formatea(p.formato, x[p.clave])));
      cuerpo +=
        '<rect class="ms-zona" data-i="' + i + '" x="' + c(ML + i * banda) + '" y="0" width="' + c(banda) + '" height="' + (alto - EJE) +
        '" data-tip="' + esc(lineas.join("\n")) + '"/>';
    });
    return svg(W, alto, "Evolución por " + (puntos.length > 0 && puntos[0].etiqueta.indexOf("sem.") === 0 ? "semana" : "día") + ": " + paneles.map((p) => p.titulo).join(", "), cuerpo);
  }

  /** Embudo: llamadas → finalizados → válidos → finalizados con éxito. */
  function embudo(etapas: EtapaEmbudo[], ancho?: number): string {
    const W = ancho || 520;
    const ML = 158;
    const MR = 120;
    const FILA = 44;
    const GROSOR = 22;
    const COLOR: Record<string, string> = { ll: "--ms-ll", fi: "--ms-fi", va: "--ms-va", fe: "--ms-fe" };
    const max = Math.max.apply(null, etapas.map((e) => e.valor).concat([1]));
    let cuerpo = "";
    etapas.forEach((e, i) => {
      const y = i * FILA + (FILA - GROSOR) / 2;
      const w = e.valor > 0 ? Math.max(2, (e.valor / max) * (W - ML - MR)) : 0;
      const anterior = i > 0 ? etapas[i - 1].etiqueta.toLowerCase() : "";
      cuerpo += '<text class="ms-et" text-anchor="end" x="' + (ML - 10) + '" y="' + c(y + GROSOR / 2 + 4) + '">' + esc(e.etiqueta) + "</text>";
      if (w > 0) cuerpo += '<path class="ms-barra" style="fill:var(' + COLOR[e.clave] + ')" d="' + barra(ML, y, w, GROSOR, true) + '"/>';
      cuerpo +=
        '<text class="ms-val" x="' + c(ML + w + 8) + '" y="' + c(y + GROSOR / 2 + 4) + '">' + esc(fmt.entero(e.valor)) +
        (e.pctAnterior != null ? '<tspan class="ms-tick" dx="6">' + esc(fmt.pct(e.pctAnterior)) + "</tspan>" : "") + "</text>";
      const globo = [e.etiqueta, fmt.entero(e.valor)].concat(e.pctAnterior != null ? [fmt.pct(e.pctAnterior) + " de " + anterior] : []);
      cuerpo += '<rect class="ms-zona" x="0" y="' + i * FILA + '" width="' + W + '" height="' + FILA + '" data-tip="' + esc(globo.join("\n")) + '"/>';
    });
    return svg(W, etapas.length * FILA, "Embudo: " + etapas.map((e) => e.etiqueta + " " + fmt.entero(e.valor)).join(", "), cuerpo);
  }

  /**
   * Barras de composición (resultados, campañas): cada barra es un total
   * partido en éxito, no válido y resto, con 2 px de hueco entre tramos y el
   * extremo de datos redondeado.
   */
  function composicion(items: ItemComposicion[], titulo: string, ancho?: number): string {
    const W = ancho || 960;
    const nombreMasLargo = Math.max.apply(null, items.map((x) => x.nombre.length).concat([8]));
    // Márgenes según el ancho: en una tarjeta estrecha la barra también tiene que caber
    const ML = Math.min(260, Math.round(W * 0.42), Math.max(110, nombreMasLargo * 6.6 + 14));
    const MR = Math.min(170, Math.round(W * 0.27));
    const FILA = 30;
    const GROSOR = 16;
    const HUECO = 2;
    const max = Math.max.apply(null, items.map((x) => x.total).concat([1]));
    const maxCar = Math.floor((ML - 14) / 6.6);
    let cuerpo = "";
    items.forEach((it, i) => {
      const y = i * FILA + (FILA - GROSOR) / 2;
      const largo = (it.total / max) * (W - ML - MR);
      const nv = it.nv == null ? 0 : it.nv;
      const tramos = [
        { v: it.fe, color: "--ms-fe" },
        { v: nv, color: "--ms-nv" },
        { v: Math.max(0, it.total - it.fe - nv), color: "--ms-fi" },
      ].filter((t) => t.v > 0);
      let x = ML;
      tramos.forEach((t, k) => {
        const ultimo = k === tramos.length - 1;
        const w = it.total > 0 ? (t.v / it.total) * largo : 0;
        const dibujo = ultimo ? w : w - HUECO;
        if (dibujo > 0.5) cuerpo += '<path class="ms-barra" style="fill:var(' + t.color + ')" d="' + barra(x, y, dibujo, GROSOR, ultimo) + '"/>';
        x += w;
      });
      cuerpo +=
        '<text class="ms-et" text-anchor="end" x="' + c(ML - 10) + '" y="' + c(y + GROSOR / 2 + 4) + '">' + esc(recorta(it.nombre, maxCar)) + "</text>" +
        '<text class="ms-val" x="' + c(Math.max(ML, x) + 8) + '" y="' + c(y + GROSOR / 2 + 4) + '">' + esc(it.detalle) + "</text>" +
        '<rect class="ms-zona" x="0" y="' + i * FILA + '" width="' + W + '" height="' + FILA + '" data-tip="' + esc(it.globo.join("\n")) + '"/>';
    });
    return svg(W, Math.max(1, items.length) * FILA, titulo, cuerpo);
  }

  /** Anillo de un porcentaje (aprovechamiento). */
  function anillo(pct: number | null, color: string, titulo: string): string {
    const R = 44;
    const L = 2 * Math.PI * R;
    const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    return svg(
      112,
      112,
      titulo + ": " + fmt.pct(pct),
      '<circle class="ms-pista" cx="56" cy="56" r="' + R + '" fill="none" stroke-width="12"/>' +
        (v > 0
          ? '<circle cx="56" cy="56" r="' + R + '" fill="none" stroke-width="12" stroke-linecap="round" style="stroke:var(' + color +
            ')" stroke-dasharray="' + c((v / 100) * L) + " " + c(L) + '" transform="rotate(-90 56 56)"/>'
          : "") +
        '<text class="ms-anillo" text-anchor="middle" x="56" y="61">' + esc(fmt.pct(pct)) + "</text>",
    );
  }

  /** Minigráfica de una tarjeta: línea de 2 px con lavado y punto final. */
  function minigrafica(valores: number[], color: string): string {
    if (valores.length < 2 || !valores.some((v) => v > 0)) return "";
    const W = 160;
    const H = 36;
    const max = Math.max.apply(null, valores);
    const paso = (W - 8) / (valores.length - 1);
    const pts = valores.map((v, i) => [4 + i * paso, H - 4 - (v / max) * (H - 10)]);
    const linea = pts.map((p) => c(p[0]) + "," + c(p[1])).join(" ");
    const ultimo = pts[pts.length - 1];
    return (
      '<svg class="ms-mini" viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '" aria-hidden="true" preserveAspectRatio="none">' +
      '<polygon style="fill:var(' + color + ')" opacity="0.1" points="4,' + (H - 4) + " " + linea + " " + c(ultimo[0]) + "," + (H - 4) + '"/>' +
      '<polyline fill="none" style="stroke:var(' + color + ')" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="' + linea + '"/>' +
      "</svg>"
    );
  }

  /** Leyenda: muestra de color + texto (el texto, nunca del color de la serie). */
  function leyenda(items: { color: string; texto: string }[]): string {
    return (
      '<div class="ms-leyenda">' +
      items.map((x) => '<span class="ms-ley"><i style="background:var(' + x.color + ')"></i>' + esc(x.texto) + "</span>").join("") +
      "</div>"
    );
  }

  /** La tira en tabla (la vista accesible de la gráfica). */
  function tablaDias(puntos: PuntoMiServicio[], paneles: PanelTira[]): string {
    return (
      '<table class="ms-tabla"><thead><tr><th>' + (puntos.length > 0 && puntos[0].etiqueta.indexOf("sem.") === 0 ? "Semana" : "Día") + "</th>" +
      paneles.map((p) => '<th class="ms-num">' + esc(p.titulo) + "</th>").join("") +
      "</tr></thead><tbody>" +
      puntos
        .map((x) => "<tr><td>" + esc(x.etiquetaLarga) + "</td>" + paneles.map((p) => '<td class="ms-num">' + esc(formatea(p.formato, x[p.clave])) + "</td>").join("") + "</tr>")
        .join("") +
      "</tbody></table>"
    );
  }

  /**
   * Globo y resaltado al pasar el ratón por cualquier [data-tip] de `raiz`.
   * Devuelve la función que quita los escuchadores.
   */
  function instalarInteraccion(raiz: HTMLElement): () => void {
    const doc = raiz.ownerDocument;
    let globo = doc.getElementById("ms-globo");
    if (!globo) {
      globo = doc.createElement("div");
      globo.id = "ms-globo";
      globo.className = "ms-globo";
      globo.setAttribute("role", "tooltip");
      doc.body.appendChild(globo);
    }
    const g = globo;
    let activo: Element | null = null;
    function soltar() {
      if (!activo) return;
      const s = activo.closest("svg");
      if (s) {
        s.classList.remove("ms-foco");
        s.querySelectorAll(".ms-on").forEach((e) => e.classList.remove("ms-on"));
      }
      activo = null;
    }
    function ocultar() {
      soltar();
      g.style.display = "none";
    }
    function mover(e: MouseEvent) {
      const objetivo = e.target as Element | null;
      const el = objetivo && objetivo.closest ? objetivo.closest("[data-tip]") : null;
      if (!el || !raiz.contains(el)) {
        ocultar();
        return;
      }
      if (el !== activo) {
        soltar();
        activo = el;
        const lineas = (el.getAttribute("data-tip") || "").split("\n");
        g.textContent = "";
        lineas.forEach((l, i) => {
          const d = doc.createElement("div");
          if (i === 0) d.className = "ms-globo-t";
          d.textContent = l;
          g.appendChild(d);
        });
        const i = el.getAttribute("data-i");
        const s = el.closest("svg");
        if (i != null && s) {
          s.classList.add("ms-foco");
          s.querySelectorAll('[data-i="' + i + '"]').forEach((x) => x.classList.add("ms-on"));
        }
        g.style.display = "block";
      }
      const vw = doc.documentElement.clientWidth;
      const vh = doc.documentElement.clientHeight;
      const r = g.getBoundingClientRect();
      let x = e.clientX + 14;
      let y = e.clientY + 14;
      if (x + r.width > vw - 8) x = Math.max(8, e.clientX - r.width - 14);
      if (y + r.height > vh - 8) y = Math.max(8, e.clientY - r.height - 14);
      g.style.left = x + "px";
      g.style.top = y + "px";
    }
    raiz.addEventListener("mousemove", mover);
    raiz.addEventListener("mouseleave", ocultar);
    return () => {
      raiz.removeEventListener("mousemove", mover);
      raiz.removeEventListener("mouseleave", ocultar);
      ocultar();
    };
  }

  return { esc, tira, embudo, composicion, anillo, minigrafica, leyenda, tablaDias, instalarInteraccion };
}

export type DibujoMiServicio = ReturnType<typeof dibujoMiServicio>;
