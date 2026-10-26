import { describe, expect, it } from "vitest";
import {
  construirHorario,
  duracionHorario,
  juntarTramos,
  restarTramos,
  tramoCorto,
  tramosLargos,
  type EntradaHorario,
} from "./horario-agentes";
import { horarioHtml } from "./horario-html";
import type { DiaMotor } from "./motor";

/** Semana del lunes 5 al domingo 11 de octubre de 2026 y el jueves 1 antes (otra semana). */
function dia(fecha: string, diaSemana: number, extra: Partial<DiaMotor> = {}): DiaMotor {
  return {
    fecha,
    diaSemana,
    lunes: "2026-10-05",
    rotacion: "A",
    laborable: diaSemana < 5,
    festivos: [],
    diaEquivalente: diaSemana,
    ...extra,
  };
}

const DIAS: DiaMotor[] = [
  dia("2026-10-01", 3, { lunes: "2026-09-28" }),
  dia("2026-10-05", 0),
  dia("2026-10-06", 1),
  dia("2026-10-07", 2),
  dia("2026-10-08", 3, { laborable: false, festivos: ["Plantilla", "GrupoHuertas"] }),
  dia("2026-10-09", 4, { laborable: false, cierreEmpresa: true }),
  dia("2026-10-10", 5),
];

function entrada(cambios: Partial<EntradaHorario> = {}): EntradaHorario {
  return {
    mes: "2026-10",
    version: { numero: 2, publicadaAt: "15/10/2026 10:30" },
    dias: DIAS,
    calendarioPlantilla: "Plantilla",
    agentes: [
      { numero: "1008", nombre: "Zoe <Ruiz>", codigo: "GH_1008" },
      { numero: "0851", nombre: "Ana Pérez", codigo: "GH_0851" },
      { numero: "0999", nombre: null },
    ],
    bloques: [
      // Lunes: GH 9-12 + UGR 12-14 + GH 16-19 → «9–14» y «16–19», sin cliente
      { agenteNumero: "0851", fecha: "2026-10-05", inicioMin: 540, finMin: 720 },
      { agenteNumero: "0851", fecha: "2026-10-05", inicioMin: 720, finMin: 840 },
      { agenteNumero: "0851", fecha: "2026-10-05", inicioMin: 960, finMin: 1140 },
      // Martes: tiene bloques pero la VAC se apuntó después de publicar
      { agenteNumero: "0851", fecha: "2026-10-06", inicioMin: 540, finMin: 1020 },
      // Miércoles: médico de 9 a 11 apuntado después → trabaja 11-15
      { agenteNumero: "0851", fecha: "2026-10-07", inicioMin: 540, finMin: 900 },
      // Festivo trabajado: sale con sus horas
      { agenteNumero: "1008", fecha: "2026-10-08", inicioMin: 570, finMin: 870 },
    ],
    ausencias: {
      "0851": [
        { fecha: "2026-10-06", inicioMin: 0, finMin: 1440, tipo: "VAC" },
        { fecha: "2026-10-07", inicioMin: 540, finMin: 660, tipo: "AUS" },
      ],
    },
    tipos: {
      VAC: { nombre: "Vacaciones", color: "#FF00FF" },
      AUS: { nombre: "Ausencia", color: "#BFBFBF" },
      RTO: { nombre: "Retribución de tiempo por objetivos", color: "#FFC000" },
    },
    ...cambios,
  };
}

describe("tramos de la copia para las agentes", () => {
  it("junta los que se tocan o se pisan y descarta los vacíos", () => {
    expect(
      juntarTramos([
        { inicioMin: 720, finMin: 840 },
        { inicioMin: 540, finMin: 720 },
        { inicioMin: 800, finMin: 900 },
        { inicioMin: 960, finMin: 960 },
        { inicioMin: 1000, finMin: 1100 },
      ]),
    ).toEqual([
      { inicioMin: 540, finMin: 900 },
      { inicioMin: 1000, finMin: 1100 },
    ]);
  });

  it("resta las ausencias: por delante, por detrás, en medio y entera", () => {
    const t = [{ inicioMin: 540, finMin: 1140 }];
    expect(restarTramos(t, [{ inicioMin: 0, finMin: 600 }])).toEqual([{ inicioMin: 600, finMin: 1140 }]);
    expect(restarTramos(t, [{ inicioMin: 1080, finMin: 1440 }])).toEqual([{ inicioMin: 540, finMin: 1080 }]);
    expect(restarTramos(t, [{ inicioMin: 840, finMin: 960 }])).toEqual([
      { inicioMin: 540, finMin: 840 },
      { inicioMin: 960, finMin: 1140 },
    ]);
    expect(restarTramos(t, [{ inicioMin: 0, finMin: 1440 }])).toEqual([]);
  });

  it("textos: raya entre horas, minutos solo si hacen falta", () => {
    expect(tramoCorto({ inicioMin: 540, finMin: 840 })).toBe("9–14");
    expect(tramoCorto({ inicioMin: 570, finMin: 1230 })).toBe("9:30–20:30");
    expect(tramosLargos([{ inicioMin: 540, finMin: 840 }])).toBe("de 9:00 a 14:00");
    expect(
      tramosLargos([
        { inicioMin: 480, finMin: 600 },
        { inicioMin: 660, finMin: 840 },
        { inicioMin: 960, finMin: 1140 },
      ]),
    ).toBe("de 8:00 a 10:00, de 11:00 a 14:00 y de 16:00 a 19:00");
    expect(duracionHorario(480)).toBe("8 h");
    expect(duracionHorario(330)).toBe("5 h 30 min");
    expect(duracionHorario(45)).toBe("45 min");
  });
});

