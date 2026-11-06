// ============================================================
// CSS de las gráficas de «Mi servicio» (06/11/2026): el MISMO en la
// pantalla (una etiqueta <style> en la página) y en el informe descargado.
// Colores por función, validados con el validador de la skill de
// visualización (adyacentes éxito / no válido / resto, claro y oscuro):
//   --ms-ll llamadas (cian de la marca, oscurecido para que se lea)
//   --ms-fi finalizados (y el «resto» de los finalizados), --ms-va válidos
//   --ms-nv no válidos, --ms-fe éxitos, --ms-ho horas.
// El verde y el ámbar quedan por debajo de 3:1 sobre blanco: van siempre
// con etiqueta, globo y tabla. Modo oscuro con `.dark` (el del panel).
// ============================================================

export const CSS_GRAFICAS = `
.ms-raiz{--ms-ll:#1693ad;--ms-fi:#2a78d6;--ms-va:#6da7ec;--ms-nv:#eb6834;--ms-fe:#1baf7a;--ms-ho:#c98a00;--ms-rejilla:#e6e5df;--ms-eje:#c3c2b7;--ms-t1:#1c252c;--ms-t2:#52514e;--ms-t3:#6f6e69;--ms-pista:#e3ecf7}
.dark .ms-raiz{--ms-ll:#3bb3cc;--ms-fi:#3987e5;--ms-va:#5598e7;--ms-nv:#d95926;--ms-fe:#199e70;--ms-ho:#d9a000;--ms-rejilla:#2c2c2a;--ms-eje:#45453f;--ms-t1:#f5f5f4;--ms-t2:#c3c2b7;--ms-t3:#a3a29b;--ms-pista:#2a2f38}
.ms-svg{display:block;overflow:visible;font-family:inherit;height:auto}
.ms-svg text{font-size:12px;fill:var(--ms-t2)}
.ms-svg .ms-tt{font-size:13px;font-weight:600;fill:var(--ms-t1)}
.ms-svg .ms-tv{font-weight:600;fill:var(--ms-t2)}
.ms-svg .ms-tick{font-size:11px;font-weight:400;fill:var(--ms-t3);font-variant-numeric:tabular-nums}
.ms-svg .ms-et{font-size:12.5px;fill:var(--ms-t1)}
.ms-svg .ms-val{font-size:12.5px;font-weight:600;fill:var(--ms-t1)}
.ms-svg .ms-anillo{font-size:16px;font-weight:700;fill:var(--ms-t1)}
.ms-rejilla{stroke:var(--ms-rejilla);stroke-width:1}
.ms-base{stroke:var(--ms-eje);stroke-width:1}
.ms-pista{stroke:var(--ms-pista)}
.ms-zona{fill:transparent}
.ms-zona:hover{fill:var(--ms-t1);fill-opacity:.04}
.ms-barra{transition:opacity .12s}
.ms-foco .ms-barra{opacity:.3}
.ms-foco .ms-barra.ms-on{opacity:1}
.ms-mini{display:block}
.ms-leyenda{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--ms-t2)}
.ms-ley{display:inline-flex;align-items:center;gap:6px}
.ms-ley i{display:inline-block;width:10px;height:10px;border-radius:3px}
.ms-tabla{width:100%;border-collapse:collapse;font-size:12.5px}
.ms-tabla th{font-weight:600;text-align:left;color:var(--ms-t2);border-bottom:1px solid var(--ms-eje);padding:6px 8px;white-space:nowrap}
.ms-tabla td{padding:5px 8px;border-bottom:1px solid var(--ms-rejilla);color:var(--ms-t1)}
.ms-tabla tr.ms-total td{font-weight:600;border-top:1px solid var(--ms-eje)}
.ms-num{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap}
.ms-globo{position:fixed;z-index:1000;display:none;pointer-events:none;max-width:340px;padding:8px 10px;border-radius:8px;background:#1c252c;color:#fff;font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18)}
.ms-globo-t{font-weight:700;margin-bottom:2px}
@media print{.ms-zona:hover{fill:transparent}.ms-globo{display:none!important}}
`;
