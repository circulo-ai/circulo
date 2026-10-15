/** Surface authoritative deliverable identifiers even when the model omits them. */
export function appendArtifactReferences(
  output: string,
  records: Array<{ toolName: string; successful?: boolean; output?: unknown }>,
): string {
  const artifacts = new Map<string, string>();
  for (const record of records) {
    if (
      !record.successful ||
      !["createDocument", "readDocument"].includes(record.toolName)
    )
      continue;
    const value = record.output as
      | { id?: unknown; title?: unknown }
      | undefined;
    if (
      typeof value?.id !== "string" ||
      typeof value.title !== "string" ||
      output.includes(value.id)
    )
      continue;
    // Titles are untrusted document data, never executable Markdown.
    artifacts.set(
      value.id,
      value.title.replace(/[\r\n`*_\[\]<>]/g, " ").slice(0, 200),
    );
  }
  if (!artifacts.size) return output;
  return `${output}\n\nSaved documents:\n${[...artifacts].map(([id, title]) => `- ${title} — ID: \`${id.replace(/[`\r\n]/g, "")}\``).join("\n")}`;
}
