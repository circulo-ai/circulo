import createApp from "@/lib/create-app";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/urls/utils";
import { rateLimit } from "@/middleware/rate-limit";
import { loadAuthContext } from "@/middleware/auth";
import { auditRequest } from "@/middleware/audit";
import agent from "@/routes/agent";
import artifact from "@/routes/artifact";
import auth from "@/routes/auth";
import authSocketToken from "@/routes/auth-socket-token";
import automation from "@/routes/automation";
import autumn from "@/routes/autumn";
import billing from "@/routes/billing";
import capabilities from "@/routes/capabilities";
import chat from "@/routes/chat";
import chatResources from "@/routes/chat-resources";
import chatAgents from "@/routes/chat-agents";
import chatInvitations from "@/routes/chat-invitations";
import chatMembers from "@/routes/chat-members";
import chatPin from "@/routes/chat-pin";
import chatSettings from "@/routes/chat-settings";
import chatStream from "@/routes/chat-stream";
import chatVisibility from "@/routes/chat-visibility";
import conversations from "@/routes/conversations";
import files from "@/routes/files";
import health from "@/routes/health";
import history from "@/routes/history";
import knowledge from "@/routes/knowledge";
import memories from "@/routes/memories";
import messages from "@/routes/messages";
import models from "@/routes/models";
import suggestions from "@/routes/suggestions";
import skills from "@/routes/skills";
import test from "@/routes/test";
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
const SHOULD_APPLY_RATE_LIMITING = env.NODE_ENV === "production";
const OPENAPI_PATH = "/openapi.json";

// Middlewares (register before routes)
app.use("*", logger());
app.use("*", requestId());
app.use("*", auditRequest);
app.use(prettyJSON());
const allowedOrigins = [
  env.NEXT_PUBLIC_APP_URL,
  getBaseUrl(),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin.trim())
  .filter(Boolean);
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
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-Id"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
});
app.use("*", corsMiddleware); // apply globally so preflight never 404s

// Rate limiting is a production boundary. Keeping it opt-in prevents an unset
// NODE_ENV from making local development behave like a shared production API.
if (SHOULD_APPLY_RATE_LIMITING) {
  app.use("/api/*", loadAuthContext);
  app.use("/api/*", rateLimit());
}

const routes = [
  autumn,
  automation,
  billing,
  capabilities,
  auth,
  authSocketToken,
  artifact,
  agent,
  chatAgents,
  chatMembers,
  chatInvitations,
  chatSettings,
  chatPin,
  chatStream,
  chat,
  chatResources,
  chatVisibility,
  files,
  messages,
  models,
  conversations,
  history,
  knowledge,
  memories,
  suggestions,
  skills,
  userProfile,
  userSettings,
  userUnsubscribe,
  vote,
] as const;

routes.forEach((route) => {
  app.route("/api", route);
});

app.route("/", health);

if (IS_DEVELOPMENT) {
  app.route("/api", test);
}

export type AppType = (typeof routes)[number];

app.onError((err, c) => {
  console.error("[API Error]", {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? (err.stack ?? err.message) : err,
  });
  if (err instanceof HttpError) {
    return err.toResponse();
  }

  return c.json({ message: "Internal server error" }, 500);
});

export default app;
