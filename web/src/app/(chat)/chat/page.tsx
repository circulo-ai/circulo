import { generateUUID } from "@/lib/utils";
import { NewChat } from "../components/new-chat";

export default function NewChatPage() {
  const id = generateUUID();
  return <NewChat id={id} />;
}
