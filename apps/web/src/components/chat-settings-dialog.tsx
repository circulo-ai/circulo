"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useChatSettings,
  type AgentOption,
  type ChatSettings,
  type ChatSettingsForm,
  type KnowledgeBaseOption,
  type ModelOption,
} from "@/hooks/use-chat-settings";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import {
  useActiveOrganization,
  useListTeamMembers,
  useListTeams,
} from "@better-auth-ui/react/plugins/organization";
import {
  Settings01Icon,
  UserAdd01Icon,
  UserGroupIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import {
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

type SetForm = Dispatch<SetStateAction<ChatSettingsForm>>;

export function ChatSettingsDialog({ chatId }: { chatId: string }) {
  const settings = useChatSettings(chatId);
  return (
    <>
      <Button
        aria-label="Chat settings"
        className="absolute top-3 right-3 z-20"
        onClick={() => settings.setOpen(true)}
        size="icon"
        title="Chat settings"
        variant="ghost"
      >
        <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
      </Button>
      <Sheet onOpenChange={settings.setOpen} open={settings.open}>
        <SheetContent
          className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl"
          side="right"
        >
          <SheetHeader className="shrink-0 border-b px-5 py-5 pr-14 sm:px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Chat settings
              {settings.data && (
                <span className="max-w-44 truncate rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {settings.data.chat.title}
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              Tune this conversation&apos;s defaults, access, and enabled tools.
            </SheetDescription>
          </SheetHeader>
          {settings.error ? (
            <Alert className="m-5 sm:m-6" variant="destructive">
              <AlertCircle />
              <AlertTitle>Settings unavailable</AlertTitle>
              <AlertDescription>{settings.error.message}</AlertDescription>
            </Alert>
          ) : !settings.data ? (
            <SettingsLoading />
          ) : (
            <Tabs className="min-h-0 flex-1 gap-0" defaultValue="conversation">
              <TabsList
                className="w-full shrink-0 rounded-none border-b px-4 py-0 sm:px-5"
                variant="line"
              >
                <TabsTrigger
                  className="min-w-0 px-1 text-xs sm:px-2 sm:text-sm"
                  value="conversation"
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={Settings01Icon}
                    strokeWidth={2}
                  />
                  Conversation
                </TabsTrigger>
                <TabsTrigger
                  className="min-w-0 px-1 text-xs sm:px-2 sm:text-sm"
                  value="access"
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={UserGroupIcon}
                    strokeWidth={2}
                  />
                  Access
                </TabsTrigger>
                <TabsTrigger
                  className="min-w-0 px-1 text-xs sm:px-2 sm:text-sm"
                  value="capabilities"
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={Wrench01Icon}
                    strokeWidth={2}
                  />
                  Capabilities
                </TabsTrigger>
              </TabsList>
              <TabsContent
                className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6"
                value="conversation"
              >
                <ConversationPanel
                  data={settings.data}
                  form={settings.form}
                  save={settings.save}
                  saving={settings.saving}
                  setForm={settings.setForm}
                />
              </TabsContent>
              <TabsContent
                className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6"
                value="access"
              >
                <AccessPanel
                  addMember={settings.addMember}
                  data={settings.data}
                  memberEmail={settings.memberEmail}
                  removeMember={settings.removeMember}
                  setMemberEmail={settings.setMemberEmail}
                  updateMember={settings.updateMember}
                />
              </TabsContent>
              <TabsContent
                className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6"
                value="capabilities"
              >
                <CapabilitiesPanel
                  addAgent={settings.addAgent}
                  agentData={settings.agentData}
                  agentId={settings.agentId}
                  data={settings.data}
                  form={settings.form}
                  knowledgeBaseData={settings.knowledgeBaseData}
                  modelData={settings.modelData}
                  removeAgent={settings.removeAgent}
                  save={settings.save}
                  setAgentId={settings.setAgentId}
                  setForm={settings.setForm}
                />
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 flex-1 rounded-xl" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}

function PanelCard({ children }: { children: ReactNode }) {
  return <Card>{children}</Card>;
}

function ConversationPanel({
  data,
  form,
  setForm,
  save,
  saving,
}: {
  data: ChatSettings;
  form: ChatSettingsForm;
  setForm: SetForm;
  save: () => Promise<void>;
  saving: boolean;
}) {
  const disabled = !data.access.canManageChat;
  return (
    <PanelCard>
      <CardHeader>
        <CardTitle>Conversation defaults</CardTitle>
        <CardDescription>
          These instructions and visibility rules apply to this chat only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="chat-settings-title">Chat title</FieldLabel>
            <FieldContent>
              <Input
                disabled={disabled}
                id="chat-settings-title"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Give this chat a clear name"
                value={form.title}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="chat-settings-description">
              Description
            </FieldLabel>
            <FieldContent>
              <Input
                disabled={disabled}
                id="chat-settings-description"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What is this conversation for?"
                value={form.description}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="chat-settings-instructions">
              Instructions
            </FieldLabel>
            <FieldContent>
              <Textarea
                className="min-h-32 resize-y"
                disabled={disabled}
                id="chat-settings-instructions"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
                placeholder="Rules, tone, and context for this chat"
                value={form.instructions}
              />
              <FieldDescription>
                These instructions guide agents whenever they participate in
                this conversation.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle>Orchestration</FieldTitle>
              <FieldDescription>
                Let enabled agents coordinate their work in this chat.
              </FieldDescription>
            </FieldContent>
            <Checkbox
              aria-label="Enable orchestration"
              checked={form.orchestrationEnabled}
              disabled={disabled}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  orchestrationEnabled: checked === true,
                }))
              }
            />
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle>Visibility</FieldTitle>
              <FieldDescription>
                Choose who can discover and open this chat.
              </FieldDescription>
            </FieldContent>
            <Select
              disabled={disabled}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  visibility: String(value) as "private" | "public",
                }))
              }
              value={form.visibility}
            >
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <div className="sticky bottom-0 mt-6 border-t bg-card/95 pt-4 backdrop-blur">
          <Button
            className="w-full sm:w-auto"
            disabled={saving || !data.access.canManageChat}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? "Saving…" : "Save conversation"}
          </Button>
        </div>
      </CardContent>
    </PanelCard>
  );
}

