import { Inngest } from "inngest";
import { env } from "../env";

const inngest = new Inngest({
  id: "circulo-server",
  eventKey: env.INNGEST_EVENT_KEY,
});

export { inngest };