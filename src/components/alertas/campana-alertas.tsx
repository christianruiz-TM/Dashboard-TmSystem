"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellRing, CheckCheck, Eye, RefreshCw, Volume2 } from "lucide-react";
import { guardarAjustesAlertas, marcarAlertasVistas } from "@/app/(dashboard)/alertas-acciones";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  estaVista,
  NOMBRE_ORIGEN,
  RECORDATORIOS_MIN,
  sinVer,
  sonidoQueToca,
  type AlertaPanel,
  type PreferenciasAlertas,
} from "@/lib/alertas-panel";
import { cn } from "@/lib/utils";
import {
  marcarPestana,
  notificarEscritorio,
  pedirPermisoEscritorio,
  permisoEscritorio,
  prepararAudio,
  tocarSonido,
  type PermisoEscritorio,
} from "./avisos-navegador";

// ============================================================
// Campana de alertas de la barra de arriba (04/11/2026): se ve en cualquier
// página. Consulta /api/alertas cada minuto; suena al aparecer una alerta
// nueva sin ver y recuerda las altas sin ver cada N minutos (lógica en
// lib/alertas-panel.ts); pone el número en el título y el icono de la
// pestaña y, si el PC lo permite, avisa con una notificación de Windows.
// Si el servidor cambia (despliegue), pide recargar la página: el código
// viejo ya no puede guardar lo marcado como visto (06/11/2026).
// ============================================================

const CADA_MS = 60_000;
const MAX_AVISOS_WINDOWS = 3;

const ICONO = {
  alta: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />,
  media: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />,
  info: <Eye className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />,
};

