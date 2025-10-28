import { inngest } from "@/inngest/client";
import { chatRoundtable } from "@/inngest/functions/roundtable";
import { serve } from "inngest/next";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    chatRoundtable
  ],
});
