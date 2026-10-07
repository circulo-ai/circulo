import Table from "cli-table3";

export type CliTableValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined;

export interface CliTableColumn {
  readonly key: string;
  readonly header: string;
  readonly align?: "left" | "center" | "right";
  readonly width?: number;
}

export type CliTableRow = Readonly<Record<string, CliTableValue>>;

export type CliOutput =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "lines"; readonly lines: readonly string[] }
  | { readonly type: "json"; readonly value: unknown; readonly indent?: number }
  | {
      readonly type: "table";
      readonly columns: readonly CliTableColumn[];
      readonly rows: readonly CliTableRow[];
    };

export function renderOutput(output: CliOutput): string {
  switch (output.type) {
    case "text":
      return output.value;
    case "lines":
      return output.lines.join("\n");
    case "json":
      return formatJson(output.value, output.indent ?? 2);
    case "table":
      return formatTable(output.columns, output.rows);
  }
}

export function formatJson(value: unknown, indent = 2): string {
  const normalizedIndent = Math.max(0, Math.min(10, Math.trunc(indent)));
  const serialized = JSON.stringify(
    value,
    (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? `${nestedValue}n` : nestedValue,
    normalizedIndent,
  );
  return serialized ?? "null";
}

export function formatTable(
  columns: readonly CliTableColumn[],
  rows: readonly CliTableRow[],
): string {
  if (columns.length === 0)
    return rows.length === 0 ? "No results." : "Results have no columns.";

  const table = new Table({
    head: columns.map((column) => column.header),
    colAligns: columns.map((column) => column.align ?? "left"),
    ...(columns.every((column) => column.width !== undefined)
      ? { colWidths: columns.map((column) => column.width as number) }
      : {}),
    truncate: "…",
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(columns.map((column) => formatTableValue(row[column.key])));
  }
  return rows.length === 0
    ? `${table.toString()}\n(no results)`
    : table.toString();
}

function formatTableValue(value: CliTableValue): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  return String(value);
}
