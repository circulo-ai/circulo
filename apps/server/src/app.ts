import auth from "@/routes/auth";
import createApp from "@/lib/create-app";
import { requestId } from "hono/request-id";
import { prettyJSON } from "hono/pretty-json";

const app = createApp();

const routes = [auth] as const;

routes.forEach((route) => {
  app.basePath("/api").route("/", route);
});

export type AppType = (typeof routes)[number];

// Middlewares
app.use("*", requestId());
app.use(prettyJSON());

export default app;
