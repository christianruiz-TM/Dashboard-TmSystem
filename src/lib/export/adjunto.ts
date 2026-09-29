// ============================================================
// Cabecera Content-Disposition segura para cualquier nombre de
// fichero (los exports llevan el nombre del cliente dentro).
// ============================================================

/**
 * `filename` ASCII de respaldo + `filename*` UTF-8 (RFC 6266 / RFC 5987): los
 * navegadores usan el segundo y conservan acentos y símbolos.
 *
 * Por qué: con el nombre tal cual, un carácter fuera de Latin-1 («€», comillas
 * tipográficas…) hacía lanzar a `new Response()` («Cannot convert argument to
 * a ByteString») → error 500 en el export; y unas comillas rectas en el nombre
 * cortaban la cabecera.
 */
export function cabeceraAdjunto(nombreArchivo: string): string {
  const ascii = nombreArchivo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes: Peñón → Penon
    .replace(/[^A-Za-z0-9._ -]/g, "_");
  // encodeURIComponent deja sin escapar ' ( ) *, que RFC 5987 no admite
  const utf8 = encodeURIComponent(nombreArchivo).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
