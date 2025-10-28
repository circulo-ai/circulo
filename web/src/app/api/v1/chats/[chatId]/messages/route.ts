import { inngest } from "@/inngest/client";
import { getSession } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;
  const session = await getSession();
  const { content } = await request.json();

  // Trigger Inngest workflow
  await inngest.send({
    name: 'chat/roundtable.start',
    data: {
      chatId,
      userId: session?.user.id,
      userMessage: content,
    }
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
    const eventSource = new EventSource(`/api/chats/${chatId}/stream`);
    
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
    await fetch(`/api/chats/${chatId}/messages`, {
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