import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isSupabaseConfigured } from "./env";

const PUBLIC_PREFIXES = ["/login", "/registrer", "/glemt-passord", "/auth", "/oppsett"];

const isPublic = (pathname: string) => PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Fornyer Supabase-sesjonen på hver forespørsel og beskytter alle ruter unntatt innlogging. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (pathname === "/oppsett") return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/oppsett", request.url));
  }

  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Viktig: ingen kode mellom createServerClient og getUser() – getUser() verifiserer sesjonen mot Auth-serveren.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (path: string, search = "") => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = search;
    const redirect = NextResponse.redirect(target);
    // Behold fornyede sesjons-cookies
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  };

  if (pathname === "/") return redirectTo(user ? "/oversikt" : "/login");

  if (!user && !isPublic(pathname)) {
    const next = pathname + request.nextUrl.search;
    return redirectTo("/login", `?next=${encodeURIComponent(next)}`);
  }

  if (user && (pathname === "/login" || pathname === "/registrer")) return redirectTo("/oversikt");

  return response;
}
