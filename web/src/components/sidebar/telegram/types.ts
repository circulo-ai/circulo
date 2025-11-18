export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread?: boolean;
  verified?: boolean;
  hasAttachment?: boolean;
  badges?: string[];
  type: "channel" | "dm";
}
