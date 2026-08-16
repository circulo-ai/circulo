import { getEnv } from "@/lib/env";

export const auth = {} as unknown;

export async function getSession() {
  try {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    if (!response.ok) return null;
    return response.json();
  } catch (_error) {
    return null;
  }
}

export function getBaseAuthUrl() {
  return getEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}
