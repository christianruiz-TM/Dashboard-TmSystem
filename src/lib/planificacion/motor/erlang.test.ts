import { describe, expect, it } from "vitest";
import { agentesErlang, minimoFranja, nivelServicio, probabilidadEspera } from "./erlang";

// Casos de referencia calculados con erlang_c_n() de modelo.py (el
// prototipo, con factoriales), 80 % en 20 s salvo que se diga otra cosa.
describe("Erlang C", () => {
  it("coincide con el prototipo en casos conocidos", () => {
    expect(agentesErlang(100, 180, 80, 20)).toBe(8);
    expect(agentesErlang(200, 180, 80, 20)).toBe(14);
    expect(agentesErlang(360, 240, 90, 15)).toBe(31);
    expect(agentesErlang(5, 300, 80, 20)).toBe(2);
    expect(agentesErlang(0.5, 280, 80, 20)).toBe(1);
  });

  it("no desborda con cargas grandes (el prototipo usaba factoriales)", () => {
    expect(agentesErlang(1000, 300, 80, 20)).toBe(91);
    expect(Number.isFinite(probabilidadEspera(400, 380))).toBe(true);
  });

  it("sin llamadas no pide a nadie", () => {
    expect(agentesErlang(0, 280, 80, 20)).toBe(0);
    expect(minimoFranja(0, 280, 80, 20, 1)).toBe(0);
  });

  it("con n ≤ A la cola es inestable: nivel de servicio 0", () => {
    expect(probabilidadEspera(2, 2)).toBe(1);
    expect(nivelServicio(2, 2, 280, 20)).toBe(0);
  });

  // Hoja «Demanda», tabla A, de Planificacion_Octubre_2026.xlsx: entrantes GH
  // por hora (media jun-sep 2026), AHT 280,3 s y +1 de margen.
  it("mínimo de GH con las entrantes reales: de 3 a 6, y 6 el lunes de 10 a 13 h", () => {
    const aht = 280.3;
    const franjas = ["9", "10", "11", "12", "13", "16", "17", "18", "19"];
    const lunes = [25.2, 32.9, 30.6, 28.5, 22.3, 15.8, 22.3, 21.2, 14.6];
    const miercoles = [17.6, 21.3, 25.5, 26.8, 19.4, 12.3, 20.4, 17.4, 11.4];
    const viernes = [16.4, 19.8, 22.8, 21.9, 15.4, 10.1, 14.8, 15.5, 7.8];
    const minimos = (fila: number[]) => fila.map((l) => minimoFranja(l, aht, 80, 20, 1));
    expect(minimos(lunes)).toEqual([5, 6, 6, 6, 5, 4, 5, 5, 4]);
    expect(minimos(miercoles)).toEqual([4, 5, 5, 5, 5, 4, 5, 4, 4]);
    expect(minimos(viernes)).toEqual([4, 5, 5, 5, 4, 4, 4, 4, 3]);
    const todos = [...minimos(lunes), ...minimos(miercoles), ...minimos(viernes)];
    expect(Math.max(...todos)).toBe(6);
    expect(Math.min(...todos)).toBe(3); // viernes de 19 a 20 h
    const seis = minimos(lunes).flatMap((m, i) => (m === 6 ? [franjas[i]] : []));
    expect(seis).toEqual(["10", "11", "12"]);
  });
});
