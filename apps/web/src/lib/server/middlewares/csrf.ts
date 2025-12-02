import { CsrfError } from "../errors";

export { CsrfError };

type CsrfOptions = {
  allowedOrigins?: string[];
  skipMethods?: string[];
};

export function csrfMiddleware(options: CsrfOptions = {}) {
  const { allowedOrigins = [], skipMethods = ["GET", "HEAD", "OPTIONS"] } =
    options;

  return async (request: Request): Promise<Record<string, never>> => {
    if (skipMethods.includes(request.method)) return {};

    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const host = request.headers.get("host");
    const requestOrigin = origin || (referer ? new URL(referer).origin : null);

    if (!requestOrigin) throw new CsrfError("Missing origin header");

    const hostOrigin = host ? `https://${host}` : null;
    const validOrigins = [...allowedOrigins];
    if (hostOrigin) {
      validOrigins.push(hostOrigin);
      if (host?.includes("localhost")) validOrigins.push(`http://${host}`);
    }

    if (!validOrigins.includes(requestOrigin))
      throw new CsrfError("Invalid origin");
    return {};
  };
}
