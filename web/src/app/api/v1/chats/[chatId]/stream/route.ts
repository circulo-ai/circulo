import { streamEmitter } from "@/lib/sse";

export async function GET(
  request: Request,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      streamEmitter.on(chatId, listener);

      request.signal.addEventListener('abort', () => {
        streamEmitter.off(chatId, listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}