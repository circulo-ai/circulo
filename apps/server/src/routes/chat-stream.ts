import { createRouter } from "@/lib/create-app";
import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";

const router = createRouter();

router.get("/chat/:id/stream", async (c) => {
  const { id } = c.req.param();
  const { searchParams } = new URL(c.req.url);
  const startIndexParam = searchParams.get("startIndex");
  const startIndex =
    startIndexParam !== null ? Number.parseInt(startIndexParam, 10) : undefined;

  const run = getRun(id);
  const stream = run.getReadable({ startIndex });

  return createUIMessageStreamResponse({
    stream,
  });
});

export default router;
