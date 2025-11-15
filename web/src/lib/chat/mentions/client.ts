import {
  Mention,
  MentionEntity,
  MentionType,
  normalizeMentionName,
} from "@/lib/chat/mentions/types";
import { useState } from "react";

/**
 * Get current mention being typed (for autocomplete)
 * Returns null if cursor is not in a mention, or the mention details if it is
 */
export function getCurrentMention(
  text: string,
  cursorPosition: number,
): { type: MentionType; query: string; startIndex: number } | null {
  // Find the last @ or # before cursor
  let lastMentionStart = -1;
  let mentionType: MentionType | null = null;

  for (let i = cursorPosition - 1; i >= 0; i--) {
    const char = text[i];

    if (char === "@" || char === "#") {
      lastMentionStart = i;
      mentionType = char === "@" ? "agent" : "knowledge_base";
      break;
    }

    // Stop if we hit whitespace or start of text
    if (char === " " || char === "\n") {
      break;
    }
  }

  if (lastMentionStart === -1 || !mentionType) {
    return null;
  }

  // Check if there's a space between the mention start and cursor
  const textBetween = text.slice(lastMentionStart + 1, cursorPosition);
  if (textBetween.includes(" ") || textBetween.includes("\n")) {
    return null;
  }

  return {
    type: mentionType,
    query: textBetween,
    startIndex: lastMentionStart,
  };
}

/**
 * Filter entities for autocomplete based on query
 */
