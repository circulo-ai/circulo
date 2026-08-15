import { createRouter } from "@/lib/create-app";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type GeneratedHandler = (request: Request) => Response | Promise<Response>;
type GeneratedModule = Partial<Record<string, GeneratedHandler>>;

async function loadGeneratedModule(name: string): Promise<GeneratedModule> {
  const filePath = join(
    process.cwd(),
    ".well-known",
    "workflow",
    "v1",
    `${name}.js`,
  );
  return import(pathToFileURL(filePath).href) as Promise<GeneratedModule>;
}

async function invokeGeneratedHandler(
  name: string,
  method: string,
  request: Request,
): Promise<Response> {
  const generatedModule = await loadGeneratedModule(name);
  const handler = generatedModule[method];
  if (!handler) {
    return new Response("Workflow runtime handler is unavailable", {
      status: 503,
    });
  }
  return handler(request);
}

const router = createRouter();

router.post("/.well-known/workflow/v1/flow", (c) =>
  invokeGeneratedHandler("flow", "POST", c.req.raw),
);
router.post("/.well-known/workflow/v1/step", (c) =>
  invokeGeneratedHandler("step", "POST", c.req.raw),
);

router.all("/.well-known/workflow/v1/webhook/:token", (c) =>
  invokeGeneratedHandler("webhook", c.req.method, c.req.raw),
);

export default router;
