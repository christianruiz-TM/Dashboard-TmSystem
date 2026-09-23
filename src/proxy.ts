import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// Proxy (antes "middleware" en Next <16): solo comprueba la
// PRESENCIA de la cookie de sesión y redirige a /login. La
// validación real (BBDD, roles, caducidad) la hacen los layouts
// de servidor con requireRol().
// ============================================================

const RUTAS_PUBLICAS = ["/login"];

export function proxy(peticion: NextRequest) {
  const { pathname } = peticion.nextUrl;

  const esPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
  const tieneCookie = peticion.cookies.has("tm_sesion");

  if (!esPublica && !tieneCookie) {
    const url = peticion.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // OJO: NO redirigir /login→/ por tener cookie. El proxy no valida la sesión
  // (solo su presencia), así que una cookie CADUCADA provocaba bucle infinito
  // (/login→/ por cookie, y /→/login por sesión inválida). Que /login se
  // muestre siempre; si la sesión es válida, la propia página redirige.
  return NextResponse.next();
}

export const config = {
  // Todo excepto estáticos de Next y ficheros públicos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|.*\\.png$|.*\\.svg$).*)"],
};
