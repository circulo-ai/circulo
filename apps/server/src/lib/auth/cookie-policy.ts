type CookiePolicyOptions = {
  production: boolean;
  runtimeKind: string;
  authUrl: string;
  appUrl: string;
};

/** Desktop HTTP cookies are restricted to a matching pair of loopback hosts. */
export function getAuthCookiePolicy(options: CookiePolicyOptions) {
  let desktopLoopback = false;
  try {
    const auth = new URL(options.authUrl);
    const app = new URL(options.appUrl);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    desktopLoopback =
      options.runtimeKind === "desktop" &&
      auth.protocol === "http:" &&
      app.protocol === "http:" &&
      auth.hostname === app.hostname &&
      loopbackHosts.has(auth.hostname) &&
      !auth.username &&
      !auth.password &&
      !app.username &&
      !app.password;
  } catch {
    // Invalid configuration must never enable the loopback exception.
  }

  const secure = options.production && !desktopLoopback;
  return {
    useSecureCookies: secure,
    defaultCookieAttributes: {
      sameSite: secure ? ("none" as const) : ("lax" as const),
      secure,
      ...(secure ? { partitioned: true } : {}),
    },
    crossSubDomainCookies: { enabled: options.production && !desktopLoopback },
  };
}
