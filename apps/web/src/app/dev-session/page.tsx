import { notFound } from "next/navigation";

import DevSessionClient from "./dev-session-client";

export default function DevSessionPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevSessionClient />;
}
