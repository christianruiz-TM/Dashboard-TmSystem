import type { DibujoMiServicio, ItemComposicion, PanelTira } from "./dibujo";
import type { MotorMiServicio } from "./motor";
import type { CampaniaCalculada, DatosMiServicio, PanelMiServicio } from "./tipos";

/** Una tarjeta de cifra: lo que sale en la pantalla y en el informe. */
export interface TarjetaMiServicio {
  /** Clave del glosario (GLOSARIO_CLIENTE). */
  clave: string;
  grupo: "principal" | "ratio";
  titulo: string;
  valor: string;
  sub: string | null;
  serie: { valores: number[]; color: string } | null;
  anillo: { pct: number | null; color: string } | null;
}

export type TextosMiServicio = Record<string, { termino: string; definicion: string }>;

/**
 * VISTA de «Mi servicio» (06/11/2026): qué tarjetas, gráficas y tablas
 * salen y con qué textos, a partir del panel del motor. La pantalla usa las
 * piezas (tarjetas, paneles de la tira, barras) y las pinta con React; el
 * informe usa también el HTML de aquí y `iniciar`, que monta el filtro de
 * campañas. El informe lleva esta función dentro (`toString()`), así que es
 * AUTOCONTENIDA, como el motor y el dibujo.
 */
export function vistaMiServicio(motor: MotorMiServicio, dibujo: DibujoMiServicio) {
  const fmt = motor.fmt;
  const esc = dibujo.esc;
  /** Resultados que se ven en la gráfica; el resto se junta en «Otros». */
  const MAX_RESULTADOS = 10;

  function r2(v: number | null): number | null {
    return v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  }
  function cociente(a: number, b: number, factor?: number): number | null {
    return b > 0 ? (a / b) * (factor == null ? 1 : factor) : null;
  }

  function tituloHoras(panel: PanelMiServicio): string {
    return panel.kpis.tipoHoras === "logadas" ? "Horas logadas" : "Horas con ficha abierta";
  }

  /** Paneles de la tira diaria (cada uno con su escala). */
  function paneles(panel: PanelMiServicio): PanelTira[] {
    const k = panel.kpis;
    // El total de cada panel, el de su tarjeta: la suma de los días ya
    // redondeados no da el total de las horas
    return [
      { clave: "ll", titulo: "Llamadas", color: "--ms-ll", formato: "entero", total: k.llamadas },
      { clave: "fi", titulo: "Finalizados", color: "--ms-fi", formato: "entero", total: k.finalizados },
      { clave: "ex", titulo: "Éxitos", color: "--ms-fe", formato: "entero", total: k.exitos },
      { clave: "ho", titulo: tituloHoras(panel), color: "--ms-ho", formato: "horas", total: k.horas ?? 0 },
    ];
  }

  function tarjetas(datos: DatosMiServicio, panel: PanelMiServicio): TarjetaMiServicio[] {
    const k = panel.kpis;
    const serie = (clave: "ll" | "fi" | "ex" | "ho" | "nv", color: string) => ({
      valores: panel.serie.puntos.map((p) => p[clave]),
      color,
    });
    const logadas = k.tipoHoras === "logadas";
    return [
      {
        clave: "llamadas",
        grupo: "principal",
        titulo: "Llamadas",
        valor: fmt.entero(k.llamadas),
        sub: fmt.entero(k.gestionadas) + " gestionadas",
        serie: serie("ll", "--ms-ll"),
        anillo: null,
      },
      {
        clave: "finalizados",
        grupo: "principal",
        titulo: "Finalizados",
        valor: fmt.entero(k.finalizados),
        sub: fmt.entero(k.finalizadosExito) + " con éxito",
        serie: serie("fi", "--ms-fi"),
        anillo: null,
      },
      {
        clave: "noValidos",
        grupo: "principal",
        titulo: "No válidos",
        valor: k.noValidos == null ? "Sin configurar" : fmt.entero(k.noValidos),
        sub: k.noValidos == null ? null : fmt.pct(k.pctNoValidos) + " de los finalizados",
        serie: datos.configurado ? serie("nv", "--ms-nv") : null,
        anillo: null,
      },
      {
        clave: "exitos",
        grupo: "principal",
        titulo: "Éxitos",
        valor: fmt.entero(k.exitos),
        sub: fmt.pct(k.pctExitoLlamada) + " de las llamadas gestionadas",
        serie: serie("ex", "--ms-fe"),
        anillo: null,
      },
      {
        clave: logadas ? "horasLogadas" : "horasFicha",
        grupo: "principal",
        titulo: tituloHoras(panel),
        valor: fmt.horas(k.horas),
        sub: logadas ? "del equipo de tu servicio" : "en las campañas elegidas",
        serie: serie("ho", "--ms-ho"),
        anillo: null,
      },
      {
        clave: "llamadasHora",
        grupo: "ratio",
        titulo: "Llamadas por hora",
        valor: fmt.dec2(k.llamadasHora),
        sub: logadas ? "gestionadas por hora logada" : "gestionadas por hora con ficha",
        serie: null,
        anillo: null,
      },
      {
        clave: "exitosHora",
        grupo: "ratio",
        titulo: "Éxitos por hora",
        valor: fmt.dec2(k.exitosHora),
        sub: logadas ? "por hora logada" : "por hora con ficha",
        serie: null,
        anillo: null,
      },
      {
        clave: "finalizadosPorExito",
        grupo: "ratio",
        titulo: "Finalizados por éxito",
        valor: fmt.dec2(k.finalizadosPorExito),
        sub: "contactos cerrados para un éxito",
        serie: null,
        anillo: null,
      },
      {
        clave: "bruto",
        grupo: "ratio",
        titulo: "Aprovechamiento",
        valor: fmt.pct(k.brutoPct),
        sub: fmt.entero(k.finalizadosExito) + " con éxito de " + fmt.entero(k.finalizados),
        serie: null,
        anillo: { pct: k.brutoPct, color: "--ms-fe" },
      },
      {
        clave: "neto",
        grupo: "ratio",
        titulo: "Aprovechamiento neto",
        valor: k.netoPct == null ? "Sin configurar" : fmt.pct(k.netoPct),
        sub: k.netoPct == null ? null : "sin contar los no válidos",
        serie: null,
        anillo: k.netoPct == null ? null : { pct: k.netoPct, color: "--ms-fe" },
      },
    ];
  }

  function leyendaComposicion(datos: DatosMiServicio): { color: string; texto: string }[] {
    return [{ color: "--ms-fe", texto: "Finalizados con éxito" }]
      .concat(datos.configurado ? [{ color: "--ms-nv", texto: "No válidos" }] : [])
      .concat([{ color: "--ms-fi", texto: "Resto de finalizados" }]);
  }

  /** La barra de «cómo acabaron los finalizados» y sus tres cifras. */
  function reparto(datos: DatosMiServicio, panel: PanelMiServicio) {
    const k = panel.kpis;
    const r = panel.reparto;
    const filas = [{ color: "--ms-fe", texto: "Con éxito", n: r.exito }]
      .concat(r.noValido == null ? [] : [{ color: "--ms-nv", texto: "No válidos", n: r.noValido }])
      .concat([{ color: "--ms-fi", texto: "Resto", n: r.resto }])
      .map((x) => ({ ...x, pct: r2(cociente(x.n, k.finalizados, 100)) }));
    const item: ItemComposicion = {
      nombre: "Finalizados",
      total: k.finalizados,
      fe: r.exito,
      nv: r.noValido,
      detalle: fmt.entero(k.finalizados),
      globo: ["Finalizados: " + fmt.entero(k.finalizados)].concat(filas.map((x) => x.texto + ": " + fmt.entero(x.n) + " (" + fmt.pct(x.pct) + ")")),
    };
    return { item, filas };
  }

  function itemsResultados(panel: PanelMiServicio): ItemComposicion[] {
    const lista = panel.resultados.slice(0, MAX_RESULTADOS);
    const resto = panel.resultados.slice(MAX_RESULTADOS);
    const items: ItemComposicion[] = lista.map((r) => ({
      nombre: r.nombre,
      total: r.n,
      fe: r.fe,
      nv: r.nv,
      detalle: fmt.entero(r.n) + " · " + fmt.pct(r.pct),
      globo: [r.nombre, fmt.entero(r.n) + " finalizados (" + fmt.pct(r.pct) + ")"].concat(
        r.hijos.slice(0, 8).map((h) => "· " + h.nombre + ": " + fmt.entero(h.n)),
        r.hijos.length > 8 ? ["· y " + (r.hijos.length - 8) + " más"] : [],
      ),
    }));
    if (resto.length > 0) {
      const n = resto.reduce((s, r) => s + r.n, 0);
      const total = panel.resultados.reduce((s, r) => s + r.n, 0);
      items.push({
        nombre: "Otros (" + resto.length + ")",
        total: n,
        fe: resto.reduce((s, r) => s + r.fe, 0),
        nv: resto.reduce((s, r) => s + r.nv, 0),
        detalle: fmt.entero(n) + " · " + fmt.pct(r2(cociente(n, total, 100))),
        globo: ["Otros resultados"].concat(resto.slice(0, 10).map((r) => "· " + r.nombre + ": " + fmt.entero(r.n))),
      });
    }
    return items;
  }

  function itemsMotivos(panel: PanelMiServicio): ItemComposicion[] {
    return panel.motivos.slice(0, MAX_RESULTADOS).map((m) => ({
      nombre: m.nombre,
      total: m.n,
      fe: 0,
      nv: m.n,
      detalle: fmt.entero(m.n) + " · " + fmt.pct(m.pct),
      globo: [m.nombre, fmt.entero(m.n) + " no válidos (" + fmt.pct(m.pct) + " de los no válidos)"],
    }));
  }

  function globoCampania(datos: DatosMiServicio, c: CampaniaCalculada): string[] {
    return [
      c.nombre,
      "Llamadas: " + fmt.entero(c.ll) + " (" + fmt.entero(c.ge) + " gestionadas)",
      "Finalizados: " + fmt.entero(c.fi),
    ]
      .concat(datos.configurado ? ["No válidos: " + fmt.entero(c.nv) + " (" + fmt.pct(c.pctNv) + ")"] : [])
      .concat([
        "Éxitos: " + fmt.entero(c.ex),
        "Finalizados con éxito: " + fmt.entero(c.fe),
        "Aprovechamiento: " + fmt.pct(c.brutoPct),
      ])
      .concat(datos.configurado ? ["Aprovechamiento neto: " + fmt.pct(c.netoPct)] : [])
      .concat(["Horas con ficha abierta: " + fmt.horas(c.horasFicha)]);
  }

  function itemsCampanias(datos: DatosMiServicio, panel: PanelMiServicio): ItemComposicion[] {
    return panel.campanias.map((c) => ({
      nombre: c.nombre,
      total: c.fi,
      fe: c.fe,
      nv: c.nv,
      detalle: fmt.entero(c.fi) + " · " + fmt.pct(c.brutoPct),
      globo: globoCampania(datos, c),
    }));
  }

  /** Fila de total de la tabla de campañas (horas = suma de la ficha abierta). */
  function totalCampanias(datos: DatosMiServicio, panel: PanelMiServicio): CampaniaCalculada {
    const s = { ll: 0, ge: 0, fi: 0, nv: 0, ex: 0, fe: 0, gu: 0 };
    for (const c of panel.campanias) {
      s.ll += c.ll;
      s.ge += c.ge;
      s.fi += c.fi;
      s.nv += c.nv || 0;
      s.ex += c.ex;
      s.fe += c.fe;
      s.gu += c.horasFicha;
    }
    const conf = datos.configurado;
    return {
      nombre: "Total",
      tipo: null,
      ll: s.ll,
      ge: s.ge,
      fi: s.fi,
      nv: conf ? s.nv : null,
      pctNv: conf ? r2(cociente(s.nv, s.fi, 100)) : null,
      ex: s.ex,
      fe: s.fe,
      horasFicha: r2(s.gu) || 0,
      llamadasHora: r2(cociente(s.ge, s.gu)),
      exitosHora: r2(cociente(s.ex, s.gu)),
      brutoPct: r2(cociente(s.fe, s.fi, 100)),
      netoPct: conf ? r2(cociente(s.fe, s.fi - s.nv, 100)) : null,
    };
  }

  /** Columnas de la tabla de campañas (las de no válidos, solo si están configurados). */
  function columnasCampanias(datos: DatosMiServicio) {
    const conf = datos.configurado;
    const cols: { titulo: string; valor: (c: CampaniaCalculada) => string; orden: (c: CampaniaCalculada) => number | null }[] = [
      { titulo: "Llamadas", valor: (c) => fmt.entero(c.ll), orden: (c) => c.ll },
      { titulo: "Gestionadas", valor: (c) => fmt.entero(c.ge), orden: (c) => c.ge },
      { titulo: "Finalizados", valor: (c) => fmt.entero(c.fi), orden: (c) => c.fi },
    ];
    if (conf) {
      cols.push({ titulo: "No válidos", valor: (c) => fmt.entero(c.nv), orden: (c) => c.nv });
      cols.push({ titulo: "% no válidos", valor: (c) => fmt.pct(c.pctNv), orden: (c) => c.pctNv });
    }
    cols.push(
      { titulo: "Éxitos", valor: (c) => fmt.entero(c.ex), orden: (c) => c.ex },
      { titulo: "Fin. con éxito", valor: (c) => fmt.entero(c.fe), orden: (c) => c.fe },
      { titulo: "Aprovechamiento", valor: (c) => fmt.pct(c.brutoPct), orden: (c) => c.brutoPct },
    );
    if (conf) cols.push({ titulo: "Neto", valor: (c) => fmt.pct(c.netoPct), orden: (c) => c.netoPct });
    cols.push(
      { titulo: "Horas con ficha", valor: (c) => fmt.horas(c.horasFicha), orden: (c) => c.horasFicha },
      { titulo: "Llamadas / h", valor: (c) => fmt.dec2(c.llamadasHora), orden: (c) => c.llamadasHora },
      { titulo: "Éxitos / h", valor: (c) => fmt.dec2(c.exitosHora), orden: (c) => c.exitosHora },
    );
    return cols;
  }

  // ------------------------------------------------------------
  // HTML del informe
  // ------------------------------------------------------------

  function tarjetasHtml(datos: DatosMiServicio, panel: PanelMiServicio, textos: TextosMiServicio): string {
    const una = (t: TarjetaMiServicio) => {
      const g = textos[t.clave];
      return (
        '<div class="t t-' + t.grupo + '"><div class="t-cab"><span>' + esc(t.titulo) + "</span>" +
        (g ? '<span class="t-ayuda" data-tip="' + esc(g.termino + "\n" + g.definicion) + '" aria-label="' + esc(g.definicion) + '">?</span>' : "") +
        '</div><div class="t-cuerpo"><div><div class="t-valor">' + esc(t.valor) + "</div>" +
        (t.sub ? '<div class="t-sub">' + esc(t.sub) + "</div>" : "") + "</div>" +
        (t.anillo ? '<div class="t-anillo">' + dibujo.anillo(t.anillo.pct, t.anillo.color, t.titulo) + "</div>" : "") +
        "</div>" + (t.serie ? '<div class="t-mini">' + dibujo.minigrafica(t.serie.valores, t.serie.color) + "</div>" : "") + "</div>"
      );
    };
    const ts = tarjetas(datos, panel);
    return (
      '<div class="t-fila t-fila-principal">' + ts.filter((t) => t.grupo === "principal").map(una).join("") + "</div>" +
      '<div class="t-fila t-fila-ratio">' + ts.filter((t) => t.grupo === "ratio").map(una).join("") + "</div>"
    );
  }

  function tablaCampaniasHtml(datos: DatosMiServicio, panel: PanelMiServicio): string {
    const cols = columnasCampanias(datos);
    const conTipo = datos.opcionesTipo.length > 0;
    const fila = (c: CampaniaCalculada, total: boolean) =>
      "<tr" + (total ? ' class="ms-total"' : "") + "><td>" + esc(c.nombre) + "</td>" +
      (conTipo ? "<td>" + esc(total ? "" : (c.tipo || "—")) + "</td>" : "") +
      cols.map((col) => '<td class="ms-num">' + esc(col.valor(c)) + "</td>").join("") + "</tr>";
    return (
      '<table class="ms-tabla"><thead><tr><th>Campaña</th>' + (conTipo ? "<th>Tipo</th>" : "") +
      cols.map((col) => '<th class="ms-num">' + esc(col.titulo) + "</th>").join("") + "</tr></thead><tbody>" +
      panel.campanias.map((c) => fila(c, false)).join("") +
      (panel.campanias.length > 1 ? fila(totalCampanias(datos, panel), true) : "") +
      "</tbody></table>"
    );
  }

  function repartoHtml(datos: DatosMiServicio, panel: PanelMiServicio): string {
    const r = reparto(datos, panel);
    return (
      dibujo.composicion([r.item], "Cómo acabaron los finalizados", 520) +
      '<ul class="reparto">' +
      r.filas
        .map((x) => '<li><i style="background:var(' + x.color + ')"></i><span>' + esc(x.texto) + '</span><b>' + esc(fmt.entero(x.n)) + "</b><em>" + esc(fmt.pct(x.pct)) + "</em></li>")
        .join("") +
      "</ul>"
    );
  }

  /** Contenido de cada hueco del informe (id «ms-<clave>»). */
  function secciones(datos: DatosMiServicio, panel: PanelMiServicio, textos: TextosMiServicio): Record<string, string> {
    const nombres = datos.campanias.map((c) => c.nombre);
    const incluidas =
      panel.seleccion.length === nombres.length
        ? "Todas las campañas (" + nombres.length + ")"
        : panel.seleccion.length === 0
          ? "Ninguna campaña"
          : panel.seleccion.join(", ");
    if (panel.seleccion.length === 0) {
      const vacio = '<p class="vacio">Elige al menos una campaña para ver sus cifras.</p>';
      return { incluidas: esc(incluidas), kpis: vacio, tira: "", tablaDias: "", embudo: "", reparto: "", resultados: "", motivos: "", campanias: "", tablaCampanias: "" };
    }
    const pan = paneles(panel);
    const comp = dibujo.leyenda(leyendaComposicion(datos));
    const motivos = itemsMotivos(panel);
    const resultados = itemsResultados(panel);
    return {
      incluidas: esc(incluidas),
      kpis: tarjetasHtml(datos, panel, textos),
      tira: dibujo.tira(panel.serie.puntos, pan),
      tablaDias: dibujo.tablaDias(panel.serie.puntos, pan),
      embudo: dibujo.embudo(panel.embudo, 520),
      reparto: repartoHtml(datos, panel),
      resultados: resultados.length > 0 ? comp + dibujo.composicion(resultados, "Finalizados por resultado") : '<p class="vacio">Sin finalizados en estas campañas.</p>',
      motivos: motivos.length > 0 ? dibujo.composicion(motivos, "Motivos de no válido") : '<p class="vacio">Sin no válidos en estas campañas.</p>',
      campanias: comp + dibujo.composicion(itemsCampanias(datos, panel), "Finalizados por campaña"),
      tablaCampanias: tablaCampaniasHtml(datos, panel),
    };
  }

  function pintar(doc: Document, datos: DatosMiServicio, panel: PanelMiServicio, textos: TextosMiServicio): void {
    const s = secciones(datos, panel, textos);
    for (const clave of Object.keys(s)) {
      const el = doc.getElementById("ms-" + clave);
      if (el) el.innerHTML = s[clave];
    }
  }

  /** Casillas de campañas y botones de tipo del informe (sin JavaScript se ven todas). */
  function controlesHtml(datos: DatosMiServicio): string {
    const botones = datos.opcionesTipo.length > 0 ? datos.opcionesTipo : [{ etiqueta: "Todas", campanias: datos.campanias.map((c) => c.nombre) }];
    return (
      '<div class="ctl-botones">' +
      botones.map((b, i) => '<button type="button" data-opcion="' + i + '">' + esc(b.etiqueta) + "</button>").join("") +
      '<button type="button" data-opcion="ninguna">Ninguna</button></div>' +
      '<div class="ctl-casillas">' +
      datos.campanias
        .map((c) => '<label><input type="checkbox" value="' + esc(c.nombre) + '" checked> ' + esc(c.nombre) + (c.tipo ? ' <small>' + esc(c.tipo) + "</small>" : "") + "</label>")
        .join("") +
      "</div>"
    );
  }

  /** Monta el filtro de campañas y el globo del informe (en el navegador). */
  function iniciar(doc: Document, datos: DatosMiServicio, textos: TextosMiServicio): void {
    const caja = doc.getElementById("ms-controles");
    const casillas = caja ? Array.prototype.slice.call(caja.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[] : [];
    const botones = datos.opcionesTipo.length > 0 ? datos.opcionesTipo : [{ etiqueta: "Todas", campanias: datos.campanias.map((c) => c.nombre) }];
    function aplicar() {
      const sel = casillas.filter((x) => x.checked).map((x) => x.value);
      pintar(doc, datos, motor.calcular(datos, sel), textos);
    }
    if (caja) {
      caja.addEventListener("change", aplicar);
      caja.addEventListener("click", (e) => {
        const b = (e.target as Element).closest ? (e.target as Element).closest("button[data-opcion]") : null;
        if (!b) return;
        const o = b.getAttribute("data-opcion");
        const marcar = o === "ninguna" ? [] : botones[Number(o)].campanias;
        casillas.forEach((x) => (x.checked = marcar.indexOf(x.value) >= 0));
        aplicar();
      });
    }
    const imprimir = doc.getElementById("ms-imprimir");
    if (imprimir) imprimir.addEventListener("click", () => doc.defaultView && doc.defaultView.print());
    dibujo.instalarInteraccion(doc.body);
  }

  return {
    paneles,
    tarjetas,
    leyendaComposicion,
    reparto,
    itemsResultados,
    itemsMotivos,
    itemsCampanias,
    totalCampanias,
    columnasCampanias,
    secciones,
    controlesHtml,
    iniciar,
  };
}

export type VistaMiServicio = ReturnType<typeof vistaMiServicio>;
