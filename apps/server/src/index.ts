import { serve } from "@hono/node-server";
import app from "./app";

const port = Number.parseInt(process.env.PORT || "3002", 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info: { port: number }) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
