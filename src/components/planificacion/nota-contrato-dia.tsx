import { notasSemanaPartida } from "@/lib/planificacion/tablero";

/**
 * Leyenda de cómo se cuenta el contrato de cada día (10/11/2026, pedida por
 * supervisión): las horas de su turno, y la diferencia de la semana el
 * último día con turno. Con las semanas partidas del mes, si las hay. La
 * usan «Horas» y «Saldos».
 */
export function NotaContratoDia({ mes }: { mes: string }) {
  const notas = notasSemanaPartida(mes);
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <p>
        <strong className="font-semibold text-foreground">Cómo se cuenta el contrato:</strong> cada día cuenta las horas de su
        turno (si los lunes trabaja 9 h, el lunes cuenta 9 h). Como el turno de una semana no siempre suma su contrato (por
        ejemplo, semanas de 39 h y de 37 h con un contrato de 38 h), la diferencia se suma o se resta el último día con turno
        de la semana, normalmente el viernes. Por eso, quien cumple su turno sale a cero de lunes a jueves y el viernes puede
        salir +1 o −1. Una semana entera suma justo su contrato.
      </p>
      {notas.length > 0 ? (
        <ul className="mt-1 list-disc pl-4">
          {notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
