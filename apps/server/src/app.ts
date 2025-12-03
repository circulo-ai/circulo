import auth from "@/routes/auth";
import authSocketToken from "@/routes/auth-socket-token";
import conversations from "@/routes/conversations";
import artifact from "@/routes/artifact";
import agent from "@/routes/agent";
import autumn from "@/routes/autumn";
import chatPin from "@/routes/chat-pin";
import chatAgents from "@/routes/chat-agents";
import chatStream from "@/routes/chat-stream";
import chat from "@/routes/chat";
import chatVisibility from "@/routes/chat-visibility";
import fileDelete from "@/routes/files/delete";
import fileDownload from "@/routes/files/download";
import filePresigned from "@/routes/files/presigned";
import filePresignedBatch from "@/routes/files/presigned-batch";
import fileUpload from "@/routes/files/upload";
import fileMultipart from "@/routes/files/multipart";
import fileParse from "@/routes/files/parse";
import fileServe from "@/routes/files/serve";
import history from "@/routes/history";
import messages from "@/routes/messages";
import suggestions from "@/routes/suggestions";
import oauthConnections from "@/routes/oauth/connections";
import oauthDisconnect from "@/routes/oauth/disconnect";
import oauthCredentials from "@/routes/oauth/credentials";
import oauthToken from "@/routes/oauth/token";
import oauthMicrosoftFiles from "@/routes/oauth/microsoft-files";
import oauthMicrosoftFile from "@/routes/oauth/microsoft-file";
import userProfile from "@/routes/users/profile";
import userSettings from "@/routes/users/settings";
import userUnsubscribe from "@/routes/users/unsubscribe";
import vote from "@/routes/vote";
import { HttpError } from "@/lib/server/errors";
import createApp from "@/lib/create-app";
import { requestId } from "hono/request-id";
import { prettyJSON } from "hono/pretty-json";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getBaseUrl } from "./lib/urls/utils";

const app = createApp();

const routes = [
  auth,
  authSocketToken,
  autumn,
  artifact,
  agent,
  chatAgents,
  chatPin,
  chatStream,
  chat,
  chatVisibility,
  fileDelete,
  fileDownload,
  filePresigned,
  filePresignedBatch,
  fileUpload,
  fileMultipart,
  fileParse,
  fileServe,
  messages,
  oauthConnections,
  oauthDisconnect,
  oauthCredentials,
  oauthToken,
  oauthMicrosoftFiles,
  oauthMicrosoftFile,
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

export type AppType = (typeof routes)[number];

// Middlewares
app.use("*", logger());
app.use("*", requestId());
app.use(prettyJSON());
app.use(
	"/api/auth/*", // or replace with "*" to enable cors for all routes
	cors({
		origin: getBaseUrl(), // replace with your origin
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return err.toResponse();
  }

  console.error(err);
  return c.json({ message: "Internal server error" }, 500);
});

export default app;
