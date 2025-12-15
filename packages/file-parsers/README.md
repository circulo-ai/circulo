# @circulo-ai/file-parsers

Lightweight, promise-based parsers for common document types. The package detects the file type by extension, extracts UTF-8-safe text, and returns structured metadata so downstream pipelines can reason about the content (row counts, sheet names, page counts, headings, parsed JSON/YAML, etc.).

## Features at a glance

| Feature                  | Description                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Unified API              | `parseFile`, `parseBuffer`, and `isSupportedFileType` route to the right parser based on extension. |
| Broad format coverage    | pdf, csv, doc/docx, txt, md, xlsx/xls, html/htm, ppt/pptx, json, yaml/yml.                          |
| UTF-8 sanitization       | Control characters and invalid surrogates are removed before returning content.                     |
| Streaming for large CSVs | Reads in chunks with row sampling, error throttling, and preview truncation.                        |
| Structured metadata      | Each parser returns useful context (counts, headings, parsed objects, sheet names, etc.).           |
| Pluggable logging        | Pass any logger with `info`, `warn`, and `error` to trace parsing steps and errors.                 |
| Tree-shakable ESM        | Parsers are dynamically imported so dependencies only load when needed.                             |

## Supported formats

| Extension  | Notes                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| pdf        | Uses `pdf-parse` (function or class export); estimates page count when missing.          |
| csv        | Streams rows, samples first 100, previews first 1,000, and aborts after too many errors. |
| doc / docx | DOC via `officeparser`; DOCX via `mammoth`.                                              |
| txt / md   | Plain UTF-8 text passthrough with sanitization.                                          |
| xlsx / xls | Uses `xlsx`, dumps each sheet with CSV-like rows.                                        |
| ppt / pptx | Via `officeparser` text extraction.                                                      |
| html / htm | Via `cheerio`, returns full text plus title/headings metadata.                           |
| json       | Returns raw text plus parsed object.                                                     |
| yaml / yml | Returns raw text plus parsed object via `js-yaml`.                                       |

## Install

```bash
npm install @circulo-ai/file-parsers
# or
pnpm add @circulo-ai/file-parsers
# or
bun add @circulo-ai/file-parsers
```

## Quick start

```typescript
import { parseFile, parseBuffer, isSupportedFileType } from "@circulo-ai/file-parsers";

// Parse by path (extension auto-detected)
const pdfResult = await parseFile("docs/report.pdf");
console.log(pdfResult.content.slice(0, 200));
console.log(pdfResult.metadata);

// Parse a buffer (you must provide the extension)
const csvBuffer = await fs.promises.readFile("data/example.csv");
const csvResult = await parseBuffer(csvBuffer, "csv");

// Check support before parsing
if (!(await isSupportedFileType("pptx"))) {
  throw new Error("Unsupported");
}
```

## Using a custom logger

```typescript
import { createFileParser } from "@circulo-ai/file-parsers";
import pino from "pino";

const logger = pino({ level: "info" });
const parser = createFileParser({
  logger: {
    info: (...args) => logger.info(args),
    warn: (...args) => logger.warn(args),
    error: (...args) => logger.error(args),
  },
});

const result = await parser.parseFile("slides/talk.pptx");
```

## Direct parser classes (advanced)

```typescript
import { CsvParser, PdfParser } from "@circulo-ai/file-parsers";

const csv = new CsvParser();
const csvResult = await csv.parseFile("data/huge.csv");

const pdf = new PdfParser();
const pdfResult = await pdf.parseBuffer(myPdfBuffer);
```

## Behavior notes

* CSV streaming: chunk size 16KB; skips malformed rows; logs first few errors; truncates preview after 1,000 rows while keeping counts.
* Sanitization: sanitizeTextForUTF8 strips control chars, null bytes, replacement chars, and surrogate pairs to keep DB writes safe.
* Extension handling: extensions are lowercased; parseBuffer expects values like "pdf" not ".pdf".
* Error handling: missing files, empty buffers, and unsupported extensions throw descriptive errors; isSupportedFileType returns false on loader failures.
* Approximate token count: many parsers set tokenCount = Math.floor(characterCount / 4) as a quick LLM sizing heuristic.