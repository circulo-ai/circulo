"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { authClient } from "@/lib/auth-client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Search01Icon,
	ServerStack01Icon,
	Wrench01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type BuiltinPlugin = {
	id: string;
	type: "plugin";
	name: string;
	description: string;
	status: "active";
	capabilities: string[];
	tools: string[];
	integrationId?: string;
};

type McpIntegration = {
	id: string;
	name: string;
	description: string | null;
	endpoint: string;
	status: "draft" | "published" | "disabled";
	enabled: boolean;
	tools: Array<{
		id: string;
		name: string;
		enabled: boolean;
		approvalMode: string;
	}>;
};

type Skill = {
	id: string;
	name: string;
	description: string | null;
	sourceType: "manual" | "mcp";
	version: string;
	enabled: boolean;
	assignments: Array<{ id: string; scope: string; enabled: boolean }>;
};

type CapabilityResponse = {
	plugins: BuiltinPlugin[];
	mcps: McpIntegration[];
	skills: Skill[];
	counts: { plugins: number; apps: number; mcps: number; skills: number };
};

const skillSchema = z
	.object({
		name: z.string().trim().min(1, "Give the skill a name.").max(200),
		description: z.string().trim().max(1000),
		instructions: z
			.string()
			.trim()
			.min(1, "Add the instructions the agent should follow.")
			.max(50_000),
		scope: z.enum(["organization", "chat", "agent"]),
		targetId: z.string().trim(),
	})
	.superRefine((value, context) => {
		if (value.scope !== "organization" && !value.targetId) {
			context.addIssue({
				code: "custom",
				path: ["targetId"],
				message: `Add the ${value.scope} ID for this assignment.`,
			});
		}
	});

const fetcher = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error("Unable to load capabilities");
	return response.json();
};

async function request(url: string, init?: RequestInit) {
	const response = await fetch(url, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			message?: string;
			error?: string;
		} | null;
		throw new Error(payload?.message ?? payload?.error ?? "Request failed");
	}
	return response.json();
}

