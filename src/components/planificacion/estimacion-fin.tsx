import { CalendarClock } from "lucide-react";
import { fechaCorta, horasLegibles } from "@/lib/fechas";
import type { EstimacionCliente } from "@/lib/planificacion/estimaciones";
import { horquillaFin } from "@/lib/planificacion/motor";

const n0 = (x: number) => Math.round(x).toLocaleString("es-ES");
const n1 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const n2 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 2 });
const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/**
 * Estimación de cuándo acaba una campaña saliente (página de bolsas): la
 * horquilla y de dónde sale cada fecha. Nadie sabe la fecha exacta; esto
 * dice cuándo se acabaría la lista (o el contrato) con cada referencia.
 */
export function EstimacionFinCampania({ e }: { e: EstimacionCliente }) {
  const x = e.estimacion;
  const horquilla = horquillaFin(x);
  const terminada = x.cierresPendientes === 0;

  let titular: React.ReactNode;
  if (terminada) titular = "La lista ya está en su objetivo: no quedan cierres pendientes.";
  else if (!horquilla) titular = "Sin datos suficientes para estimar el fin.";
  else if (horquilla.desde === horquilla.hasta) titular = <>Fin estimado de la lista: hacia el {fechaCorta(horquilla.desde)}.</>;
  else titular = <>Fin estimado de la lista: entre el {fechaCorta(horquilla.desde)} y el {fechaCorta(horquilla.hasta)}.</>;

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden /> {titular}
      </p>
      {horquilla?.contratoAntes && x.contrato?.fecha ? (
        <p className="mt-1 font-medium text-amber-700">
          Ojo: con lo planificado, las horas contratadas se agotan antes, el {fechaCorta(x.contrato.fecha)}.
        </p>
      ) : null}
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <li>
          {e.foto ? (
            <>
              Lista (foto del {corta(e.foto.fecha)}): {n0(e.foto.vivos)} vivos de {n0(e.foto.total)}
              {x.cierresPendientes != null && x.cierresPendientes > 0
                ? `; faltan ${n0(x.cierresPendientes)} cierres para dejar el ${n2(e.foto.pctObjetivo)} % vivo.`
                : "."}
            </>
          ) : (
            "Sin foto de la lista de sus campañas."
          )}
          {e.enCurso.length > 0 ? ` Campaña en curso desde el ${fechaCorta(e.enCurso.map((c) => c.inicio).sort()[0])}.` : ""}
        </li>
        {!terminada ? (
          <>
            <li>
              {x.ritmoReciente ? (
                <>
                  Al ritmo de los últimos {x.ritmoReciente.laborables} laborables ({n1(x.ritmoReciente.cierresDia)} cierres/día):{" "}
                  {x.ritmoReciente.fecha ? `hacia el ${fechaCorta(x.ritmoReciente.fecha)}` : "más de dos años"}
                  {x.ritmoReciente.laborables < 5 ? " (pocos días de datos: poco fiable)" : ""}.
                </>
              ) : (
                "Sin cierres recientes para medir el ritmo."
              )}
            </li>
            <li>
              {x.plan ? (
                x.plan.fecha ? (
                  <>
                    Con lo planificado ({horasLegibles(x.plan.horasPlanificadas)} por delante; hacen falta{" "}
                    {horasLegibles(x.plan.horasNecesarias)} a su ritmo por hora): hacia el {fechaCorta(x.plan.fecha)}.
                  </>
                ) : (
                  <>
                    Lo planificado ({horasLegibles(x.plan.horasPlanificadas)}) no basta para acabar la lista: faltarían{" "}
                    {horasLegibles(x.plan.faltanHoras)}.
                  </>
                )
              ) : (
                "Sin ritmo de cierre por hora para estimar con lo planificado."
              )}
            </li>
            <li>
              {x.similares ? (
                <>
                  Por campañas parecidas (
                  {x.similares.referencias
                    .map((r) => `${r.campania}: ${corta(r.inicio)}–${fechaCorta(r.fin)}, ${n0(r.cierres)} cierres en ${r.laborables} laborables`)
                    .join("; ")}
                  ; {n1(x.similares.cierresDia)} cierres/día): {x.similares.fecha ? `hacia el ${fechaCorta(x.similares.fecha)}` : "más de dos años"}.
                </>
              ) : (
                <>
                  Sin campañas parecidas terminadas
                  {e.patronesSimilares.length > 0 ? ` (buscadas: ${e.patronesSimilares.join(", ")})` : ""}.
                </>
              )}
            </li>
          </>
        ) : null}
        <li>
          {e.contrato && x.contrato ? (
            <>
              Contrato: quedan {horasLegibles(x.contrato.restantes)} de {horasLegibles(e.contrato.horas)} (
              {horasLegibles(e.contrato.consumidas)} trabajadas desde el {fechaCorta(e.contrato.inicio)});{" "}
              {x.contrato.fecha
                ? `con lo planificado se agotan el ${fechaCorta(x.contrato.fecha)}.`
                : "con lo planificado no se agotan."}
            </>
          ) : (
            "Horas contratadas: sin configurar (parámetros horasContratadas e inicioContrato del cliente)."
          )}
        </li>
      </ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Con datos hasta el {fechaCorta(e.fechaDatos)}. Es una estimación: cuenta días laborables de lunes a viernes.
      </p>
    </div>
  );
}