function AccessPanel({
  data,
  memberEmail,
  setMemberEmail,
  addMember,
  removeMember,
  updateMember,
}: {
  data: ChatSettings;
  memberEmail: string;
  setMemberEmail: (value: string) => void;
  addMember: (options?: {
    email?: string;
    userId?: string;
    role?: "admin" | "member";
  }) => Promise<boolean | undefined>;
  removeMember: (id: string) => Promise<void>;
  updateMember: (id: string, changes: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <PanelCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
          People in this chat
        </CardTitle>
        <CardDescription>
          Give people access to this conversation without changing their
          workspace role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.access.canInviteMembers && (
          <div className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-3 sm:flex-row">
            <Input
              className="min-w-0 flex-1 bg-background"
              type="email"
              onChange={(event) => setMemberEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addMember();
              }}
              placeholder="Add by workspace member email"
              value={memberEmail}
            />
            <Button
              className="shrink-0"
              disabled={!memberEmail.trim()}
              onClick={() => void addMember()}
            >
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
              Add member
            </Button>
          </div>
        )}
        {data.access.canInviteMembers && (
          <TeamAccessControls addMember={addMember} />
        )}
        <div className="flex flex-col gap-2">
          {data.members.map((member) => (
            <div
              className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={member.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {member.user?.name || member.user?.email || member.userId}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={member.role === "owner" ? "default" : "secondary"}
                  >
                    {member.role}
                  </Badge>
                  {member.canInvite && <Badge variant="outline">Invite</Badge>}
                  {member.canManageAgents && (
                    <Badge variant="outline">Agents</Badge>
                  )}
                  {member.canManageKnowledge && (
                    <Badge variant="outline">Knowledge</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {data.access.canManageChat && member.role !== "owner" && (
                  <>
                    <Select
                      onValueChange={(value) =>
                        void updateMember(member.id, { role: String(value) })
                      }
                      value={member.role}
                    >
                      <SelectTrigger
                        aria-label="Member role"
                        className="w-28"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <div className="hidden items-center gap-2 md:flex">
                      <Checkbox
                        aria-label={`Allow ${member.user?.name ?? "member"} to invite people`}
                        checked={member.canInvite}
                        onCheckedChange={(checked) =>
                          void updateMember(member.id, {
                            canInvite: checked === true,
                          })
                        }
                      />
                      <Checkbox
                        aria-label={`Allow ${member.user?.name ?? "member"} to manage agents`}
                        checked={member.canManageAgents}
                        onCheckedChange={(checked) =>
                          void updateMember(member.id, {
                            canManageAgents: checked === true,
                          })
                        }
                      />
                      <Checkbox
                        aria-label={`Allow ${member.user?.name ?? "member"} to manage knowledge`}
                        checked={member.canManageKnowledge}
                        onCheckedChange={(checked) =>
                          void updateMember(member.id, {
                            canManageKnowledge: checked === true,
                          })
                        }
                      />
                    </div>
                  </>
                )}
                {member.role !== "owner" &&
                  (data.access.canManageChat ||
                    member.userId === data.access.currentUserId) && (
                    <Button
                      onClick={() => void removeMember(member.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  )}
              </div>
            </div>
          ))}
          {data.members.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No one else has access to this chat yet.
            </p>
          )}
        </div>
      </CardContent>
    </PanelCard>
  );
}

function TeamAccessControls({
  addMember,
}: {
  addMember: (options?: {
    userId?: string;
    role?: "admin" | "member";
  }) => Promise<boolean | undefined>;
}) {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data: organization } = useActiveOrganization(authClient);
  const teams = useListTeams(authClient, {
    query: { organizationId: organization?.id },
    enabled: Boolean(organization?.id),
  });
  const [teamId, setTeamId] = useState("");
  const [adding, setAdding] = useState(false);
  const teamMembers = useListTeamMembers(authClient, { query: { teamId } });
  const selectedTeam = teams.data?.find(
    (team: { id: string }) => team.id === teamId,
  );

  const addTeam = async () => {
    if (!teamId || !teamMembers.data?.length) return;
    setAdding(true);
    try {
      const results = await Promise.all(
        teamMembers.data.map((member: { userId: string }) =>
          addMember({ userId: member.userId }),
        ),
      );
      const added = results.filter(Boolean).length;
      toast.success(
        `${added} ${added === 1 ? "person" : "people"} from ${selectedTeam?.name ?? "the team"} added`,
      );
      setTeamId("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-muted/20 p-3">
      <div className="mb-3">
        <p className="text-sm font-medium">Add a workspace team</p>
        <p className="text-xs text-muted-foreground">
          Add every current member of a team to this chat. Future team changes
          do not automatically change chat access.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="chat-settings-team">Team</FieldLabel>
          <Select
            value={teamId}
            onValueChange={(value) => setTeamId(value ?? "")}
          >
            <SelectTrigger id="chat-settings-team" className="w-full">
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(teams.data ?? []).map(
                  (team: { id: string; name: string }) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button
          disabled={!teamId || !teamMembers.data?.length || adding}
          onClick={() => void addTeam()}
        >
          {adding && <LoaderCircle className="animate-spin" />}
          Add team members
        </Button>
      </div>
      {teamId && !teamMembers.data?.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          This team has no members to add.
        </p>
      )}
    </div>
  );
}

function CapabilitiesPanel({
  data,
  form,
  setForm,
  knowledgeBaseData,
  modelData,
  agentData,
  agentId,
  setAgentId,
  addAgent,
  removeAgent,
  save,
}: {
  data: ChatSettings;
  form: ChatSettingsForm;
  setForm: SetForm;
  knowledgeBaseData?: KnowledgeBaseOption[];
  modelData?: ModelOption[];
  agentData?: AgentOption[];
  agentId: string;
  setAgentId: (value: string) => void;
  addAgent: () => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  save: () => Promise<void>;
}) {
  const availableAgents = (agentData ?? []).filter(
    (agent) => !data.agents.some((link) => link.agentId === agent.id),
  );
  const orchestrationAgents = agentData ?? [];
  const modelOptions = [
    ...(modelData ?? []),
    { id: form.orchestrationModel, name: form.orchestrationModel },
    {
      id: form.orchestrationFallbackModel,
      name: form.orchestrationFallbackModel,
    },
  ].filter(
    (model, index, models) =>
      model.id &&
      models.findIndex((candidate) => candidate.id === model.id) === index,
  );
  return (
    <div className="flex flex-col gap-4">
      <PanelCard>
        <CardHeader>
          <CardTitle>Orchestration controller</CardTitle>
          <CardDescription>
            Assign an agent to classify requests and plan execution. If none is
            assigned, the selected model performs orchestration. The fallback is
            always used when the primary controller fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Controller agent</FieldLabel>
            <FieldContent>
              <Select
                disabled={!data.access.canManageChat}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    orchestrationAgentId:
                      value === "none" ? null : String(value),
                  }))
                }
                value={form.orchestrationAgentId ?? "none"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use model controller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Use model controller</SelectItem>
                    {orchestrationAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} · {agent.model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                The assigned agent&apos;s instructions and model guide
                orchestration only; enabled agents still perform the work.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Orchestration model</FieldLabel>
            <FieldContent>
              <Select
                disabled={!data.access.canManageChat}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    orchestrationModel: String(value),
                  }))
                }
                value={form.orchestrationModel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose orchestration model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {modelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Fallback orchestration model</FieldLabel>
            <FieldContent>
              <Select
                disabled={!data.access.canManageChat}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    orchestrationFallbackModel: String(value),
                  }))
                }
                value={form.orchestrationFallbackModel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose fallback model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {modelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                This remains configured even when a controller agent is
                assigned.
              </FieldDescription>
            </FieldContent>
          </Field>
        </CardContent>
      </PanelCard>
      <PanelCard>
        <CardHeader>
          <CardTitle>Knowledge bases</CardTitle>
          <CardDescription>
            Select the sources available to this chat and its enabled agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(knowledgeBaseData ?? []).map((base) => (
            <label
              className="flex items-start gap-3 rounded-2xl border p-3 text-sm transition-colors has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
              key={base.id}
            >
              <Checkbox
                checked={form.knowledgeBaseIds.includes(base.id)}
                disabled={!data.access.canManageKnowledge}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    knowledgeBaseIds:
                      checked === true
                        ? [...current.knowledgeBaseIds, base.id]
                        : current.knowledgeBaseIds.filter(
                            (id) => id !== base.id,
                          ),
                  }))
                }
              />
              <span className="font-medium">{base.name}</span>
            </label>
          ))}
          {!knowledgeBaseData?.length && (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              Create a knowledge base from Workspace first.
            </p>
          )}
          <div className="sticky bottom-0 mt-2 border-t bg-card/95 pt-4 backdrop-blur">
            <Button
              className="w-full sm:w-auto"
              disabled={!data.access.canManageKnowledge}
              onClick={() => void save()}
            >
              <Save />
              Save knowledge access
            </Button>
          </div>
        </CardContent>
      </PanelCard>
      <PanelCard>
        <CardHeader>
          <CardTitle>Enabled agents</CardTitle>
          <CardDescription>
            Choose which workspace agents can participate in this chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.access.canManageAgents && (
            <div className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-3 sm:flex-row">
              <Select
                onValueChange={(value) => setAgentId(String(value))}
                value={agentId || null}
              >
                <SelectTrigger className="min-w-0 flex-1 bg-background">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} · {agent.model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                className="shrink-0"
                disabled={!agentId}
                onClick={() => void addAgent()}
              >
                Add agent
              </Button>
            </div>
          )}
          {data.agents.map((link) => (
            <div
              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
              key={link.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {link.agent.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {link.agent.model}
                </p>
              </div>
              {data.access.canManageAgents && (
                <Button
                  onClick={() => void removeAgent(link.agentId)}
                  size="sm"
                  variant="ghost"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {data.agents.length === 0 && (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              No agents are enabled for this conversation.
            </p>
          )}
        </CardContent>
      </PanelCard>
    </div>
  );
}
