import { PuntoGlosario } from "@/components/punto-glosario";
import { textoTramos } from "@/lib/escandallo";
import { NOMBRE_UNIDAD, type ResumenEscandallo } from "@/lib/facturacion-campania";

const eur = (v: number | null) =>
  v == null ? "sin precio" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
const num = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

/**
 * Escandallos de la factura (18/11/2026, Ávolo): por línea de tarifa y mes,
 * el volumen, el tramo aplicado y cuánto falta para el siguiente. Para que
 * Operaciones vea por dónde va el mes.
 */
export function ResumenEscandallos({ resumen }: { resumen: readonly ResumenEscandallo[] }) {
  if (resumen.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <p className="flex items-center font-medium">
        Precio por tramos (escandallo)
        <PuntoGlosario clave="escandallo" />
      </p>
      <ul className="space-y-1">
        {resumen.map((r) => (
          <li key={`${r.configId}|${r.mes}`}>
            <span className="font-medium">
              {r.servicio ?? "—"} · {NOMBRE_UNIDAD[r.unidad]}
              {r.mes && ` · ${r.mes}`}
            </span>
            : {num(r.volumen)} en {r.campanias} {r.campanias === 1 ? "campaña" : "campañas"} →{" "}
            <strong>{eur(r.precio)}</strong> cada una
            {r.desde != null ? ` (tramo desde ${num(r.desde)})` : " (por debajo del primer tramo)"}.
            {r.siguiente && (
              <span className="text-muted-foreground">
                {" "}
                Faltan {num(r.siguiente.desde - r.volumen)} para bajar a {eur(r.siguiente.precio)}.
              </span>
            )}
            <span className="block text-xs text-muted-foreground">
              Tramos: {textoTramos(r.precioBase, r.tramos).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
