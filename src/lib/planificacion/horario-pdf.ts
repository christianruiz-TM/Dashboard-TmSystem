// NOTA: solo servidor. PDF de la copia del plan publicado para las agentes:
// UNA página A4 apaisada con todas, una fila por persona y una columna por
// día. Sin cliente: solo de qué hora a qué hora trabaja cada una. Se dibuja a
// mano con pdf-lib (JavaScript puro, sin binarios ni fuentes que copiar a la
// imagen Docker) y la fuente Helvetica del propio PDF (WinAnsi: tildes, «ñ»,
// «–» y «·» incluidos).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { aclarar, LETRA_DIA, tramoCorto, type DiaHorario, type HorarioMes } from "./horario-agentes";

const A4_APAISADO: [number, number] = [841.89, 595.28];
const MARGEN = 22;

const NEGRO = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);
const GRIS_CLARO = rgb(0.62, 0.62, 0.62);
const LINEA = rgb(0.78, 0.77, 0.74);
const FONDO_FINDE = rgb(0.9, 0.89, 0.87);
const FONDO_TRABAJA = rgb(1, 0.965, 0.82);
const FONDO_CEBRA = rgb(0.965, 0.965, 0.955);
const MARCA = rgb(0.961, 0.812, 0.239); // #F5CF3D

const aRgb = (c: { r: number; g: number; b: number }): RGB => rgb(c.r, c.g, c.b);

/**
 * Texto que la fuente estándar sabe dibujar: lo que no está en WinAnsi
 * (p. ej. una «ł» en un nombre) se cambia por su letra sin tilde o por «?»,
 * en vez de reventar el PDF.
 */
function seguro(texto: string, fuente: PDFFont): string {
  let salida = "";
  for (const ch of texto) {
    try {
      fuente.encodeText(ch);
      salida += ch;
    } catch {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      try {
        fuente.encodeText(base);
        salida += base;
      } catch {
        salida += "?";
      }
    }
  }
  return salida;
}

/** Tamaño de letra (≤ maximo) para que el texto quepa en `ancho`. */
function tamanoQueCabe(texto: string, fuente: PDFFont, maximo: number, ancho: number, minimo = 4): number {
  const w = fuente.widthOfTextAtSize(texto, maximo);
  return w <= ancho ? maximo : Math.max(minimo, (maximo * ancho) / w);
}

/** Texto centrado en una caja; recorta con «…» si ni al mínimo cabe. */
function centrado(pagina: PDFPage, texto: string, fuente: PDFFont, tam: number, cx: number, y: number, color: RGB): void {
  const w = fuente.widthOfTextAtSize(texto, tam);
  pagina.drawText(texto, { x: cx - w / 2, y, size: tam, font: fuente, color });
}

