const DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getTrustedAuthOrigins(options: {
  appUrl?: string;
  authUrl?: string;
  corsAllowedOrigins?: string;
  production: boolean;
}): string[] {
  const configuredOrigins = (options.corsAllowedOrigins ?? "").split(",");
  const developmentOrigins = options.production ? [] : DEVELOPMENT_ORIGINS;
  const candidates = [
    options.appUrl,
    options.authUrl,
    ...configuredOrigins,
    ...developmentOrigins,
  ];

  return [
    ...new Set(candidates.map(normalizeOrigin).filter(Boolean)),
  ] as string[];
}
