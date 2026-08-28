import { describe, expect, it } from "vitest";
import { formatJson, formatTable, renderOutput } from "../src/output/printer";

describe("CLI output printer", () => {
  it("formats structured JSON with stable indentation and bigint support", () => {
    expect(formatJson({ name: "orders", attempts: 2, sequence: 12n })).toBe([
      "{",
      '  "name": "orders",',
      '  "attempts": 2,',
      '  "sequence": "12n"',
      "}",
    ].join("\n"));
  });

  it("renders typed table values with headers and readable null markers", () => {
    const output = formatTable(
      [
        { key: "name", header: "Name" },
        { key: "status", header: "Status", align: "center" },
        { key: "attempts", header: "Attempts", align: "right" },
      ],
      [
        { name: "reserve", status: "ready", attempts: 2 },
        { name: "charge", status: null, attempts: undefined },
      ],
    );

    expect(output).toContain("Name");
    expect(output).toContain("Status");
    expect(output).toContain("Attempts");
    expect(output).toContain("reserve");
    expect(output).toContain("ready");
    expect(output).toContain("null");
    expect(output).toContain("—");
    expect(output).toContain("┌");
    expect(output).toContain("└");
  });

  it("renders empty tables and every output variant", () => {
    expect(formatTable([], [])).toBe("No results.");
    expect(formatTable([], [{ value: "ignored" }])).toBe("Results have no columns.");
    expect(renderOutput({ type: "text", value: "ready" })).toBe("ready");
    expect(renderOutput({ type: "lines", lines: ["one", "two"] })).toBe("one\ntwo");
    expect(renderOutput({ type: "json", value: { ok: true } })).toBe('{\n  "ok": true\n}');
    expect(renderOutput({ type: "table", columns: [], rows: [] })).toBe("No results.");
  });
});
