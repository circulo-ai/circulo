import { codeToTokens } from "shiki";
import { expect, it } from "vitest";
import { CHAT_CODE_THEMES } from "./code-theme";

function luminance(hex: string) {
  const full =
    hex.length === 4
      ? `#${[...hex.slice(1)].map((channel) => channel.repeat(2)).join("")}`
      : hex;
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

for (const [index, theme] of CHAT_CODE_THEMES.entries()) {
  it(`keeps syntax, comments, and strings readable in ${theme}`, async () => {
    const result = await codeToTokens(
      '// Explain the request\nimport { auth } from "./auth";\nconst enabled = true;\nawait auth.signIn({ email: "example@example.com", count: 42 });',
      { lang: "typescript", theme },
    );
    // The dark card is the lighter of the opaque dark reading surfaces.
    const background = luminance(index === 0 ? "#ffffff" : "#171717");
    for (const token of result.tokens.flat()) {
      if (!token.content.trim()) continue;
      const foreground = luminance(token.color ?? result.fg!);
      const ratio =
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05);
      expect(ratio, `${theme}: ${token.content}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
