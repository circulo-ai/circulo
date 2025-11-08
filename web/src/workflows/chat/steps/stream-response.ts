import { convertToModelMessages, streamText, UIMessageChunk } from "ai";
import { google } from "@ai-sdk/google"

export async function streamResponse(messages: any[], writable: WritableStream<UIMessageChunk>): Promise<{ text: string }> {
    'use step';
    const writer = writable.getWriter();
    // Call streamText from the AI SDK
    const result = streamText({
        model: google("gemini-2.5-flash"),
        messages: convertToModelMessages(messages)
    });
    // Pipe the AI stream into the writable stream
    const reader = result
        .toUIMessageStream({ sendStart: false, sendFinish: false })
        .getReader();
    let aggregatedText = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        try {
            const chunk: any = value as any;
            if (typeof chunk?.textDelta === "string") aggregatedText += chunk.textDelta;
            else if (typeof chunk?.text === "string") aggregatedText += chunk.text;
            const content = chunk?.content;
            if (Array.isArray(content)) {
                for (const c of content) {
                    if (typeof c?.textDelta === "string") aggregatedText += c.textDelta;
                    else if (typeof c?.text === "string") aggregatedText += c.text;
                }
            }
        } catch {}
    }
    reader.releaseLock();
    // Close the stream
    writer.close();
    writer.releaseLock();

    // Ensure we return the full text even if not all deltas were captured above
    const finalText = (await result.text) || aggregatedText || "";
    return { text: finalText };
}