export default function PluginsPage() {
	const { data: organization } = authClient.useActiveOrganization();
	const { data, error, mutate } = useSWR<CapabilityResponse>(
		organization?.id ? "/api/capabilities" : null,
		fetcher,
	);
	const [search, setSearch] = useState("");
	const [skillDialogOpen, setSkillDialogOpen] = useState(false);
	const [skillForm, setSkillForm] = useState({
		name: "",
		description: "",
		instructions: "",
		scope: "organization" as "organization" | "chat" | "agent",
		targetId: "",
	});
	const [skillErrors, setSkillErrors] = useState<Record<string, string>>({});
	const [creatingSkill, setCreatingSkill] = useState(false);

	const filteredPlugins = useMemo(
		() =>
			(data?.plugins ?? []).filter((item) =>
				`${item.name} ${item.description}`
					.toLowerCase()
					.includes(search.toLowerCase()),
			),
		[data?.plugins, search],
	);
	const filteredMcps = useMemo(
		() =>
			(data?.mcps ?? []).filter((item) =>
				`${item.name} ${item.description ?? ""} ${item.endpoint}`
					.toLowerCase()
					.includes(search.toLowerCase()),
			),
		[data?.mcps, search],
	);
	const filteredSkills = useMemo(
		() =>
			(data?.skills ?? []).filter((item) =>
				`${item.name} ${item.description ?? ""}`
					.toLowerCase()
					.includes(search.toLowerCase()),
			),
		[data?.skills, search],
	);

	const toggleMcp = async (integration: McpIntegration, enabled: boolean) => {
		try {
			await request(`/api/automation/mcp/${integration.id}`, {
				method: "PATCH",
				body: JSON.stringify({ enabled }),
			});
			await mutate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update MCP server",
			);
		}
	};

	const toggleSkill = async (skill: Skill, enabled: boolean) => {
		try {
			await request(`/api/skills/${skill.id}`, {
				method: "PATCH",
				body: JSON.stringify({ enabled }),
			});
			await mutate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update skill",
			);
		}
	};

	const createSkill = async () => {
		const parsed = skillSchema.safeParse(skillForm);
		if (!parsed.success) {
			setSkillErrors(
				Object.fromEntries(
					parsed.error.issues.map((issue) => [
						String(issue.path[0]),
						issue.message,
					]),
				),
			);
			return;
		}
		setSkillErrors({});
		setCreatingSkill(true);
		try {
			const created = (await request("/api/skills", {
				method: "POST",
				body: JSON.stringify({
					name: parsed.data.name,
					description: parsed.data.description || null,
					instructions: parsed.data.instructions,
					sourceType: "manual",
				}),
			})) as { id: string };
			if (parsed.data.scope !== "organization") {
				await request(`/api/skills/${created.id}/assignments`, {
					method: "POST",
					body: JSON.stringify({
						scope: parsed.data.scope,
						...(parsed.data.scope === "chat"
							? { chatId: parsed.data.targetId }
							: { agentId: parsed.data.targetId }),
					}),
				});
			}
			await mutate();
			setSkillDialogOpen(false);
			setSkillForm({
				name: "",
				description: "",
				instructions: "",
				scope: "organization",
				targetId: "",
			});
			toast.success("Skill created and assigned");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to create skill",
			);
		} finally {
			setCreatingSkill(false);
		}
	};

	return (
		<>
			<WorkspaceShell
				activeSection="plugins"
				actions={
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button>Actions</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem asChild>
								<Link href="/workspace?section=tools">
									<HugeiconsIcon
										icon={ServerStack01Icon}
										data-icon="inline-start"
										strokeWidth={2}
									/>
									Connect MCP server
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setSkillDialogOpen(true)}>
								Create skill
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				}
				description="Manage capabilities that are genuinely available to Circulo agents and chats."
				title="Plugins"
			>
				<div className="flex flex-col gap-6">
					<Tabs defaultValue="plugins">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<TabsList>
								<TabsTrigger value="plugins">
									Plugins{" "}
									<span className="ml-1 text-muted-foreground">
										{data?.counts.plugins ?? 0}
									</span>
								</TabsTrigger>
								<TabsTrigger value="apps">
									Apps{" "}
									<span className="ml-1 text-muted-foreground">
										{data?.counts.apps ?? 0}
									</span>
								</TabsTrigger>
								<TabsTrigger value="mcps">
									MCPs{" "}
									<span className="ml-1 text-muted-foreground">
										{data?.counts.mcps ?? 0}
									</span>
								</TabsTrigger>
								<TabsTrigger value="skills">
									Skills{" "}
									<span className="ml-1 text-muted-foreground">
										{data?.counts.skills ?? 0}
									</span>
								</TabsTrigger>
							</TabsList>
							<div className="relative w-full sm:w-72">
								<HugeiconsIcon
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
									icon={Search01Icon}
									strokeWidth={2}
								/>
								<Input
									aria-label="Search capabilities"
									className="pl-9"
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search capabilities"
									value={search}
								/>
							</div>
						</div>
						{error && (
							<p className="text-sm text-destructive">{error.message}</p>
						)}
						<TabsContent value="plugins">
							<CapabilityList
								empty="No built-in or connected plugins match your search."
								items={filteredPlugins.map((item) => (
									<CapabilityRow
										key={item.id}
										description={item.description}
										label={item.name}
										meta={item.tools.join(", ")}
										state={<Badge variant="secondary">Built in</Badge>}
									/>
								))}
							/>
						</TabsContent>
						<TabsContent value="apps">
							<Empty className="min-h-56 border border-dashed">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<HugeiconsIcon icon={Wrench01Icon} />
									</EmptyMedia>
									<EmptyTitle>No connected apps</EmptyTitle>
									<EmptyDescription>
										Circulo currently exposes MCP servers as the external
										integration boundary. Apps will appear here when a real
										OAuth-backed connector is implemented.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</TabsContent>
						<TabsContent value="mcps">
							<CapabilityList
								empty="No MCP servers are connected."
								items={filteredMcps.map((integration) => (
									<CapabilityRow
										key={integration.id}
										description={
											integration.description ?? integration.endpoint
										}
										label={integration.name}
										meta={`${integration.status} · ${integration.tools.length} discovered tools`}
										state={
											<Switch
												aria-label={`Enable ${integration.name}`}
												checked={integration.enabled}
												disabled={integration.status !== "published"}
												onCheckedChange={(checked) =>
													void toggleMcp(integration, checked)
												}
											/>
										}
									/>
								))}
							/>
						</TabsContent>
						<TabsContent value="skills">
							<CapabilityList
								empty="No skills have been created or assigned yet."
								items={filteredSkills.map((skill) => (
									<CapabilityRow
										key={skill.id}
										description={skill.description ?? "No description"}
										label={skill.name}
										meta={`${skill.sourceType} · v${skill.version} · ${skill.assignments.length} assignments`}
										state={
											<Switch
												aria-label={`Enable ${skill.name}`}
												checked={skill.enabled}
												onCheckedChange={(checked) =>
													void toggleSkill(skill, checked)
												}
											/>
										}
									/>
								))}
							/>
						</TabsContent>
					</Tabs>
				</div>
			</WorkspaceShell>
			<Dialog onOpenChange={setSkillDialogOpen} open={skillDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create a skill</DialogTitle>
						<DialogDescription>
							Skills are versioned instruction bundles. They only affect chats
							or agents after an explicit assignment.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field data-invalid={Boolean(skillErrors.name)}>
							<FieldLabel htmlFor="skill-name">Name</FieldLabel>
							<Input
								aria-invalid={Boolean(skillErrors.name)}
								id="skill-name"
								onChange={(event) =>
									setSkillForm((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								value={skillForm.name}
							/>
							{skillErrors.name && <FieldError>{skillErrors.name}</FieldError>}
						</Field>
						<Field>
							<FieldLabel htmlFor="skill-description">Description</FieldLabel>
							<Input
								id="skill-description"
								onChange={(event) =>
									setSkillForm((current) => ({
										...current,
										description: event.target.value,
									}))
								}
								value={skillForm.description}
							/>
						</Field>
						<Field data-invalid={Boolean(skillErrors.instructions)}>
							<FieldLabel htmlFor="skill-instructions">Instructions</FieldLabel>
							<FieldDescription>
								Write the concrete operating rules the assigned agent should
								follow.
							</FieldDescription>
							<Textarea
								aria-invalid={Boolean(skillErrors.instructions)}
								id="skill-instructions"
								onChange={(event) =>
									setSkillForm((current) => ({
										...current,
										instructions: event.target.value,
									}))
								}
								value={skillForm.instructions}
							/>
							{skillErrors.instructions && (
								<FieldError>{skillErrors.instructions}</FieldError>
							)}
						</Field>
						<Field>
							<FieldLabel>Assignment scope</FieldLabel>
							<Select
								onValueChange={(value) =>
									setSkillForm((current) => ({
										...current,
										scope: value as typeof current.scope,
										targetId: "",
									}))
								}
								value={skillForm.scope}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="organization">
											Entire organization
										</SelectItem>
										<SelectItem value="chat">One chat</SelectItem>
										<SelectItem value="agent">One agent</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						{skillForm.scope !== "organization" && (
							<Field data-invalid={Boolean(skillErrors.targetId)}>
								<FieldLabel htmlFor="skill-target">
									{skillForm.scope === "chat" ? "Chat ID" : "Agent ID"}
								</FieldLabel>
								<Input
									aria-invalid={Boolean(skillErrors.targetId)}
									id="skill-target"
									onChange={(event) =>
										setSkillForm((current) => ({
											...current,
											targetId: event.target.value,
										}))
									}
									value={skillForm.targetId}
								/>
								{skillErrors.targetId && (
									<FieldError>{skillErrors.targetId}</FieldError>
								)}
							</Field>
						)}
					</FieldGroup>
					<DialogFooter>
						<Button onClick={() => setSkillDialogOpen(false)} variant="ghost">
							Cancel
						</Button>
						<Button disabled={creatingSkill} onClick={() => void createSkill()}>
							{creatingSkill ? "Creating…" : "Create skill"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function CapabilityList({
	items,
	empty,
}: {
	items: ReactNode[];
	empty: string;
}) {
	if (!items.length)
		return (
			<Empty className="min-h-56 border border-dashed">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={Wrench01Icon} />
					</EmptyMedia>
					<EmptyTitle>{empty}</EmptyTitle>
					<EmptyDescription>
						Only capabilities that are backed by Circulo runtime code appear
						here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	return <div className="divide-y rounded-xl border bg-card">{items}</div>;
}

function CapabilityRow({
	label,
	description,
	meta,
	state,
}: {
	label: string;
	description: string;
	meta: string;
	state: ReactNode;
}) {
	return (
		<div className="flex items-center gap-4 px-4 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
				<HugeiconsIcon icon={Wrench01Icon} strokeWidth={2} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{label}</p>
				<p className="truncate text-sm text-muted-foreground">{description}</p>
				<p className="mt-1 text-xs text-muted-foreground">{meta}</p>
			</div>
			<div className="shrink-0">{state}</div>
		</div>
	);
}
