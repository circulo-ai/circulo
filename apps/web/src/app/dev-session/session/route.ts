import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const apiBaseUrl =
    process.env.SERVER_API_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3002";
  const response = await fetch(`${apiBaseUrl}/api/test/session`, {
    cache: "no-store",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.text();
  const forwarded = new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) forwarded.headers.set("set-cookie", setCookie);
  return forwarded;
}
