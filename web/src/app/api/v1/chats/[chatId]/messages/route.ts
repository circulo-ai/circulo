import { db, message, chat } from "@/db";
import { inngest } from "@/inngest/client";
import { getSession } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params;

  // Require authenticated user
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Verify user has access to this chat (owner check)
  const chatRow = await db.query.chat.findFirst({ where: eq(chat.id, chatId) });
  if (!chatRow || chatRow.userId !== session.user.id) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const messages = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: [asc(message.createdAt)],
  });
  return Response.json({ success: true, data: messages });
}

export async function POST(
  request: Request,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params;
  const session = await getSession();
  const { content } = await request.json();

  if (!session?.user?.id) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Verify user has access to this chat (owner check)
  const chatRow = await db.query.chat.findFirst({ where: eq(chat.id, chatId) });
  if (!chatRow || chatRow.userId !== session.user.id) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // Trigger Inngest workflow
  await inngest.send({
    name: "chat/roundtable.start",
    data: {
      chatId,
      userId: session?.user.id,
      userMessage: content,
    },
  });

  return Response.json({ success: true });
}

/*
// React component (Client Usage of stream)
function ChatRoom({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState('');
  const [currentAgent, setCurrentAgent] = useState(null);

  useEffect(() => {
    // Connect to SSE
    const eventSource = new EventSource(`/api/v1/chats/${chatId}/stream`);
    
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      
      if (data.type === 'stream') {
        setStreaming(prev => prev + data.content);
        setCurrentAgent(data.agentId);
      }
      
      if (data.type === 'complete') {
        setMessages(prev => [...prev, { 
          id: data.messageId, 
          agentId: data.agentId,
          content: streaming 
        }]);
        setStreaming('');
        setCurrentAgent(null);
      }
    };

    return () => eventSource.close();
  }, [chatId]);

  const sendMessage = async (content) => {
    await fetch(`/api/v1/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  };

  return (
    <div>
      {messages.map(msg => (
        <Message key={msg.id} {...msg} />
      ))}
      
      {streaming && (
        <StreamingMessage 
          agentId={currentAgent} 
          content={streaming} 
        />
      )}
      
      <input onSubmit={sendMessage} />
    </div>
  );
}
*/
