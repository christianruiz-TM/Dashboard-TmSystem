import type {
  CampaniaCalculada,
  DatosMiServicio,
  EtapaEmbudo,
  NodoResultadoMiServicio,
  PanelMiServicio,
  PuntoMiServicio,
} from "./tipos";

/**
 * MOTOR de «Mi servicio» (06/11/2026): de los datos del servidor y una
 * selección de campañas saca las cifras, la evolución, el embudo, los
 * resultados y el detalle por campaña. Lo usa la pantalla (en el servidor)
 * y el informe descargado (en el navegador, para filtrar campañas sin
 * conexión): el informe lleva ESTA función dentro, con
 * `motorMiServicio.toString()`. Por eso es AUTOCONTENIDA: nada de imports
 * ni de variables de fuera, solo JavaScript que entienda un navegador. Los
 * tests comprueban que la copia de texto da lo mismo que la original.
 *
 * Definiciones (decididas con Christian el 06/11/2026):
 *  - Llamadas = todas (caja 2); éxitos = sesiones de éxito por el día de la
 *    llamada (caja 4); finalizados = cerrados por un agente (caja 3).
 *  - El embudo y el aprovechamiento usan los «finalizados con éxito»
 *    (contactos cerrados en éxito), para no tener dos cifras distintas con
 *    el mismo nombre.
 *  - Horas: las logadas de los usuarios del cliente (caja 1) con todas las
 *    campañas; con una parte de ellas, las de la ficha abierta en esas
 *    campañas (las logadas son de la persona, no de la campaña, regla 11).
 *  - Por hora = gestionadas o éxitos ÷ esas horas (como en las cajas).
 *  - Redondeo solo del valor final (2 decimales).
 */