function recortar(texto: string, fuente: PDFFont, tam: number, ancho: number): string {
  if (fuente.widthOfTextAtSize(texto, tam) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}…`, tam) > ancho) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Líneas de una casilla. */
function lineasCelda(d: DiaHorario): string[] {
  if (d.estado === "trabaja") return d.tramos.map(tramoCorto);
  if (d.estado === "ausencia") return [d.ausencia ?? ""];
  return [d.estado === "festivo" ? "Festivo" : "Libre"];
}

export async function horarioPdf(h: HorarioMes, opciones: { generado: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Horario de ${h.mesTexto}`);
  doc.setAuthor("TmSystem");
  doc.setSubject(`Plan publicado, versión ${h.version.numero}`);
  doc.setCreator("Dashboard TmSystem");
  doc.setProducer("Dashboard TmSystem");
  const pagina = doc.addPage(A4_APAISADO);
  const [ancho, alto] = A4_APAISADO;
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  // ---------- Título ----------
  let y = alto - MARGEN;
  pagina.drawRectangle({ x: MARGEN, y: y - 22, width: 5, height: 22, color: MARCA });
  pagina.drawText(seguro(`Horario de ${h.mesTexto}`, negrita), { x: MARGEN + 11, y: y - 17, size: 17, font: negrita, color: NEGRO });
  const publicado = h.version.publicadaAt ? `Plan publicado el ${h.version.publicadaAt.slice(0, 10)}` : "Plan publicado";
  const derecha = `${publicado} · versión ${h.version.numero} · vale siempre el más reciente`;
  const wDerecha = normal.widthOfTextAtSize(derecha, 8.5);
  pagina.drawText(derecha, { x: ancho - MARGEN - wDerecha, y: y - 15, size: 8.5, font: normal, color: GRIS });
  y -= 32;

  // ---------- Leyenda (se mide antes para saber cuánto alto queda a la tabla) ----------
  const piezasLeyenda: { negrita: string; texto: string; fondo?: RGB }[] = [
    { negrita: "9–14", texto: " = trabajas de 9:00 a 14:00", fondo: FONDO_TRABAJA },
    { negrita: "Varias líneas", texto: " (9–14 y 16–20) = varios tramos ese día, con descanso entre ellos" },
    { negrita: "Libre", texto: " = no trabajas" },
    ...(h.hayFestivos ? [{ negrita: "Festivo", texto: " = festivo, no trabajas", fondo: FONDO_FINDE }] : []),
    ...h.tipos.map((t) => ({ negrita: t.codigo, texto: ` = ${t.nombre}`, fondo: aRgb(aclarar(t.color, 0.6)) })),
  ];
  const tamLeyenda = 7.5;
  const anchoUtil = ancho - 2 * MARGEN;
  const filasLeyenda: (typeof piezasLeyenda)[] = [[]];
  let xLeyenda = 0;
  const anchoPieza = (p: (typeof piezasLeyenda)[number]) =>
    (p.fondo ? 11 : 0) + negrita.widthOfTextAtSize(seguro(p.negrita, negrita), tamLeyenda) + normal.widthOfTextAtSize(seguro(p.texto, normal), tamLeyenda) + 16;
  for (const p of piezasLeyenda) {
    const w = anchoPieza(p);
    if (xLeyenda + w > anchoUtil && filasLeyenda[filasLeyenda.length - 1].length > 0) {
      filasLeyenda.push([]);
      xLeyenda = 0;
    }
    filasLeyenda[filasLeyenda.length - 1].push(p);
    xLeyenda += w;
  }
  const altoLeyenda = filasLeyenda.length * 11 + 14;

  // ---------- Tabla ----------
  const n = Math.max(1, h.filas.length);
  const nDias = h.columnas.length;
  const tamNombreMax = 8;
  const anchoNombre = Math.min(
    150,
    Math.max(90, ...h.filas.map((f) => negrita.widthOfTextAtSize(seguro(f.nombre, negrita), tamNombreMax) + 10)),
  );
  const anchoDia = (anchoUtil - anchoNombre) / nDias;
  const altoCabecera = 22;
  const altoDisponible = y - MARGEN - altoLeyenda - altoCabecera;
  const maxLineas = Math.max(1, ...h.filas.flatMap((f) => f.dias.map((d) => lineasCelda(d).length)));
  const altoFila = Math.min(44, Math.max(9, altoDisponible / n));
  const tamCelda = Math.min(9, (altoFila - 3) / (maxLineas * 1.15));
  // UN tamaño para todas las horas (el que hace caber la más ancha): con un
  // tamaño por casilla, «9–14» salía más grande que «10–14» y despistaba
  const tamHoras = Math.min(
    tamCelda,
    ...h.filas.flatMap((f) =>
      f.dias.filter((d) => d.estado !== "libre" && d.estado !== "festivo").flatMap((d) =>
        lineasCelda(d).map((l) => tamanoQueCabe(seguro(l, negrita), negrita, tamCelda, anchoDia - 3)),
      ),
    ),
  );
  const xTabla = MARGEN;
  const xDias = xTabla + anchoNombre;

  // Cabecera de días
  const yCab = y - altoCabecera;
  h.columnas.forEach((c, i) => {
    const x = xDias + i * anchoDia;
    if (c.finDeSemana || c.festivo) {
      pagina.drawRectangle({ x, y: yCab, width: anchoDia, height: altoCabecera, color: FONDO_FINDE });
    }
    centrado(pagina, LETRA_DIA[c.diaSemana], normal, 7, x + anchoDia / 2, yCab + 13, GRIS);
    centrado(pagina, String(c.dia), negrita, 9, x + anchoDia / 2, yCab + 3.5, NEGRO);
  });
  pagina.drawText("Persona", { x: xTabla + 4, y: yCab + 7, size: 8, font: negrita, color: GRIS });

  // Filas
  const yInicioFilas = yCab;
  h.filas.forEach((f, r) => {
    const yFila = yInicioFilas - (r + 1) * altoFila;
    if (r % 2 === 1) pagina.drawRectangle({ x: xTabla, y: yFila, width: anchoNombre, height: altoFila, color: FONDO_CEBRA });
    const nombre = seguro(f.nombre, negrita);
    const tamNombre = Math.min(tamNombreMax, altoFila - 2);
    pagina.drawText(recortar(nombre, negrita, tamNombre, anchoNombre - 8), {
      x: xTabla + 4,
      y: yFila + altoFila / 2 - tamNombre * 0.35,
      size: tamNombre,
      font: negrita,
      color: NEGRO,
    });

    f.dias.forEach((d, i) => {
      const c = h.columnas[i];
      const x = xDias + i * anchoDia;
      const fondo =
        d.estado === "trabaja"
          ? FONDO_TRABAJA
          : d.estado === "ausencia"
            ? aRgb(aclarar(h.tipos.find((t) => t.codigo === d.ausencia)?.color ?? "#BFBFBF", 0.6))
            : c.finDeSemana || c.festivo
              ? FONDO_FINDE
              : r % 2 === 1
                ? FONDO_CEBRA
                : undefined;
      if (fondo) pagina.drawRectangle({ x, y: yFila, width: anchoDia, height: altoFila, color: fondo });

      const lineas = lineasCelda(d).map((l) => seguro(l, negrita));
      const fuente = d.estado === "trabaja" || d.estado === "ausencia" ? negrita : normal;
      const color = d.estado === "trabaja" || d.estado === "ausencia" ? NEGRO : GRIS_CLARO;
      const tam =
        d.estado === "trabaja" || d.estado === "ausencia"
          ? tamHoras
          : Math.min(...lineas.map((l) => tamanoQueCabe(l, fuente, Math.min(tamCelda, 7), anchoDia - 2.5)));
      const interlinea = tam * 1.15;
      const altoTexto = lineas.length * interlinea;
      lineas.forEach((l, k) => {
        const yl = yFila + altoFila / 2 + altoTexto / 2 - (k + 1) * interlinea + tam * 0.22;
        centrado(pagina, l, fuente, tam, x + anchoDia / 2, yl, color);
      });
    });
  });

  // Rejilla: horizontales finas, verticales finas y una gruesa al empezar cada semana
  const yFin = yInicioFilas - n * altoFila;
  const xFin = xDias + nDias * anchoDia;
  for (let r = 0; r <= n; r++) {
    const yl = yInicioFilas - r * altoFila;
    pagina.drawLine({ start: { x: xTabla, y: yl }, end: { x: xFin, y: yl }, thickness: 0.4, color: LINEA });
  }
  pagina.drawLine({ start: { x: xTabla, y: y }, end: { x: xFin, y: y }, thickness: 0.4, color: LINEA });
  pagina.drawLine({ start: { x: xTabla, y: y }, end: { x: xTabla, y: yFin }, thickness: 0.4, color: LINEA });
  h.columnas.forEach((c, i) => {
    const x = xDias + i * anchoDia;
    const gruesa = i === 0 || c.empiezaSemana;
    pagina.drawLine({ start: { x, y }, end: { x, y: yFin }, thickness: gruesa ? 1.3 : 0.4, color: gruesa ? NEGRO : LINEA });
  });
  pagina.drawLine({ start: { x: xFin, y }, end: { x: xFin, y: yFin }, thickness: 1.3, color: NEGRO });

  // ---------- Leyenda ----------
  let yLey = yFin - 14;
  for (const fila of filasLeyenda) {
    let x = MARGEN;
    for (const p of fila) {
      if (p.fondo) {
        pagina.drawRectangle({ x, y: yLey - 1.5, width: 8, height: 8, color: p.fondo, borderColor: LINEA, borderWidth: 0.4 });
        x += 11;
      }
      const tn = seguro(p.negrita, negrita);
      const tt = seguro(p.texto, normal);
      pagina.drawText(tn, { x, y: yLey, size: tamLeyenda, font: negrita, color: NEGRO });
      x += negrita.widthOfTextAtSize(tn, tamLeyenda);
      pagina.drawText(tt, { x, y: yLey, size: tamLeyenda, font: normal, color: NEGRO });
      x += normal.widthOfTextAtSize(tt, tamLeyenda) + 16;
    }
    yLey -= 11;
  }
  const pie = `Archivo preparado el ${opciones.generado}.`;
  pagina.drawText(seguro(pie, normal), {
    x: ancho - MARGEN - normal.widthOfTextAtSize(pie, 6.5),
    y: MARGEN - 8,
    size: 6.5,
    font: normal,
    color: GRIS_CLARO,
  });

  return doc.save();
}
