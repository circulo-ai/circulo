import { beforeEach, expect, it, vi } from "vitest";
import { readDocument } from "./read-document";
const fixture = vi.hoisted(() => ({
  byId: vi.fn(),
  select: vi.fn(),
  matches: [] as any[],
}));
vi.mock("@/db/repositories", () => ({
  artifactRepo: { getDocumentById: fixture.byId },
}));
vi.mock("@/db", async () => {
  const schema = await import("@circulo-ai/db/schema");
  return { ...schema, db: { select: fixture.select } };
});
beforeEach(() => {
  fixture.byId.mockReset();
  fixture.matches = [];
  fixture.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => fixture.matches }) }),
  }));
});
const call = { toolCallId: "read", messages: [], context: {} };
it("resolves an exact title in the acting chat and returns authoritative ID and content", async () => {
  fixture.matches = [
    {
      id: "saved",
      title: "Report",
      chatId: "chat",
      userId: "owner",
      kind: "text",
      content: "Verified draft",
    },
  ];
  const tool = readDocument({ userId: "reader", chatId: "chat" });
  await expect(
    tool.execute!({ title: "Report", offset: 0, length: 256 }, call),
  ).resolves.toMatchObject({ id: "saved", content: "Verified draft" });
});
it("rejects a document ID outside the user's ownership and authorized chat", async () => {
  fixture.byId.mockResolvedValue({
    id: "foreign",
    userId: "other",
    chatId: "other-chat",
  });
  await expect(
    readDocument({ userId: "reader", chatId: "chat" }).execute!(
      { id: "foreign", offset: 0, length: 256 },
      call,
    ),
  ).rejects.toThrow("not accessible");
});
it("does not guess between documents with the same exact title", async () => {
  fixture.matches = [{ id: "one" }, { id: "two" }];
  await expect(
    readDocument({ userId: "reader", chatId: "chat" }).execute!(
      { title: "Report", offset: 0, length: 256 },
      call,
    ),
  ).rejects.toThrow("More than one document");
});
