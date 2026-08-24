import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  normalizeRecipients,
  selectEmailRecipients,
} from "./policy";

describe("mailer recipient policy", () => {
  it("normalizes and de-duplicates recipients", () => {
    expect(
      normalizeRecipients([" first@example.com ", "first@example.com", ""]),
    ).toEqual(["first@example.com"]);
  });

  it("keeps transactional recipients regardless of preferences", async () => {
    const recipients = await selectEmailRecipients(
      ["first@example.com", "second@example.com"],
      "transactional",
      async () => true,
    );

    expect(recipients).toEqual(["first@example.com", "second@example.com"]);
  });

  it("filters only opted-out recipients from non-transactional mail", async () => {
    const recipients = await selectEmailRecipients(
      ["first@example.com", "second@example.com"],
      "notifications",
      async (email) => email === "first@example.com",
    );

    expect(recipients).toEqual(["second@example.com"]);
  });

  it("builds a frontend unsubscribe URL with a signed token", () => {
    const url = new URL(
      buildUnsubscribeUrl(
        "first@example.com",
        "updates",
        "signed-token",
        "https://app.example.com",
      ),
    );

    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/unsubscribe");
    expect(url.searchParams.get("email")).toBe("first@example.com");
    expect(url.searchParams.get("token")).toBe("signed-token");
    expect(url.searchParams.get("type")).toBe("updates");
  });
});
