import { getRun } from "workflow/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  // Client provides the last chunk index they received
  const startIndexParam = searchParams.get("startIndex");
  const startIndex = startIndexParam
    ? parseInt(startIndexParam, 10)
    : undefined;
  const run = getRun(runId);
  const stream = run.getReadable({ startIndex });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain" },
  });
}
