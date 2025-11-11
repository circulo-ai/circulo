// JSON-safe value shape compatible with AI SDK JSONValue
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

// Usage payload written to UI data stream must be JSON-serializable
export type AppUsage = Record<string, JSONValue>;