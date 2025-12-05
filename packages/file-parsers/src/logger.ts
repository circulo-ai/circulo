export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(name: string, base?: Logger): Logger {
  const target = base ?? console;
  const prefix = `[${name}]`;
  const call =
    <T extends keyof Logger>(level: T) =>
    (...args: unknown[]) => {
      const fn = (target as Record<string, unknown>)[level];
      if (typeof fn === "function") {
        (fn as (...args: unknown[]) => void)(prefix, ...args);
      } else if (typeof target.info === "function") {
        target.info(prefix, ...args);
      }
    };

  return {
    info: call("info"),
    warn: call("warn"),
    error: call("error"),
  };
}