describe("construirHorario", () => {
  const h = construirHorario(entrada());
  const fila = (n: string) => h.filas.find((f) => f.numero === n)!;
  const deDia = (n: string, fecha: string) => fila(n).dias[h.columnas.findIndex((c) => c.fecha === fecha)];

  it("ordena de menor a mayor por código de agente; sin código ni nombre, el número", () => {
    expect(h.filas.map((f) => [f.codigo, f.nombre])).toEqual([
      ["GH_0851", "Ana Pérez"],
      ["0999", "0999"],
      ["GH_1008", "Zoe <Ruiz>"],
    ]);
    expect(h.mesTexto).toBe("octubre de 2026");
  });

  it("junta los bloques de clientes distintos (no sale el cliente)", () => {
    const d = deDia("0851", "2026-10-05");
    expect(d.estado).toBe("trabaja");
    expect(d.tramos.map(tramoCorto)).toEqual(["9–14", "16–19"]);
    expect(d.minutos).toBe(300 + 180);
    // Ni los días ni las horas llevan cliente (el código de agente «GH_0851» sí sale: lo pidió supervisión)
    expect(JSON.stringify({ ...h, filas: h.filas.map((f) => f.dias) })).not.toMatch(/GH|UGR|cliente/i);
  });

  it("descuenta las ausencias apuntadas después de publicar", () => {
    expect(deDia("0851", "2026-10-06")).toMatchObject({ estado: "ausencia", ausencia: "VAC", tramos: [] });
    expect(deDia("0851", "2026-10-07").tramos.map(tramoCorto)).toEqual(["11–15"]);
  });

  it("festivo o cierre de la plantilla sin trabajo = Festivo; trabajado, sus horas; el resto, Libre", () => {
    expect(h.columnas.map((c) => c.festivo)).toEqual([false, false, false, false, true, true, false]);
    expect(deDia("0851", "2026-10-08").estado).toBe("festivo");
    expect(deDia("0851", "2026-10-09").estado).toBe("festivo");
    expect(deDia("1008", "2026-10-08").tramos.map(tramoCorto)).toEqual(["9:30–14:30"]);
    expect(deDia("0851", "2026-10-10").estado).toBe("libre");
    expect(deDia("0999", "2026-10-05").estado).toBe("libre");
    expect(h.hayFestivos).toBe(true);
  });

  it("columnas: fin de semana y raya al empezar cada semana (no en el día 1)", () => {
    expect(h.columnas.map((c) => c.finDeSemana)).toEqual([false, false, false, false, false, false, true]);
    expect(h.columnas.map((c) => c.empiezaSemana)).toEqual([false, true, false, false, false, false, false]);
  });

  it("la leyenda solo lleva los tipos que salen en la copia", () => {
    // La AUS de unas horas no ocupa el día entero: no sale como ausencia
    expect(h.tipos).toEqual([{ codigo: "VAC", nombre: "Vacaciones", color: "#FF00FF" }]);
  });
});

describe("horarioHtml", () => {
  const h = construirHorario(entrada());
  const html = horarioHtml(h, { generado: "23/10/2026 10:15" });

  it("es un documento completo, sin recursos externos", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("Horario de octubre de 2026");
    expect(html).toContain("Plan publicado el 15/10/2026 (versión 2)");
    expect(html).not.toMatch(/(src|href)="https?:/);
  });

  it("escapa los nombres y no deja cerrar el <script> de datos", () => {
    expect(html).toContain("Zoe &lt;Ruiz&gt;");
    // El selector y la tabla del equipo llevan el código de agente delante
    expect(html).toContain('<option value="0851">GH_0851 · Ana Pérez</option>');
    expect(html).toContain('<option value="0999">0999</option>');
    expect(html).toContain('<th scope="row">GH_1008 · Zoe &lt;Ruiz&gt;</th>');
    expect(html).not.toContain("Zoe <Ruiz>");
    const datos = html.slice(html.indexOf('id="datos">'), html.indexOf("</script>", html.indexOf('id="datos">')));
    expect(datos).toContain("\\u003cRuiz>");
  });

  it("enseña cada día en largo y la tabla en corto, sin cliente", () => {
    expect(html).toContain("de 9:00 a 14:00 y de 16:00 a 19:00");
    expect(html).toContain("9–14<br>16–19");
    expect(html).toContain("<b>VAC</b> = Vacaciones");
    expect(html).toContain("Del jueves 1 al jueves 1");
    expect(html).toContain("Del lunes 5 al sábado 10");
    expect(html).not.toMatch(/\b(GH|UGR)\b/);
  });

  it("los datos del calendario (.ics) solo llevan los días con trabajo", () => {
    const json = html.slice(html.indexOf('id="datos">') + 'id="datos">'.length, html.indexOf("</script>", html.indexOf('id="datos">')));
    const datos = JSON.parse(json) as { agentes: Record<string, { dias: { f: string; t: number[][] }[] }> };
    expect(datos.agentes["0851"].dias.map((d) => d.f)).toEqual(["2026-10-05", "2026-10-07"]);
    expect(datos.agentes["0851"].dias[0].t).toEqual([
      [540, 840],
      [960, 1140],
    ]);
    expect(datos.agentes["0999"].dias).toEqual([]);
  });
});
