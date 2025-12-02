export function camelToTitle(input: string): string {
  // Insert spaces between:
  // 1) lower/digit followed by upper (fooBar -> foo Bar, x1Y -> x1 Y)
  // 2) acronym followed by normal word (HTTPServer -> HTTP Server)
  const withSpaces = input
    .trim()
    .replace(/[_-]+/g, " ") // optional: treat _ and - as word separators
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Normalize whitespace and Title-Case each word
  return withSpaces
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
