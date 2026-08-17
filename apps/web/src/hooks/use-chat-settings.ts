"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";

export type ChatSettings = {
  access: { currentUserId: string; canManageChat: boolean; canInviteMembers: boolean; canManageAgents: boolean; canManageKnowledge: boolean };
  chat: { id: string; title: string; description: string | null; instructions: string | null; visibility: "private" | "public"; orchestrationEnabled: boolean; knowledgeBaseIds: string[]; creatorId: string };
  members: Array<{ id: string; userId: string; role: string; canInvite: boolean; canManageAgents: boolean; canManageKnowledge: boolean; user: { id: string; name: string | null; email: string; image: string | null } | null }>;
  agents: Array<{ id: string; agentId: string; isEnabled: boolean; agent: { id: string; name: string; model: string; avatarUrl: string | null } }>;
};
export type AgentOption = { id: string; name: string; model: string; avatarUrl: string | null };
export type KnowledgeBaseOption = { id: string; name: string };
export type ChatSettingsForm = { title: string; description: string; instructions: string; visibility: "private" | "public"; orchestrationEnabled: boolean; knowledgeBaseIds: string[] };

const fetchSettings = async (url: string): Promise<ChatSettings> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load chat settings");
  const payload = (await response.json()) as Partial<ChatSettings>;
  return { ...(payload as ChatSettings), access: payload.access ?? { currentUserId: "", canManageChat: false, canInviteMembers: false, canManageAgents: false, canManageKnowledge: false } };
};
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) { const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null; throw new Error(body?.message ?? body?.error ?? "Request failed"); }
  return response.json();
}

export function useChatSettings(chatId: string) {
  const [open, setOpen] = useState(false);
  const { mutate: mutateAccess } = useSWRConfig();
  const { data, error, mutate } = useSWR(open ? `/api/chat/${chatId}/settings` : null, fetchSettings);
  const { data: agentData } = useSWR<AgentOption[]>(open ? "/api/agent?limit=100" : null, async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error("Unable to load agents"); const payload = (await response.json()) as { data?: AgentOption[] } | AgentOption[]; return Array.isArray(payload) ? payload : (payload.data ?? []); });
  const { data: knowledgeBaseData } = useSWR<KnowledgeBaseOption[]>(open ? "/api/knowledge-bases" : null, async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error("Unable to load knowledge bases"); return response.json() as Promise<KnowledgeBaseOption[]>; });
  const [form, setForm] = useState<ChatSettingsForm>({ title: "", description: "", instructions: "", visibility: "private", orchestrationEnabled: true, knowledgeBaseIds: [] });
  const [memberEmail, setMemberEmail] = useState("");
  const [agentId, setAgentId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ title: data.chat.title, description: data.chat.description ?? "", instructions: data.chat.instructions ?? "", visibility: data.chat.visibility, orchestrationEnabled: data.chat.orchestrationEnabled, knowledgeBaseIds: data.chat.knowledgeBaseIds ?? [] }); }, [data]);
  const save = async () => { setSaving(true); try { await request(`/api/chat/${chatId}/settings`, { method: "PATCH", body: JSON.stringify(data?.access.canManageChat ? { ...form, description: form.description || null, instructions: form.instructions || null } : { knowledgeBaseIds: form.knowledgeBaseIds }) }); await mutate(); toast.success("Chat settings saved"); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save settings"); } finally { setSaving(false); } };
  const addMember = async () => { if (!memberEmail.trim()) return; try { await request(`/api/chat/${chatId}/members`, { method: "POST", body: JSON.stringify({ email: memberEmail.trim() }) }); setMemberEmail(""); await mutate(); await mutateAccess(`/api/chat/${chatId}/members`); toast.success("Member added"); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to add member"); } };
  const removeMember = async (memberId: string) => { try { await request(`/api/chat/${chatId}/members/${memberId}`, { method: "DELETE" }); await mutate(); await mutateAccess(`/api/chat/${chatId}/members`); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to remove member"); } };
  const updateMember = async (memberId: string, changes: Record<string, unknown>) => { try { await request(`/api/chat/${chatId}/members/${memberId}`, { method: "PATCH", body: JSON.stringify(changes) }); await mutate(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update chat member"); } };
  const addAgent = async () => { if (!agentId) return; try { await request(`/api/chat/${chatId}/agent`, { method: "POST", body: JSON.stringify({ agentId }) }); setAgentId(""); await mutate(); toast.success("Agent added"); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to add agent"); } };
  const removeAgent = async (id: string) => { try { await request(`/api/chat/${chatId}/agent?agentId=${encodeURIComponent(id)}`, { method: "DELETE" }); await mutate(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to remove agent"); } };
  return { open, setOpen, data, error, form, setForm, agentData, knowledgeBaseData, memberEmail, setMemberEmail, agentId, setAgentId, saving, save, addMember, removeMember, updateMember, addAgent, removeAgent };
}
