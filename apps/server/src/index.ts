import app from "./app";

// Nitro expects a default export that is a fetch handler.
// Hono's `app.fetch` already satisfies the signature.
export const handler = app.fetch;
export default handler;
