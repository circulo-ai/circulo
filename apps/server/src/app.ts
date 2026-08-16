import createApp from "@/lib/create-app";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/urls/utils";
import { rateLimit } from "@/middleware/rate-limit";
import agent from "@/routes/agent";
import artifact from "@/routes/artifact";
import auth from "@/routes/auth";
import authSocketToken from "@/routes/auth-socket-token";
import autumn from "@/routes/autumn";
import chat from "@/routes/chat";
import chatAgents from "@/routes/chat-agents";
import chatPin from "@/routes/chat-pin";
import chatStream from "@/routes/chat-stream";
import chatVisibility from "@/routes/chat-visibility";
import conversations from "@/routes/conversations";
import files from "@/routes/files";
import history from "@/routes/history";
import messages from "@/routes/messages";
import suggestions from "@/routes/suggestions";
import test from "@/routes/test";
import workflowRuntime from "@/routes/workflow-runtime";
import userProfile from "@/routes/users/profile";
import userSettings from "@/routes/users/settings";
import userUnsubscribe from "@/routes/users/unsubscribe";
import vote from "@/routes/vote";
import { HttpError } from "@circulo-ai/types";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";

const app = createApp();
const IS_DEVELOPMENT = env.NODE_ENV === "development";
const OPENAPI_PATH = "/openapi.json";

// Middlewares (register before routes)
app.use("*", logger());
app.use("*", requestId());
app.use(prettyJSON());
const allowedOrigins = [
  getBaseUrl(),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
];
const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return getBaseUrl();
    if (allowedOrigins.includes(origin)) return origin;
    try {
      const originHost = new URL(origin).host;
      const appHost = new URL(getBaseUrl()).host;
      if (originHost === appHost) return origin;
    } catch {
      // fall through
    }
    return getBaseUrl();
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
});
app.use("*", corsMiddleware); // apply globally so preflight never 404s

// Skip rate limiting only in an explicitly configured development environment.
if (!IS_DEVELOPMENT) {
  app.use("/api/*", rateLimit());
}

const routes = [
  autumn,
  auth,
  authSocketToken,
  artifact,
  agent,
  chatAgents,
  chatPin,
  chatStream,
  chat,
  chatVisibility,
  files,
  messages,
  conversations,
  history,
  suggestions,
  userProfile,
  userSettings,
  userUnsubscribe,
  vote,
] as const;

routes.forEach((route) => {
  app.route("/api", route);
});

if (IS_DEVELOPMENT) {
  app.route("/api", test);
}

// Workflow DevKit invokes these internal endpoints directly. They must stay
// outside the /api prefix used by user-facing routes.
app.route("/", workflowRuntime);

export type AppType = (typeof routes)[number];

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return err.toResponse();
  }

  return c.json({ message: "Internal server error" }, 500);
});

export default app;
