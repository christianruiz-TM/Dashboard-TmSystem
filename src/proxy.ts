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
  if (pathname === "/login" && tieneCookie) {
    // Con sesión aparente, la home decide la vista según el rol real
    const url = peticion.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Todo excepto estáticos de Next y ficheros públicos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|.*\\.png$|.*\\.svg$).*)"],
};
