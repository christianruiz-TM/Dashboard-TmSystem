import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { fechaParaExcel } from "@/lib/export-contactos";
import { FORMATO_FECHA_HORA, generarXlsx } from "./xlsx";

describe("generarXlsx (auditoría 11/11/2026, F4)", () => {
  it("los textos que parecen fórmulas siguen siendo texto y la fecha conserva la hora local", async () => {
    const valores = ['=HYPERLINK("http://x";"pulsa")', "+34600111222", "0034600111222", "@Morenilla", "-Miguel Angel"];
    const buffer = await generarXlsx(
      "Contactos",
      [
        ...valores.map((_, i) => ({ cabecera: `t${i}`, clave: `t${i}` })),
        { cabecera: "Fecha", clave: "fecha", formato: FORMATO_FECHA_HORA },
      ],
      [{ ...Object.fromEntries(valores.map((v, i) => [`t${i}`, v])), fecha: fechaParaExcel(new Date(2026, 9, 1, 9, 4, 36)) }],
    );
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const fila = libro.getWorksheet("Contactos")!.getRow(2);
    valores.forEach((v, i) => {
      expect(fila.getCell(i + 1).type).toBe(ExcelJS.ValueType.String);
      expect(fila.getCell(i + 1).value).toBe(v);
    });
    const fecha = fila.getCell(valores.length + 1);
    expect(fecha.numFmt).toBe(FORMATO_FECHA_HORA);
    expect((fecha.value as Date).toISOString()).toBe("2026-10-01T09:04:36.000Z");
  });
});
