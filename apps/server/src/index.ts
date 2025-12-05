import app from "@/app";

const port = Number.parseInt(process.env.PORT || "3002", 10);

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server is running on http://localhost:${port}`);