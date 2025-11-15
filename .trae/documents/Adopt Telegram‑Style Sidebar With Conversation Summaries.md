## Overview
- Replace the current sidebar list with the existing Telegram-style components in `components/sidebar/telegram/*` so the UI matches Telegram.
- Add a backend endpoint that returns conversation summaries with the exact fields the Telegram tiles expect, including last message preview, timestamp, unread status, and attachment flag.
- Wire the new data into the app layout, preserve mobile behavior and user controls (new chat, delete all), and ensure navigation to `/chat/{id}` works.

## Frontend Changes
- Update `web/src/components/app-sidebar.tsx` to render Telegram-style content instead of `SidebarHistory`.
  - Replace the header/content with `telegram/SidebarHeader`, `telegram/SidebarContent`, and `telegram/FloatingActionButton`.
  - Fetch conversations via `useSWRInfinite` from the new `/api/conversations` endpoint; derive a `getConversationsPaginationKey` analogous to `getChatHistoryPaginationKey`.
  - Pass `onClick` for each conversation item to route to `/chat/{id}`; wire the X button to delete a chat (keeping parity with current delete action).
  - Preserve `SidebarProvider`/`Sidebar` primitives for mobile open/collapse and keep `UserButton` in the footer.
- Key references:
  - Current sidebar: `web/src/components/app-sidebar.tsx:57-119` (renders `SidebarHistory` at `web/src/components/app-sidebar.tsx:115-117`).
  - Telegram components available:
    - `web/src/components/sidebar/telegram/sidebar.tsx`
    - `web/src/components/sidebar/telegram/sidebar-content.tsx`
    - `web/src/components/sidebar/telegram/conversation-item.tsx`
    - `web/src/components/sidebar/telegram/collapsed-conversation-item.tsx`
    - `web/src/components/sidebar/telegram/sidebar-header.tsx`
    - `web/src/components/sidebar/telegram/floating-action-button.tsx`
    - `web/src/components/sidebar/telegram/types.ts`
- Timestamp display: add a tiny client formatter (today → time; earlier → date). No new library; simple `Intl.DateTimeFormat`.

## Backend Changes
- Add `GET /api/conversations` (`web/src/app/(chat)/api/conversations/route.ts`) returning paginated conversation summaries for the authenticated user.
- Implement `getConversationSummariesByUserId` in `web/src/db/queries.ts`:
  - Base: select chats for `creatorId` ordered by `createdAt` with keyset pagination like `getChatsByUserId` (`web/src/db/queries.ts:127-201`).
  - Join latest message per chat to populate `lastMessage` and `timestamp` using `message.createdAt` (`web/src/db/schema/chat.ts:271-343`). If no messages, fall back to chat `updatedAt` and empty preview.
  - Compute `hasAttachment` from latest message `attachments` non-empty.
  - Determine `unread` using `chat_member.unreadCount > 0` for the current user (`web/src/db/schema/chat.ts:106-149`).
  - Map fields to Telegram `Conversation`:
    - `id`: `chat.id`
    - `name`: `chat.title`
    - `avatar`: empty string (UI shows letter fallback)
    - `lastMessage`: latest message content trimmed
    - `timestamp`: ISO string of latest message or chat update (client formats)
    - `unread`: boolean from `chat_member.unreadCount`
    - `verified`: `chat.visibility === 'public'`
    - `hasAttachment`: boolean
    - `badges`: optional strings (`Public`, `Group`) derived from visibility/type
    - `type`: `'dm'` for `chat.type === 'direct'`, `'channel'` for `chat.type === 'group'`
  - Return `{ conversations: Conversation[], hasMore }` with the same `limit`, `starting_after`, `ending_before` query parameters as `/api/history` (`web/src/app/(chat)/api/history/route.ts:6-34`).

## Data Contract
- Endpoint: `GET /api/conversations?limit=10&starting_after=<chatId>&ending_before=<chatId>` → `{ conversations: Conversation[], hasMore: boolean }`.
- Conversation shape (matches `web/src/components/sidebar/telegram/types.ts`):
  - `id: string`
  - `name: string`
  - `avatar: string` (can be empty; client uses fallback initials)
  - `lastMessage: string`
  - `timestamp: string` (ISO; client formats)
  - `unread?: boolean`
  - `verified?: boolean`
  - `hasAttachment?: boolean`
  - `badges?: string[]`
  - `type: 'channel' | 'dm'`

## Integration & Navigation
- Replace SWR key for sidebar list to point at `/api/conversations`; trigger revalidation after sending/receiving messages and after delete/new chat, similar to current `mutate(unstable_serialize(getChatHistoryPaginationKey))`.
- On item click, navigate to `/chat/{id}`; preserve mobile behavior via `useSidebar()` to close on mobile.
- Wire the X button in `ConversationItem` to delete chat by calling `DELETE /api/chat?id=` then revalidate.

## UX Parity & Enhancements
- Keep existing footer `UserButton` and mobile sheet behavior.
- Preserve "New Chat" and "Delete All" actions (map New Chat to floating action; keep delete-all dialog from `AppSidebar`).
- Optional follow-ups (post-switch): implement search bar filter client-side; add unread-only tab from `chat_member.unreadCount`.

## Validation
- Manual verify in the chat layout: `web/src/app/(chat)/chat/layout.tsx:24-29` continues to wrap in `SidebarProvider` and renders the updated `AppSidebar` only when `session?.user`.
- Check that streaming `POST /api/chat` continues to `mutate` the conversation list on completion (matches existing behavior in `web/src/components/chat.tsx`).
- Confirm pagination works forward/backward with keyset parameters and that `hasMore` flips correctly.

## Rollback
- Keep the original `SidebarHistory` code; the change is isolated to `AppSidebar` and the new endpoint. Reverting is a one-file swap back to `SidebarHistory` and leaving `/api/conversations` unused.