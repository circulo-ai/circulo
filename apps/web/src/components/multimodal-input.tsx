"use client";

import {
	MentionItemType,
	PromptInput,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "@/components/icons/icons";
import { useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { attachmentFromUploadTask } from "@/lib/attachments";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { Agent, ChatAgent } from "@circulo-ai/db";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { AtSign, Mic, Square } from "lucide-react";
import {
	type ChangeEvent,
	type Dispatch,
	memo,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
	chatId,
	input,
	setInput,
	status,
	stop,
	attachments,
	setAttachments,
	messages,
	setMessages,
	sendMessage,
	className,
	selectedVisibilityType,
	usage,
}: {
	chatId: string;
	input: string;
	setInput: Dispatch<SetStateAction<string>>;
	status: UseChatHelpers<ChatMessage>["status"];
	stop: () => void;
	attachments: Attachment[];
	setAttachments: Dispatch<SetStateAction<Attachment[]>>;
	messages: UIMessage[];
	setMessages: UseChatHelpers<ChatMessage>["setMessages"];
	sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
	className?: string;
	selectedVisibilityType: VisibilityType;
	usage?: AppUsage;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { width } = useWindowSize();

	const adjustHeight = useCallback(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "44px";
		}
	}, []);

	useEffect(() => {
		if (textareaRef.current) {
			adjustHeight();
		}
	}, [adjustHeight]);

	const resetHeight = useCallback(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "44px";
		}
	}, []);

	const [localStorageInput, setLocalStorageInput] = useLocalStorage(
		"input",
		"",
	);

	useEffect(() => {
		if (textareaRef.current) {
			const domValue = textareaRef.current.value;
			// Prefer DOM value over localStorage to handle hydration
			const finalValue = domValue || localStorageInput || "";
			setInput(finalValue);
			adjustHeight();
		}
		// Only run once after hydration
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [adjustHeight, localStorageInput, setInput]);

	useEffect(() => {
		setLocalStorageInput(input);
	}, [input, setLocalStorageInput]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadManager = useUploadTaskManager({
		defaultStorageContext: "chat",
	});

	const [isReadingAttachments, setIsReadingAttachments] = useState(false);

	// Sync successful uploads into parent attachment state. Small files are also
	// carried as data URLs so the server can pass private local uploads to
	// OpenRouter without exposing a localhost-only URL to the provider.
	useEffect(() => {
		let active = true;
		const completedTasks = uploadManager.uploadTasks.filter(
			(task) => task.status === "success" && task.url,
		);
		setIsReadingAttachments(completedTasks.length > 0);
		void Promise.all(completedTasks.map(attachmentFromUploadTask)).then(
			(completedAttachments) => {
				if (!active) return;
				setAttachments((prev) => {
					const map = new Map(
						prev.map((attachment) => [attachment.url, attachment]),
					);
					completedAttachments.forEach((attachment) => {
						if (attachment) map.set(attachment.url, attachment);
					});
					return Array.from(map.values());
				});
				setIsReadingAttachments(false);
			},
		);
		return () => {
			active = false;
		};
	}, [uploadManager.uploadTasks, setAttachments]);

	const handleVoiceFile = useCallback(
		(file: File) => uploadManager.enqueueUploads([file], "chat"),
		[uploadManager],
	);
	const voiceRecorder = useVoiceRecorder({
		onRecordingComplete: handleVoiceFile,
	});

	const submitForm = useCallback(() => {
		window.history.pushState({}, "", `/chat/${chatId}`);

		sendMessage({
			role: "user",
			parts: [
				...attachments.map((attachment) => ({
					type: "file" as const,
					url: attachment.dataUrl ?? attachment.url,
					name: attachment.name,
					mediaType: attachment.contentType,
				})),
				{
					type: "text",
					text: input,
				},
			],
		});

		uploadManager.resetAllUploadTasks();
		setAttachments([]);
		setLocalStorageInput("");
		resetHeight();
		setInput("");

		if (width && width > 768) {
			textareaRef.current?.focus();
		}
	}, [
		input,
		setInput,
		attachments,
		sendMessage,
		uploadManager,
		setAttachments,
		setLocalStorageInput,
		width,
		chatId,
		resetHeight,
	]);

	const handleFileChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(event.target.files || []);
			if (files.length > 0) {
				uploadManager.enqueueUploads(files, "chat");
			}
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[uploadManager],
	);

	const handlePaste = useCallback(
		async (event: ClipboardEvent) => {
			const items = event.clipboardData?.items;
			if (!items) return;

			const imageItems = Array.from(items).filter((item) =>
				item.type.startsWith("image/"),
			);

			if (imageItems.length === 0) return;

			// Prevent default paste behavior for images
			event.preventDefault();

			const files: File[] = [];
			for (const item of imageItems) {
				const file = item.getAsFile();
				if (file) files.push(file);
			}
			if (files.length > 0) {
				uploadManager.enqueueUploads(files, "chat");
			}
		},
		[uploadManager],
	);

	// Add paste event listener to textarea
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		textarea.addEventListener("paste", handlePaste);
		return () => textarea.removeEventListener("paste", handlePaste);
	}, [handlePaste]);

	return (
		<div className={cn("relative flex w-full flex-col gap-4", className)}>
			{messages.length === 0 &&
				attachments.length === 0 &&
				uploadManager.uploadTasks.every(
					(task) =>
						task.status !== "queued" &&
						task.status !== "preparing" &&
						task.status !== "uploading",
				) && (
					<SuggestedActions
						chatId={chatId}
						selectedVisibilityType={selectedVisibilityType}
						sendMessage={sendMessage}
					/>
				)}

			<input
				className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
				multiple
				onChange={handleFileChange}
				ref={fileInputRef}
				tabIndex={-1}
				type="file"
			/>

			<PromptInput className="rounded-xl border border-border bg-sidebar p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (status === "submitted" || status === "streaming") {
							toast.error("Please wait for the model to finish its response!");
						} else {
							submitForm();
						}
					}}
					className="contents"
				>
					{(attachments.length > 0 ||
						uploadManager.uploadTasks.some(
							(item) =>
								item.status === "queued" ||
								item.status === "preparing" ||
								item.status === "uploading",
						)) && (
						<div
							className="flex flex-row items-end gap-2 overflow-x-scroll"
							data-testid="attachments-preview"
						>
							{attachments.map((attachment) => (
								<PreviewAttachment
									attachment={attachment}
									key={attachment.url}
									onRemove={() => {
										const match = uploadManager.uploadTasks.find(
											(item) => item.url === attachment.url,
										);
										if (match) {
											uploadManager.removeUploadTask(match.id);
										} else {
											setAttachments((current) =>
												current.filter((a) => a.url !== attachment.url),
											);
										}
										if (fileInputRef.current) {
											fileInputRef.current.value = "";
										}
									}}
								/>
							))}

							{uploadManager.uploadTasks
								.filter(
									(item) =>
										item.status === "queued" ||
										item.status === "preparing" ||
										item.status === "uploading",
								)
								.map((item) => (
									<PreviewAttachment
										attachment={{
											url: "",
											name: item.file.name,
											contentType: item.file.type,
										}}
										isUploading={true}
										key={item.id}
									/>
								))}
						</div>
					)}
					<div className="flex flex-row items-start gap-1 sm:gap-2">
						<PromptInputTextarea
							enableMentions
							enableCommands
							fetchMentions={async (query) => {
								const response = await fetch(`/api/chat/${chatId}/agent`);
								if (!response.ok) {
									return [];
								}

								const json = (await response.json()) as
									| Omit<ChatAgent & Agent, "agentId">[]
									| { agents?: Omit<ChatAgent & Agent, "agentId">[] }
									| {
											data?: { agents?: Omit<ChatAgent & Agent, "agentId">[] };
									  };
								const agents = Array.isArray(json)
									? json
									: (("agents" in json
											? json.agents
											: "data" in json
												? json.data?.agents
												: undefined) ?? []);

								return agents
									.filter((agent) => agent.isEnabled !== false)
									.filter((agent) =>
										`${agent.name} ${agent.id}`
											.toLowerCase()
											.includes(query.toLowerCase()),
									)
									.map((e) => {
										return {
											type: "mention",
											name: e.name,
											username: e.id,
											icon: <AtSign />,
										} satisfies MentionItemType;
									});
							}}
							autoFocus
							className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm ring-0 outline-none [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
							data-testid="multimodal-input"
							disableAutoResize={true}
							maxHeight={200}
							minHeight={44}
							onValueChange={setInput}
							placeholder="Send a message..."
							ref={textareaRef}
							value={input}
						/>{" "}
						{/*<Context {...contextProps} />*/}
					</div>
					<PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
						<PromptInputTools className="gap-0 sm:gap-0.5">
							<AttachmentsButton fileInputRef={fileInputRef} status={status} />
							<Button
								aria-label={
									voiceRecorder.isRecording ? "Stop recording" : "Record voice"
								}
								className={cn(
									"aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent",
									voiceRecorder.isRecording && "text-red-500",
								)}
								disabled={status === "submitted" || status === "streaming"}
								onClick={(event) => {
									event.preventDefault();
									if (voiceRecorder.isRecording) {
										voiceRecorder.stop();
									} else {
										void voiceRecorder
											.start()
											.catch(() =>
												toast.error(
													"Microphone permission is required to record voice.",
												),
											);
									}
								}}
								type="button"
								variant="ghost"
							>
								{voiceRecorder.isRecording ? (
									<Square size={14} />
								) : (
									<Mic size={14} />
								)}
							</Button>
							{/*<ModelSelectorCompact*/}
							{/*  onModelChange={onModelChange}*/}
							{/*  selectedModelId={selectedModelId}*/}
							{/*/>*/}
						</PromptInputTools>

						{status === "submitted" ? (
							<StopButton setMessages={setMessages} stop={stop} />
						) : (
							<PromptInputSubmit
								className="size-8 rounded-full bg-teal-50 text-background transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
								disabled={
									(input.trim().length === 0 && attachments.length === 0) ||
									isReadingAttachments ||
									voiceRecorder.isRecording ||
									uploadManager.uploadTasks.some(
										(item) =>
											item.status === "queued" ||
											item.status === "preparing" ||
											item.status === "uploading",
									)
								}
								status={status}
								data-testid="send-button"
							>
								<ArrowUpIcon size={14} />
							</PromptInputSubmit>
						)}
					</PromptInputToolbar>
				</form>
			</PromptInput>
		</div>
	);
}

export const MultimodalInput = memo(
	PureMultimodalInput,
	(prevProps, nextProps) => {
		if (prevProps.input !== nextProps.input) {
			return false;
		}
		if (prevProps.status !== nextProps.status) {
			return false;
		}
		if (!equal(prevProps.attachments, nextProps.attachments)) {
			return false;
		}
		if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
			return false;
		}

		return true;
	},
);

function PureAttachmentsButton({
	fileInputRef,
	status,
}: {
	fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
	status: UseChatHelpers<ChatMessage>["status"];
}) {
	return (
		<Button
			className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
			data-testid="attachments-button"
			disabled={status === "submitted" || status === "streaming"}
			onClick={(event) => {
				event.preventDefault();
				fileInputRef.current?.click();
			}}
			variant="ghost"
		>
			<PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
		</Button>
	);
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
	stop,
	setMessages,
}: {
	stop: () => void;
	setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
	return (
		<Button
			className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
			data-testid="stop-button"
			onClick={(event) => {
				event.preventDefault();
				stop();
				setMessages((messages) => messages);
			}}
		>
			<StopIcon size={14} />
		</Button>
	);
}

const StopButton = memo(PureStopButton);