export function motorMiServicio() {
  /** A partir de estos días, la evolución va por semanas (como Resultados). */
  const DIAS_SEMANAL = 62;
  const DIA_MS = 86400000;
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const SIN_VALOR = "(sin valor)";
  const DOS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  function r2(v: number | null): number | null {
    return v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  }
  function cociente(a: number, b: number, factor?: number): number | null {
    return b > 0 ? (a / b) * (factor == null ? 1 : factor) : null;
  }
  function dos(n: number): string {
    return n < 10 ? "0" + n : String(n);
  }

  const fmt = {
    entero(v: number | null | undefined): string {
      return v == null ? "—" : Math.round(v).toLocaleString("es-ES");
    },
    dec2(v: number | null | undefined): string {
      return v == null ? "—" : v.toLocaleString("es-ES", DOS);
    },
    pct(v: number | null | undefined): string {
      return v == null ? "—" : v.toLocaleString("es-ES", DOS) + " %";
    },
    horas(v: number | null | undefined): string {
      return v == null ? "—" : v.toLocaleString("es-ES", DOS) + " h";
    },
    fecha(iso: string): string {
      const p = iso.split("-");
      return p[2] + "/" + p[1] + "/" + p[0];
    },
  };

  // Fechas en UTC de principio a fin: un día es siempre 24 h (sin horario de verano)
  function aMs(iso: string): number {
    const p = iso.split("-").map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function deMs(ms: number): string {
    const d = new Date(ms);
    return d.getUTCFullYear() + "-" + dos(d.getUTCMonth() + 1) + "-" + dos(d.getUTCDate());
  }

  /** Periodos del rango: días o, pasados 62 días, semanas (lunes). */
  function periodos(desde: string, hasta: string) {
    const ini = aMs(desde);
    const fin = aMs(hasta);
    const semanal = Math.round((fin - ini) / DIA_MS) + 1 > DIAS_SEMANAL;
    const lista: { p: string; etiqueta: string; etiquetaLarga: string }[] = [];
    const de: Record<string, string> = {};
    for (let t = ini; t <= fin; t += DIA_MS) {
      const dia = new Date(t).getUTCDay();
      const inicio = semanal ? t - ((dia + 6) % 7) * DIA_MS : t;
      const p = deMs(inicio);
      de[deMs(t)] = p;
      if (lista.length === 0 || lista[lista.length - 1].p !== p) {
        const d = new Date(inicio);
        const corta = dos(d.getUTCDate()) + "/" + dos(d.getUTCMonth() + 1);
        lista.push({
          p,
          etiqueta: semanal ? "sem. " + corta : DIAS[d.getUTCDay()] + " " + corta,
          etiquetaLarga: semanal
            ? "Semana del " + corta + "/" + d.getUTCFullYear()
            : DIAS_LARGOS[d.getUTCDay()] + " " + corta + "/" + d.getUTCFullYear(),
        });
      }
    }
    return { granularidad: (semanal ? "semana" : "dia") as "dia" | "semana", lista, de };
  }

  function calcular(datos: DatosMiServicio, seleccion?: string[] | null): PanelMiServicio {
    const nombres = datos.campanias.map((c) => c.nombre);
    const sel = seleccion == null ? nombres : nombres.filter((n) => seleccion.indexOf(n) >= 0);
    const enSel: Record<string, boolean> = {};
    for (const n of sel) enSel[n] = true;
    const todas = sel.length === nombres.length;
    const conLogadas = todas && datos.horas != null;
    const conf = datos.configurado;

    const per = periodos(datos.desde, datos.hasta);
    const puntos: Record<string, PuntoMiServicio> = {};
    for (const x of per.lista) {
      puntos[x.p] = { p: x.p, etiqueta: x.etiqueta, etiquetaLarga: x.etiquetaLarga, ll: 0, fi: 0, ex: 0, ho: 0, fe: 0, nv: 0 };
    }
    type Suma = { ll: number; ge: number; ex: number; gu: number; fi: number; fe: number; nv: number };
    const vacia = (): Suma => ({ ll: 0, ge: 0, ex: 0, gu: 0, fi: 0, fe: 0, nv: 0 });
    const t = vacia();
    const porCampania: Record<string, Suma> = {};
    for (const f of datos.filas) {
      if (!enSel[f.c]) continue;
      const c = porCampania[f.c] || (porCampania[f.c] = vacia());
      for (const s of [t, c]) {
        s.ll += f.ll;
        s.ge += f.ge;
        s.ex += f.ex;
        s.gu += f.gu;
        s.fi += f.fi;
        s.fe += f.fe;
        s.nv += f.nv;
      }
      const pt = puntos[per.de[f.f]];
      if (pt) {
        pt.ll += f.ll;
        pt.fi += f.fi;
        pt.ex += f.ex;
        pt.fe += f.fe;
        pt.nv += f.nv;
        if (!conLogadas) pt.ho += f.gu;
      }
    }
    if (conLogadas && datos.horas) {
      for (const dia of Object.keys(datos.horas.dia)) {
        const pt = puntos[per.de[dia]];
        if (pt) pt.ho += datos.horas.dia[dia];
      }
    }
    const horas = conLogadas && datos.horas ? datos.horas.total : t.gu;
    const nv = conf ? t.nv : 0;

    // Embudo: llamadas → finalizados → válidos (si hay no válidos) → con éxito
    const embudo: EtapaEmbudo[] = [{ clave: "ll", etiqueta: "Llamadas", valor: t.ll, pctAnterior: null }];
    embudo.push({ clave: "fi", etiqueta: "Finalizados", valor: t.fi, pctAnterior: r2(cociente(t.fi, t.ll, 100)) });
    if (conf) embudo.push({ clave: "va", etiqueta: "Válidos", valor: t.fi - nv, pctAnterior: r2(cociente(t.fi - nv, t.fi, 100)) });
    const previa = embudo[embudo.length - 1].valor;
    embudo.push({ clave: "fe", etiqueta: "Finalizados con éxito", valor: t.fe, pctAnterior: r2(cociente(t.fe, previa, 100)) });

    // Resultados (primer nivel con el segundo dentro) y motivos de no válido
    const nodos: Record<string, { n: number; fe: number; nv: number; hijos: Record<string, number>; nulos: number }> = {};
    const motivos: Record<string, number> = {};
    let totalRes = 0;
    let totalNv = 0;
    for (const r of datos.resultados) {
      if (!enSel[r.c]) continue;
      totalRes += r.n;
      const nodo = nodos[r.r1] || (nodos[r.r1] = { n: 0, fe: 0, nv: 0, hijos: {}, nulos: 0 });
      nodo.n += r.n;
      nodo.fe += r.fe;
      nodo.nv += r.nv;
      if (r.r2 == null) nodo.nulos += r.n;
      else nodo.hijos[r.r2] = (nodo.hijos[r.r2] || 0) + r.n;
      if (conf && r.nv > 0) {
        const m = r.r2 == null ? r.r1 : r.r2;
        motivos[m] = (motivos[m] || 0) + r.nv;
        totalNv += r.nv;
      }
    }
    const porN = (a: { n: number; nombre: string }, b: { n: number; nombre: string }) =>
      b.n - a.n || a.nombre.localeCompare(b.nombre, "es");
    const resultados: NodoResultadoMiServicio[] = Object.keys(nodos)
      .map((nombre) => {
        const x = nodos[nombre];
        const hijos = Object.keys(x.hijos).map((h) => ({ nombre: h, n: x.hijos[h], pct: r2(cociente(x.hijos[h], totalRes, 100)) }));
        // Si unos tienen segundo nivel y otros no, el resto va a «(sin valor)»
        if (hijos.length > 0 && x.nulos > 0) hijos.push({ nombre: SIN_VALOR, n: x.nulos, pct: r2(cociente(x.nulos, totalRes, 100)) });
        hijos.sort(porN);
        return { nombre, n: x.n, pct: r2(cociente(x.n, totalRes, 100)), fe: x.fe, nv: x.nv, hijos };
      })
      .sort(porN);

    const campanias: CampaniaCalculada[] = datos.campanias
      .filter((c) => enSel[c.nombre])
      .map((c) => {
        const s = porCampania[c.nombre] || vacia();
        const nvc = conf ? s.nv : null;
        return {
          nombre: c.nombre,
          tipo: c.tipo,
          ll: s.ll,
          ge: s.ge,
          fi: s.fi,
          nv: nvc,
          pctNv: conf ? r2(cociente(s.nv, s.fi, 100)) : null,
          ex: s.ex,
          fe: s.fe,
          horasFicha: r2(s.gu) || 0,
          llamadasHora: r2(cociente(s.ge, s.gu)),
          exitosHora: r2(cociente(s.ex, s.gu)),
          brutoPct: r2(cociente(s.fe, s.fi, 100)),
          netoPct: conf ? r2(cociente(s.fe, s.fi - s.nv, 100)) : null,
        };
      });

    return {
      seleccion: sel,
      todas,
      kpis: {
        llamadas: t.ll,
        gestionadas: t.ge,
        finalizados: t.fi,
        noValidos: conf ? nv : null,
        pctNoValidos: conf ? r2(cociente(nv, t.fi, 100)) : null,
        exitos: t.ex,
        pctExitoLlamada: r2(cociente(t.ex, t.ge, 100)),
        finalizadosExito: t.fe,
        horas: r2(horas),
        tipoHoras: conLogadas ? "logadas" : "ficha",
        llamadasHora: r2(cociente(t.ge, horas)),
        exitosHora: r2(cociente(t.ex, horas)),
        finalizadosPorExito: r2(cociente(t.fi, t.fe)),
        brutoPct: r2(cociente(t.fe, t.fi, 100)),
        netoPct: conf ? r2(cociente(t.fe, t.fi - nv, 100)) : null,
      },
      serie: {
        granularidad: per.granularidad,
        puntos: per.lista.map((x) => {
          const pt = puntos[x.p];
          return { ...pt, ho: r2(pt.ho) || 0 };
        }),
      },
      embudo,
      reparto: { exito: t.fe, noValido: conf ? nv : null, resto: Math.max(0, t.fi - t.fe - nv) },
      resultados,
      motivos: Object.keys(motivos)
        .map((nombre) => ({ nombre, n: motivos[nombre], pct: r2(cociente(motivos[nombre], totalNv, 100)) }))
        .sort(porN),
      campanias,
    };
  }

  return { fmt, periodos, calcular };
}

export type MotorMiServicio = ReturnType<typeof motorMiServicio>;
export type FormatosMiServicio = MotorMiServicio["fmt"];
