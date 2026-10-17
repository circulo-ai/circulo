# Knowledge and memory indexing

Open **Knowledge** or **Memory**, then expand **Indexing & embeddings**. Workspace members can view settings. Changing them requires both knowledge and memory management permissions.

## Configuration

- Providers: OpenAI, OpenRouter, or automatic selection (OpenRouter, then OpenAI). Requests use the acting user's configured credential; the server's OpenRouter credential is a fallback when configured.
- Models: Text Embedding 3 Small and Text Embedding 3 Large. Both request 1,536 dimensions, matching the database's vector columns.
- Chunking: fixed length or paragraph boundaries, with a maximum of 256–12,000 characters and 0–2,000 characters of overlap. Overlap must be less than half the requested chunk size. UTF-8 input has an additional conservative token budget.
- Each passage has its own vector, ordinal, and source reference. Knowledge retrieval ranks matching passages and returns up to three passages per source. Memory retrieval combines lexical and semantic ranks with pinning and importance.
- Vector identity includes provider, model, dimensions, and endpoint identity. Incompatible vectors are excluded from semantic comparisons.

**Test connection** verifies a real provider response, including vector count, response ordering, dimensions, and finite, nonzero values. Testing and indexing can incur provider charges. Provider failures are shown in the interface; text search remains available. `CIRCULO_EMBEDDING_MODEL` seeds new workspace settings when it names one of the supported models; saved workspace settings take precedence afterward.

Saving changed settings clears semantic vectors atomically, preserving source documents and memories. Rebuild operations process bounded batches, retain completed work, and report individual failures. Rebuilding again retries pending sources. Knowledge rebuild requires knowledge management permission. Memory rebuild accesses the user's own memories and organization memories they can both read and manage; it does not index another user's personal memories.

Document edits invalidate old vectors and schedule indexing. Source and settings checks prevent stale background results from replacing newer content. Failed or interrupted indexing remains visible as pending and can be retried. The migration to passage vectors clears legacy averaged vectors; existing sources need a rebuild.

## File ingestion

The same parser facade is used for knowledge uploads and chat attachment context:

| Format                                       | Extraction                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| PDF                                          | Extractable text and page metadata                                          |
| DOCX / legacy DOC                            | Document body; legacy Word also includes headers and notes                  |
| PPTX / ODP / ODT                             | Office text, including presentation notes                                   |
| XLSX / XLS / ODS                             | Sheet names and cell values                                                 |
| CSV / TSV                                    | All rows within the text budget; malformed input produces an error          |
| JSON / YAML                                  | Validated source text and bounded structured metadata                       |
| HTML                                         | Text with script, style, and template content removed                       |
| Text, Markdown, source code, XML, TOML, logs | UTF-8 or BOM-marked UTF-16 text                                             |
| Raster images                                | Stored originals plus extraction using a configured vision-capable provider |

Files are limited to 25 MB for parsing and 500,000 extracted characters. Office archive expansion, spreadsheet ranges, structured metadata depth, and embedding batches have additional limits. Unsupported, encrypted, invalid, or oversized files produce actionable errors. Legacy `.ppt` must be converted to `.pptx`. Scanned PDFs without extractable text need OCR or image extraction; audio and video context depends on model support or an available transcript.

Uploads and parser support are aligned for code, TSV, and OpenDocument files. MIME aliases and empty browser MIME types are normalized before upload. Preview limits differ from ingestion limits and are disclosed in the preview interface.

Parser packages with native bindings and package-relative workers are staged with their dependencies in the server build. Spreadsheet ingestion and previews use the official [SheetJS 0.20.3 distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

PDF previews use a locally bundled [PDF.js renderer](https://mozilla.github.io/pdf.js/examples/) with page navigation and zoom, so they do not depend on a browser PDF plugin. Preview input is limited to 10 MB, rendering output is bounded, and PDF scripting is disabled. Desktop packaging checks that PDF and Office parser packages are included.

## Composer context

`@` opens grouped agent, tool, and file selection. Arrow keys, Home/End, Page Up/Down, Enter, Tab, and Escape manage selection. Picking a file adds its attachment; selecting an agent in a new chat adds that agent to the conversation. Structured mention metadata preserves stable identifiers behind readable handles.

`/` opens Summarize, Explain, Make a plan, and Compare. Commands expand into instructions in model context while preserving the original visible message. Inline spans distinguish commands, agents, tools, and files; the underlying textarea retains normal editing, selection, IME, and screen-reader behavior.
