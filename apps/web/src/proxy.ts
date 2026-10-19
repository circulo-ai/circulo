import { NextResponse, type NextRequest } from "next/server";

/** Route desktop API traffic through the runtime-selected local API port. */
export function proxy(request: NextRequest) {
  if (process.env.CIRCULO_RUNTIME_KIND !== "desktop") {
    return NextResponse.next();
  }

  const apiBaseUrl = process.env.SERVER_API_URL?.trim();
  if (!apiBaseUrl) {
    return NextResponse.json(
      { message: "The desktop API address is not configured." },
      { status: 503 },
    );
  }

  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    apiBaseUrl,
  );
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ["/api/:path*"],
};
