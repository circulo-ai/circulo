"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import {
	ArrowLeft,
	BookOpen,
	Check,
	FileText,
	Pencil,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

type KnowledgeBase = {
	id: string;
	name: string;
	description: string | null;
	documentCount: number;
};
type Document = {
	id: string;
	title: string;
	content: string;
	contentType: string;
	sourceKey: string | null;
	updatedAt?: string;
};
const emptyBase = { name: "", description: "" };
const emptyDocument = { title: "", content: "", sourceKey: "" };
const baseSchema = z.object({
	name: z.string().trim().min(1, "Name your knowledge base.").max(200),
	description: z.string().max(2000),
});
const documentSchema = z.object({
	title: z.string().trim().min(1, "Give the document a title.").max(300),
	content: z.string().trim().min(1, "Paste some reference text.").max(500_000),
	sourceKey: z.string().trim().max(1000),
});
const fetcher = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error("Unable to load knowledge bases");
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

export default function KnowledgePage() {
	const {
		data: bases,
		error,
		mutate,
	} = useSWR<KnowledgeBase[]>("/api/knowledge-bases", fetcher);
	const [selectedId, setSelectedId] = useState<string>();
	const activeId = selectedId ?? bases?.[0]?.id;
	const { data: documents, mutate: mutateDocuments } = useSWR<Document[]>(
		activeId ? `/api/knowledge-bases/${activeId}/documents` : null,
		fetcher,
	);
	const [baseForm, setBaseForm] = useState(emptyBase);
	const [documentForm, setDocumentForm] = useState(emptyDocument);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingDocument, setEditingDocument] = useState(emptyDocument);
	const [baseErrors, setBaseErrors] = useState<Record<string, string>>({});
	const [documentErrors, setDocumentErrors] = useState<Record<string, string>>(
		{},
	);
	const [search, setSearch] = useState("");
	const [saving, setSaving] = useState(false);
	const activeBase = bases?.find((base) => base.id === activeId);
	const filteredDocuments = useMemo(() => {
		const query = search.trim().toLowerCase();
		return (documents ?? []).filter(
			(document) =>
				!query ||
				`${document.title} ${document.content}`.toLowerCase().includes(query),
		);
	}, [documents, search]);

	const parseErrors = (result: {
		success: boolean;
		error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
	}) => {
		if (result.success) return {};
		return Object.fromEntries(
			result.error?.issues.map((issue) => [
				String(issue.path[0]),
				issue.message,
			]) ?? [],
		);
	};
	const createBase = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsed = baseSchema.safeParse(baseForm);
		if (!parsed.success) {
			setBaseErrors(parseErrors(parsed));
			return;
		}
		setBaseErrors({});
		setSaving(true);
		try {
			await request("/api/knowledge-bases", {
				method: "POST",
				body: JSON.stringify({
					name: parsed.data.name,
					description: parsed.data.description.trim() || null,
				}),
			});
			setBaseForm(emptyBase);
			await mutate();
			toast.success("Knowledge base created");
		} catch (createError) {
			toast.error(
				createError instanceof Error
					? createError.message
					: "Unable to create knowledge base",
			);
		} finally {
			setSaving(false);
		}
	};
	const deleteBase = async (id: string, name: string) => {
		if (!window.confirm(`Delete “${name}” and its documents?`)) return;
		try {
			await request(`/api/knowledge-bases/${id}`, { method: "DELETE" });
			if (selectedId === id) setSelectedId(undefined);
			await mutate();
			toast.success("Knowledge base deleted");
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: "Unable to delete knowledge base",
			);
		}
	};
	const addDocument = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!activeId) return;
		const parsed = documentSchema.safeParse(documentForm);
		if (!parsed.success) {
			setDocumentErrors(parseErrors(parsed));
			return;
		}
		setDocumentErrors({});
		setSaving(true);
		try {
			await request(`/api/knowledge-bases/${activeId}/documents`, {
				method: "POST",
				body: JSON.stringify(parsed.data),
			});
			setDocumentForm(emptyDocument);
			await Promise.all([mutateDocuments(), mutate()]);
			toast.success("Document added");
		} catch (documentError) {
			toast.error(
				documentError instanceof Error
					? documentError.message
					: "Unable to add document",
			);
		} finally {
			setSaving(false);
		}
	};
	const updateDocument = async (id: string) => {
		if (!activeId) return;
		const parsed = documentSchema.safeParse(editingDocument);
		if (!parsed.success) {
			toast.error(parsed.error.issues[0]?.message ?? "Document is invalid");
			return;
		}
		setSaving(true);
		try {
			await request(`/api/knowledge-bases/${activeId}/documents/${id}`, {
				method: "PATCH",
				body: JSON.stringify(parsed.data),
			});
			setEditingId(null);
			await mutateDocuments();
			toast.success("Document updated");
		} catch (updateError) {
			toast.error(
				updateError instanceof Error
					? updateError.message
					: "Unable to update document",
			);
		} finally {
			setSaving(false);
		}
	};
	const deleteDocument = async (id: string, title: string) => {
		if (!activeId || !window.confirm(`Delete “${title}”?`)) return;
		try {
			await request(`/api/knowledge-bases/${activeId}/documents/${id}`, {
				method: "DELETE",
			});
			await Promise.all([mutateDocuments(), mutate()]);
			toast.success("Document deleted");
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: "Unable to delete document",
			);
		}
	};

	return (
		<WorkspaceShell
			activeSection="knowledge"
			description="Organize durable sources that agents can use in the right chats."
			title="Knowledge"
		>
			{error && <p className="text-sm text-destructive">{error.message}</p>}
			<div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Knowledge bases</CardTitle>
						<CardDescription>
							{bases?.length ?? 0} workspace sources
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							{(bases ?? []).map((base) => (
								<div
									className={`flex items-start gap-2 rounded-xl border p-3 ${activeId === base.id ? "border-primary bg-muted/50" : ""}`}
									key={base.id}
								>
									<button
										className="min-w-0 flex-1 text-left"
										onClick={() => {
											setSelectedId(base.id);
											setSearch("");
										}}
										type="button"
									>
										<div className="truncate font-medium">{base.name}</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{base.documentCount} documents
										</div>
									</button>
									<Button
										aria-label={`Delete ${base.name}`}
										onClick={() => void deleteBase(base.id, base.name)}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							))}
						</div>
						{!bases?.length && (
							<Empty className="border border-dashed">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<BookOpen />
									</EmptyMedia>
									<EmptyTitle>No knowledge bases</EmptyTitle>
									<EmptyDescription>
										Create one to give agents durable reference material.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
						<form
							className="flex flex-col gap-4 border-t pt-4"
							onSubmit={createBase}
						>
							<FieldGroup>
								<Field data-invalid={Boolean(baseErrors.name)}>
									<FieldLabel htmlFor="base-name">Name</FieldLabel>
									<Input
										aria-invalid={Boolean(baseErrors.name)}
										id="base-name"
										onChange={(event) =>
											setBaseForm((current) => ({
												...current,
												name: event.target.value,
											}))
										}
										placeholder="Product handbook"
										value={baseForm.name}
									/>
									{baseErrors.name && (
										<FieldError>{baseErrors.name}</FieldError>
									)}
								</Field>
								<Field>
									<FieldLabel htmlFor="base-description">
										Description{" "}
										<span className="font-normal text-muted-foreground">
											(optional)
										</span>
									</FieldLabel>
									<Textarea
										id="base-description"
										onChange={(event) =>
											setBaseForm((current) => ({
												...current,
												description: event.target.value,
											}))
										}
										placeholder="What belongs here?"
										value={baseForm.description}
									/>
								</Field>
							</FieldGroup>
							<Button disabled={saving} type="submit">
								<Plus data-icon="inline-start" /> Create base
							</Button>
						</form>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle>
								{activeBase?.name ?? "Select a knowledge base"}
							</CardTitle>
							<CardDescription>
								{activeBase?.description ??
									"Documents in this base are available to enabled agents."}
							</CardDescription>
						</div>
						{activeId && (
							<div className="relative w-full sm:w-56">
								<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									aria-label="Search documents"
									className="pl-9"
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search documents"
									value={search}
								/>
							</div>
						)}
					</CardHeader>
					<CardContent className="flex flex-col gap-5">
						{activeId ? (
							<>
								<div className="flex flex-col gap-3">
									{filteredDocuments.map((document) => (
										<div className="rounded-xl border p-3" key={document.id}>
											{editingId === document.id ? (
												<div className="flex flex-col gap-3">
													<Input
														aria-label="Document title"
														onChange={(event) =>
															setEditingDocument((current) => ({
																...current,
																title: event.target.value,
															}))
														}
														value={editingDocument.title}
													/>
													<Textarea
														aria-label="Document content"
														className="min-h-40"
														onChange={(event) =>
															setEditingDocument((current) => ({
																...current,
																content: event.target.value,
															}))
														}
														value={editingDocument.content}
													/>
													<Input
														aria-label="Document source"
														onChange={(event) =>
															setEditingDocument((current) => ({
																...current,
																sourceKey: event.target.value,
															}))
														}
														placeholder="Source or URL (optional)"
														value={editingDocument.sourceKey}
													/>
													<div className="flex gap-2">
														<Button
															disabled={saving}
															onClick={() => void updateDocument(document.id)}
															size="sm"
														>
															<Check data-icon="inline-start" /> Save
														</Button>
														<Button
															onClick={() => setEditingId(null)}
															size="sm"
															variant="ghost"
														>
															<X data-icon="inline-start" /> Cancel
														</Button>
													</div>
												</div>
											) : (
												<div className="flex items-start gap-3">
													<FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
													<div className="min-w-0 flex-1">
														<div className="font-medium">{document.title}</div>
														{document.sourceKey && (
															<div className="text-xs text-muted-foreground">
																Source: {document.sourceKey}
															</div>
														)}
														<p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
															{document.content}
														</p>
													</div>
													<div className="flex shrink-0 gap-1">
														<Button
															aria-label={`Edit ${document.title}`}
															onClick={() => {
																setEditingId(document.id);
																setEditingDocument({
																	title: document.title,
																	content: document.content,
																	sourceKey: document.sourceKey ?? "",
																});
															}}
															size="icon"
															variant="ghost"
														>
															<Pencil className="size-4" />
														</Button>
														<Button
															aria-label={`Delete ${document.title}`}
															onClick={() =>
																void deleteDocument(document.id, document.title)
															}
															size="icon"
															variant="ghost"
														>
															<Trash2 className="size-4" />
														</Button>
													</div>
												</div>
											)}
										</div>
									))}
									{!filteredDocuments.length && (
										<Empty className="min-h-40 border border-dashed">
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<FileText />
												</EmptyMedia>
												<EmptyTitle>
													{search
														? "No matching documents"
														: "No documents yet"}
												</EmptyTitle>
												<EmptyDescription>
													{search
														? "Try a different search."
														: "Add a text document below to make this source useful."}
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									)}
								</div>
								<form
									className="flex flex-col gap-4 border-t pt-5"
									onSubmit={addDocument}
								>
									<FieldGroup>
										<Field data-invalid={Boolean(documentErrors.title)}>
											<FieldLabel htmlFor="document-title">
												Document title
											</FieldLabel>
											<Input
												aria-invalid={Boolean(documentErrors.title)}
												id="document-title"
												onChange={(event) =>
													setDocumentForm((current) => ({
														...current,
														title: event.target.value,
													}))
												}
												placeholder="Release process"
												value={documentForm.title}
											/>
											{documentErrors.title && (
												<FieldError>{documentErrors.title}</FieldError>
											)}
										</Field>
										<Field data-invalid={Boolean(documentErrors.content)}>
											<FieldLabel htmlFor="document-content">
												Reference text
											</FieldLabel>
											<Textarea
												aria-invalid={Boolean(documentErrors.content)}
												className="min-h-40"
												id="document-content"
												onChange={(event) =>
													setDocumentForm((current) => ({
														...current,
														content: event.target.value,
													}))
												}
												placeholder="Paste the source text here…"
												value={documentForm.content}
											/>
											{documentErrors.content && (
												<FieldError>{documentErrors.content}</FieldError>
											)}
										</Field>
										<Field>
											<FieldLabel htmlFor="document-source">
												Source or URL (optional)
											</FieldLabel>
											<Input
												id="document-source"
												onChange={(event) =>
													setDocumentForm((current) => ({
														...current,
														sourceKey: event.target.value,
													}))
												}
												placeholder="https://… or an internal source name"
												value={documentForm.sourceKey}
											/>
										</Field>
									</FieldGroup>
									<Button disabled={saving} type="submit">
										<Plus data-icon="inline-start" /> Add document
									</Button>
								</form>
							</>
						) : (
							<Empty className="min-h-64 border border-dashed">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<BookOpen />
									</EmptyMedia>
									<EmptyTitle>Select a knowledge base</EmptyTitle>
									<EmptyDescription>
										Create or select a base to manage its documents.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</CardContent>
				</Card>
			</div>
		</WorkspaceShell>
	);
}