export function filterEntitiesForAutocomplete(
  entities: MentionEntity[],
  query: string,
  type: MentionType,
  limit: number = 10,
): MentionEntity[] {
  const normalizedQuery = normalizeMentionName(query);

  return entities
    .filter((e) => e.type === type)
    .filter((e) => {
      const normalizedName = normalizeMentionName(e.name);
      return normalizedName.includes(normalizedQuery);
    })
    .sort((a, b) => {
      // Prioritize matches at start of name
      const aNorm = normalizeMentionName(a.name);
      const bNorm = normalizeMentionName(b.name);
      const aStartsWith = aNorm.startsWith(normalizedQuery);
      const bStartsWith = bNorm.startsWith(normalizedQuery);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      // Then sort alphabetically
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/**
 * Insert mention into text at cursor position
 */
export function insertMention(
  text: string,
  cursorPosition: number,
  mention: MentionEntity,
  currentMentionStart: number,
): { text: string; newCursorPosition: number } {
  const prefix = mention.type === "agent" ? "@" : "#";
  const mentionText = `${prefix}${mention.name} `;

  const before = text.slice(0, currentMentionStart);
  const after = text.slice(cursorPosition);

  const newText = before + mentionText + after;
  const newCursorPosition = currentMentionStart + mentionText.length;

  return {
    text: newText,
    newCursorPosition,
  };
}

/**
 * Highlight mentions in text for display
 * Returns array of text segments with mention flags
 */
export interface TextSegment {
  text: string;
  isMention: boolean;
  mention?: Mention;
}

export function segmentTextWithMentions(
  content: string,
  mentions: Mention[],
): TextSegment[] {
  if (mentions.length === 0) {
    return [{ text: content, isMention: false }];
  }

  const segments: TextSegment[] = [];
  const sortedMentions = [...mentions].sort(
    (a, b) => a.startIndex - b.startIndex,
  );

  let lastIndex = 0;

  for (const mention of sortedMentions) {
    // Add text before mention
    if (mention.startIndex > lastIndex) {
      segments.push({
        text: content.slice(lastIndex, mention.startIndex),
        isMention: false,
      });
    }

    // Add mention
    segments.push({
      text: mention.raw,
      isMention: true,
      mention,
    });

    lastIndex = mention.endIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      text: content.slice(lastIndex),
      isMention: false,
    });
  }

  return segments;
}

/**
 * Strip mention syntax for plain text display
 */
export function stripMentionSyntax(content: string): string {
  return content.replace(/@/g, "").replace(/#/g, "");
}

/**
 * Get mention statistics for a chat
 */
export interface MentionStats {
  agentId: string;
  mentionCount: number;
}

export function calculateMentionStats(
  messages: Array<{ mentionedAgentIds?: string[] }>,
): MentionStats[] {
  const counts = new Map<string, number>();

  for (const msg of messages) {
    if (msg.mentionedAgentIds) {
      for (const agentId of msg.mentionedAgentIds) {
        counts.set(agentId, (counts.get(agentId) || 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([agentId, mentionCount]) => ({ agentId, mentionCount }))
    .sort((a, b) => b.mentionCount - a.mentionCount);
}

// ============================================================================
// REACT HOOKS (Optional - for easier integration)
// ============================================================================

/**
 * Example React hook for mention autocomplete
 * Usage in your textarea/input component
 */
export function useMentionAutocomplete(
  entities: MentionEntity[],
  onSelectMention?: (mention: MentionEntity) => void,
) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionEntity[]>([]);
  const [currentMention, setCurrentMention] =
    useState<ReturnType<typeof getCurrentMention>>(null);

  const handleTextChange = (text: string, cursorPosition: number) => {
    const mention = getCurrentMention(text, cursorPosition);
    setCurrentMention(mention);

    if (mention) {
      const filtered = filterEntitiesForAutocomplete(
        entities,
        mention.query,
        mention.type,
      );
      setSuggestions(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setShowAutocomplete(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = (entity: MentionEntity) => {
    setShowAutocomplete(false);
    onSelectMention?.(entity);
  };

  return {
    showAutocomplete,
    suggestions,
    currentMention,
    handleTextChange,
    selectSuggestion,
  };
}

//// ============================================================================
// // BACKEND USAGE EXAMPLES
// // ============================================================================
//
// // --- Example 1: Processing incoming message ---
// import { parseMessageMentions, validateMentions, extractMentionsForStorage } from './mention-utils';
//
// async function handleIncomingMessage(
//   content: string,
//   userId: string,
//   chatId: string,
//   db: any
// ) {
//   // 1. Get available entities for this chat
//   const chatAgents = await db
//     .select({
//       id: agent.id,
//       name: agent.name,
//     })
//     .from(chatAgent)
//     .innerJoin(agent, eq(chatAgent.agentId, agent.id))
//     .where(eq(chatAgent.chatId, chatId));
//
//   const availableKbs = await db
//     .select({
//       id: knowledgeBase.id,
//       name: knowledgeBase.name,
//     })
//     .from(chatKnowledgeBase)
//     .innerJoin(knowledgeBase, eq(chatKnowledgeBase.knowledgeBaseId, knowledgeBase.id))
//     .where(eq(chatKnowledgeBase.chatId, chatId));
//
//   const availableEntities: MentionEntity[] = [
//     ...chatAgents.map(a => ({ id: a.id, name: a.name, type: 'agent' as const })),
//     ...availableKbs.map(kb => ({ id: kb.id, name: kb.name, type: 'knowledge_base' as const })),
//   ];
//
//   // 2. Parse mentions
//   const parsed = parseMessageMentions(content, availableEntities);
//
//   // 3. Validate mentions
//   const validation = await validateMentions(
//     parsed.agentIds,
//     parsed.knowledgeBaseIds,
//     userId,
//     chatId,
//     db
//   );
//
//   if (!validation.valid) {
//     throw new Error(`Invalid mentions: ${validation.errors.join(', ')}`);
//   }
//
//   // 4. Store message with mentions
//   const messageData = {
//     id: generateId(),
//     chatId,
//     userId,
//     content: parsed.content,
//     ...extractMentionsForStorage(parsed),
//     createdAt: new Date(),
//   };
//
//   await db.insert(message).values(messageData);
//
//   // 5. Use mentions for routing logic
//   if (parsed.agentIds.length > 0) {
//     // User specifically mentioned certain agents
//     // Route to only those agents
//     return { targetAgentIds: parsed.agentIds };
//   } else {
//     // No specific mentions, use default routing
//     return { targetAgentIds: null };
//   }
// }
//
// // --- Example 2: API endpoint ---
// import { NextRequest, NextResponse } from 'next/server';
//
// export async function POST(req: NextRequest) {
//   const { content, chatId } = await req.json();
//   const userId = req.user.id;
//
//   try {
//     const result = await handleIncomingMessage(content, userId, chatId, db);
//     return NextResponse.json({ success: true, ...result });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 400 }
//     );
//   }
// }
//
// // --- Example 3: Query messages by mentions ---
// async function getMessagesWithMentions(chatId: string, agentId: string, db: any) {
//   // Using PostgreSQL jsonb operators
//   const messages = await db
//     .select()
//     .from(message)
//     .where(
//       and(
//         eq(message.chatId, chatId),
//         sql`${message.mentionedAgentIds} @> ${JSON.stringify([agentId])}`
//       )
//     )
//     .orderBy(desc(message.createdAt));
//
//   return messages;
// }
//
// // --- Example 4: Get mention analytics ---
// async function getMentionAnalytics(chatId: string, db: any) {
//   const agentMentions = await db
//     .select({
//       agentId: sql`jsonb_array_elements_text(${message.mentionedAgentIds})`,
//       count: sql`count(*)`.as('count'),
//     })
//     .from(message)
//     .where(eq(message.chatId, chatId))
//     .groupBy(sql`jsonb_array_elements_text(${message.mentionedAgentIds})`);
//
//   const kbMentions = await db
//     .select({
//       kbId: sql`jsonb_array_elements_text(${message.mentionedKnowledgeBaseIds})`,
//       count: sql`count(*)`.as('count'),
//     })
//     .from(message)
//     .where(eq(message.chatId, chatId))
//     .groupBy(sql`jsonb_array_elements_text(${message.mentionedKnowledgeBaseIds})`);
//
//   return {
//     agentMentions,
//     kbMentions,
//   };
// }
//
// // ============================================================================
// // FRONTEND USAGE EXAMPLES
// // ============================================================================
//
// // --- Example 1: React component with autocomplete ---
// import React, { useState, useRef, useEffect } from 'react';
// import {
//   getCurrentMention,
//   filterEntitiesForAutocomplete,
//   insertMention,
//   MentionEntity,
// } from './mention-utils';
//
// interface MessageInputProps {
//   agents: Array<{ id: string; name: string }>;
//   knowledgeBases: Array<{ id: string; name: string }>;
//   onSubmit: (content: string) => void;
// }
//
// export function MessageInput({ agents, knowledgeBases, onSubmit }: MessageInputProps) {
//   const [text, setText] = useState('');
//   const [cursorPosition, setCursorPosition] = useState(0);
//   const [showAutocomplete, setShowAutocomplete] = useState(false);
//   const [suggestions, setSuggestions] = useState<MentionEntity[]>([]);
//   const [selectedIndex, setSelectedIndex] = useState(0);
//   const [currentMention, setCurrentMention] = useState<ReturnType<typeof getCurrentMention>>(null);
//   const textareaRef = useRef<HTMLTextAreaElement>(null);
//
//   // Prepare entities
//   const entities: MentionEntity[] = [
//     ...agents.map(a => ({ id: a.id, name: a.name, type: 'agent' as const })),
//     ...knowledgeBases.map(kb => ({ id: kb.id, name: kb.name, type: 'knowledge_base' as const })),
//   ];
//
//   // Handle text change and detect mentions
//   const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
//     const newText = e.target.value;
//     const newCursor = e.target.selectionStart;
//
//     setText(newText);
//     setCursorPosition(newCursor);
//
//     const mention = getCurrentMention(newText, newCursor);
//     setCurrentMention(mention);
//
//     if (mention) {
//       const filtered = filterEntitiesForAutocomplete(
//         entities,
//         mention.query,
//         mention.type,
//         10
//       );
//       setSuggestions(filtered);
//       setShowAutocomplete(filtered.length > 0);
//       setSelectedIndex(0);
//     } else {
//       setShowAutocomplete(false);
//       setSuggestions([]);
//     }
//   };
//
//   // Handle keyboard navigation in autocomplete
//   const handleKeyDown = (e: React.KeyboardEvent) => {
//     if (!showAutocomplete) return;
//
//     if (e.key === 'ArrowDown') {
//       e.preventDefault();
//       setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
//     } else if (e.key === 'ArrowUp') {
//       e.preventDefault();
//       setSelectedIndex(prev => Math.max(prev - 1, 0));
//     } else if (e.key === 'Enter' || e.key === 'Tab') {
//       if (suggestions[selectedIndex]) {
//         e.preventDefault();
//         selectSuggestion(suggestions[selectedIndex]);
//       }
//     } else if (e.key === 'Escape') {
//       setShowAutocomplete(false);
//     }
//   };
//
//   // Insert selected mention
//   const selectSuggestion = (entity: MentionEntity) => {
//     if (!currentMention) return;
//
//     const { text: newText, newCursorPosition } = insertMention(
//       text,
//       cursorPosition,
//       entity,
//       currentMention.startIndex
//     );
//
//     setText(newText);
//     setShowAutocomplete(false);
//
//     // Set cursor position after React updates
//     setTimeout(() => {
//       if (textareaRef.current) {
//         textareaRef.current.selectionStart = newCursorPosition;
//         textareaRef.current.selectionEnd = newCursorPosition;
//         textareaRef.current.focus();
//       }
//     }, 0);
//   };
//
//   const handleSubmit = () => {
//     if (text.trim()) {
//       onSubmit(text);
//       setText('');
//     }
//   };
//
//   return (
//     <div className="relative">
//       <textarea
//         ref={textareaRef}
//         value={text}
//         onChange={handleChange}
//         onKeyDown={handleKeyDown}
//         placeholder="Type @ to mention an agent or # for knowledge bases..."
//         className="w-full p-3 border rounded-lg resize-none"
//         rows={3}
//       />
//
//       {showAutocomplete && (
//         <div className="absolute bottom-full mb-2 left-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto w-64">
//           {suggestions.map((entity, index) => (
//             <button
//               key={entity.id}
//               onClick={() => selectSuggestion(entity)}
//               className={`
//                 w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2
//                 ${index === selectedIndex ? 'bg-gray-100' : ''}
//               `}
//             >
//               <span className="text-gray-500">
//                 {entity.type === 'agent' ? '@' : '#'}
//               </span>
//               <span>{entity.name}</span>
//             </button>
//           ))}
//         </div>
//       )}
//
//       <button
//         onClick={handleSubmit}
//         className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg"
//       >
//         Send
//       </button>
//     </div>
//   );
// }
//
// // --- Example 2: Display message with highlighted mentions ---
// import { segmentTextWithMentions, type Mention } from './mention-utils';
//
// interface MessageDisplayProps {
//   content: string;
//   mentions: Mention[];
//   onMentionClick?: (mention: Mention) => void;
// }
//
// export function MessageDisplay({ content, mentions, onMentionClick }: MessageDisplayProps) {
//   const segments = segmentTextWithMentions(content, mentions);
//
//   return (
//     <div className="prose">
//       {segments.map((segment, index) => {
//         if (segment.isMention && segment.mention) {
//           return (
//             <button
//               key={index}
//               onClick={() => onMentionClick?.(segment.mention!)}
//               className={`
//                 inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium
//                 ${segment.mention.type === 'agent'
//                   ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
//                   : 'bg-green-100 text-green-800 hover:bg-green-200'
//                 }
//               `}
//             >
//               {segment.text}
//             </button>
//           );
//         }
//         return <span key={index}>{segment.text}</span>;
//       })}
//     </div>
//   );
// }
//
// // --- Example 3: Fetch and display messages with mentions ---
// async function fetchMessagesWithMentions(chatId: string) {
//   const response = await fetch(`/api/chats/${chatId}/messages`);
//   const messages = await response.json();
//
//   // Messages come with mentionedAgentIds and mentionedKnowledgeBaseIds
//   // You can use these to fetch entity details and reconstruct mentions
//
//   return messages.map((msg: any) => {
//     // You'd need to fetch agent/KB details separately
//     // or include them in the initial query via joins
//     return {
//       ...msg,
//       // Reconstruct mention objects from IDs if needed
//     };
//   });
// }
//
// // --- Example 4: Mention statistics component ---
// import { calculateMentionStats } from './mention-utils';
//
// interface MentionStatsProps {
//   messages: Array<{ mentionedAgentIds?: string[] }>;
//   agents: Array<{ id: string; name: string }>;
// }
//
// export function MentionStats({ messages, agents }: MentionStatsProps) {
//   const stats = calculateMentionStats(messages);
//   const agentMap = new Map(agents.map(a => [a.id, a.name]));
//
//   return (
//     <div className="p-4 bg-gray-50 rounded-lg">
//       <h3 className="font-semibold mb-3">Most Mentioned Agents</h3>
//       <div className="space-y-2">
//         {stats.slice(0, 5).map(({ agentId, mentionCount }) => (
//           <div key={agentId} className="flex items-center justify-between">
//             <span className="text-sm">@{agentMap.get(agentId)}</span>
//             <span className="text-xs text-gray-500">{mentionCount} mentions</span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
//
// // --- Example 5: Custom hook for mention handling ---
// export function useMentions(entities: MentionEntity[]) {
//   const [text, setText] = useState('');
//   const [parsedMentions, setParsedMentions] = useState<Mention[]>([]);
//
//   useEffect(() => {
//     // This would be done server-side in production
//     // But you can parse client-side for preview/validation
//     const parsed = parseMessageMentions(text, entities);
//     setParsedMentions(parsed.mentions);
//   }, [text, entities]);
//
//   const hasInvalidMentions = parsedMentions.length < extractRawMentions(text).length;
//
//   return {
//     text,
//     setText,
//     mentions: parsedMentions,
//     hasInvalidMentions,
//   };
// }