export function CampanaAlertas({ preferenciasIniciales }: { preferenciasIniciales: PreferenciasAlertas }) {
  const router = useRouter();
  const pathname = usePathname();
  const [alertas, setAlertas] = useState<AlertaPanel[]>([]);
  const [preferencias, setPreferencias] = useState(preferenciasIniciales);
  const [errores, setErrores] = useState<string[]>([]);
  const [permiso, setPermiso] = useState<PermisoEscritorio>("no_disponible");
  const [abierta, setAbierta] = useState(false);
  const [, iniciar] = useTransition();
  /** Partes que ya han salido en esta pestaña: si se van y vuelven, no son nuevas. */
  const antes = useRef<Set<string> | null>(null);
  const ultimoSonido = useRef(0);
  /** Marcadas aquí y quizá aún sin guardar: una consulta que salió antes no las deshace. */
  const marcadasAqui = useRef(new Set<string>());
  /** Servidor de la primera consulta de esta pestaña: si cambia, hubo un despliegue. */
  const servidor = useRef<string | null>(null);
  const [versionNueva, setVersionNueva] = useState(false);

  const consultar = useCallback(async () => {
    try {
      const r = await fetch("/api/alertas", { cache: "no-store" });
      if (r.status === 401) return; // sesión caducada: la página ya llevará a entrar
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as {
        alertas: AlertaPanel[];
        errores: string[];
        preferencias: PreferenciasAlertas;
        version?: string;
      };
      if (d.version) {
        servidor.current ??= d.version;
        if (d.version !== servidor.current) setVersionNueva(true);
      }
      const guardadas = new Set(d.preferencias.vistas);
      for (const v of marcadasAqui.current) if (guardadas.has(v)) marcadasAqui.current.delete(v);
      const prefs = { ...d.preferencias, vistas: [...guardadas, ...marcadasAqui.current] };
      setAlertas(d.alertas);
      setPreferencias(prefs);
      setErrores(d.errores);
      const toca = sonidoQueToca({
        antes: antes.current,
        alertas: d.alertas,
        preferencias: prefs,
        ultimoSonidoMs: ultimoSonido.current,
        ahoraMs: Date.now(),
      });
      antes.current = new Set([...(antes.current ?? []), ...d.alertas.flatMap((a) => a.partes)]);
      if (toca) {
        tocarSonido(toca.sonido);
        ultimoSonido.current = Date.now();
        for (const a of d.alertas.filter((x) => toca.nuevas.includes(x.id)).slice(0, MAX_AVISOS_WINDOWS)) {
          notificarEscritorio(`Alerta de ${NOMBRE_ORIGEN[a.origen].toLowerCase()}`, a.mensaje, a.id, () => {
            if (a.enlace) router.push(a.enlace.href);
          });
        }
      }
    } catch {
      setErrores(["No se han podido consultar las alertas: se vuelve a intentar en un minuto."]);
    }
  }, [router]);

  useEffect(() => {
    ultimoSonido.current = Date.now();
    // El primer clic en la página prepara el audio (el navegador no deja sonar antes)
    const alTocar = () => prepararAudio();
    document.addEventListener("pointerdown", alTocar, { once: true });
    const primera = window.setTimeout(() => {
      setPermiso(permisoEscritorio());
      void consultar();
    }, 0);
    const id = window.setInterval(() => void consultar(), CADA_MS);
    return () => {
      document.removeEventListener("pointerdown", alTocar);
      window.clearTimeout(primera);
      window.clearInterval(id);
    };
  }, [consultar]);

  const vistasSet = new Set(preferencias.vistas);
  const pendientes = sinVer(alertas, preferencias.vistas);
  const hayAlta = pendientes.some((a) => a.gravedad === "alta");

  // Número en el título y punto en el icono de la pestaña (también al cambiar de página)
  useEffect(() => {
    const id = window.setTimeout(() => marcarPestana(pendientes.length), 100);
    return () => window.clearTimeout(id);
  }, [pendientes.length, pathname]);
  useEffect(() => () => marcarPestana(0), []);

  const marcarVistas = (marcadas: AlertaPanel[]) => {
    const partes = [...new Set(marcadas.flatMap((a) => a.partes))];
    if (partes.length === 0) return;
    for (const p of partes) marcadasAqui.current.add(p);
    setPreferencias((p) => ({ ...p, vistas: [...new Set([...p.vistas, ...partes])] }));
    iniciar(async () => {
      try {
        await marcarAlertasVistas(partes);
      } catch {
        for (const p of partes) marcadasAqui.current.delete(p);
        setPreferencias((p) => ({ ...p, vistas: p.vistas.filter((v) => !partes.includes(v)) }));
        setErrores(["No se ha podido guardar. Recarga la página (F5) y vuelve a marcarla."]);
      }
    });
  };

  const cambiarAjustes = (cambios: Partial<Pick<PreferenciasAlertas, "sonido" | "recordatorioMin">>) => {
    const nuevas = { ...preferencias, ...cambios };
    setPreferencias(nuevas);
    iniciar(async () => {
      try {
        await guardarAjustesAlertas({ sonido: nuevas.sonido, recordatorioMin: nuevas.recordatorioMin });
      } catch {
        setErrores(["No se ha podido guardar: vuelve a intentarlo."]);
      }
    });
  };

  const Icono = hayAlta ? BellRing : Bell;
  const etiqueta = pendientes.length === 0 ? "Alertas: ninguna sin ver" : `Alertas: ${pendientes.length} sin ver`;

  return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={etiqueta} title={etiqueta} />}>
        <Icono className={cn("h-4 w-4", hayAlta && "text-red-600")} />
        {pendientes.length > 0 ? (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white",
              hayAlta ? "bg-red-600" : "bg-amber-500",
            )}
            aria-hidden
          >
            {pendientes.length > 9 ? "9+" : pendientes.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <PopoverTitle className="text-sm font-semibold">Alertas</PopoverTitle>
          {pendientes.length > 0 ? (
            <Button size="xs" variant="ghost" onClick={() => marcarVistas(pendientes)}>
              <CheckCheck /> Marcar todas como vistas
            </Button>
          ) : null}
        </div>

        {versionNueva ? (
          <div className="flex items-center justify-between gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span>Hay una versión nueva del panel: recarga la página para que lo que marques como visto se guarde.</span>
            <Button size="xs" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw /> Recargar
            </Button>
          </div>
        ) : null}

        <div className="max-h-96 overflow-y-auto">
          {errores.map((e) => (
            <p key={e} className="border-b px-3 py-2 text-xs text-destructive">
              {e}
            </p>
          ))}
          {alertas.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin alertas ahora.</p>
          ) : (
            <ul>
              {alertas.map((a) => {
                const vista = estaVista(a, vistasSet);
                return (
                  <li key={a.id} className={cn("flex gap-2 border-b px-3 py-2 text-sm last:border-0", vista ? "opacity-60" : "bg-accent/40")}>
                    {ICONO[a.gravedad]}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={cn(!vista && "font-medium")}>{a.mensaje}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{NOMBRE_ORIGEN[a.origen]}</span>
                        {a.enlace ? (
                          <Link href={a.enlace.href} className="underline underline-offset-2 hover:text-foreground" onClick={() => setAbierta(false)}>
                            {a.enlace.etiqueta}
                          </Link>
                        ) : null}
                        {vista ? (
                          <span>Vista</span>
                        ) : (
                          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => marcarVistas([a])}>
                            Marcar como vista
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <Switch size="sm" checked={preferencias.sonido} onCheckedChange={(v) => cambiarAjustes({ sonido: v })} />
              Sonido
            </label>
            <Button size="xs" variant="ghost" onClick={() => tocarSonido("alta", true)} disabled={!preferencias.sonido}>
              <Volume2 /> Probar
            </Button>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>Recordar las alertas rojas sin ver</span>
            <SelectNativo
              className="h-7 w-auto"
              value={preferencias.recordatorioMin}
              disabled={!preferencias.sonido}
              onChange={(e) => cambiarAjustes({ recordatorioMin: Number(e.target.value) })}
            >
              {RECORDATORIOS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "nunca" : `cada ${m} min`}
                </option>
              ))}
            </SelectNativo>
          </label>
          <p className="text-muted-foreground">
            {permiso === "granted" ? (
              "Avisos de Windows activados en este navegador."
            ) : permiso === "default" ? (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={async () => setPermiso(await pedirPermisoEscritorio())}
              >
                Activar los avisos de Windows en este navegador
              </button>
            ) : permiso === "denied" ? (
              "Avisos de Windows bloqueados: actívalos en el candado de la barra de direcciones."
            ) : (
              "Avisos de Windows: hay que activarlos una vez en este PC (lo hace informática). Mientras, suena y sale el número en la pestaña."
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
