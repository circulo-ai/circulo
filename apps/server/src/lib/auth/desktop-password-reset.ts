const DESKTOP_RESET_LINK_TTL_MS = 60 * 60 * 1000;
const MAX_STORED_RESET_LINKS = 100;

type StoredResetLink = {
  url: string;
  expiresAt: number;
};

const resetLinks = new Map<string, StoredResetLink>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function removeExpiredResetLinks(now: number) {
  for (const [email, entry] of resetLinks) {
    if (entry.expiresAt <= now) resetLinks.delete(email);
  }
}

/** Keep a short-lived reset URL in the desktop server's memory for local UI handoff. */
export function storeDesktopPasswordResetLink(email: string, url: string) {
  const now = Date.now();
  removeExpiredResetLinks(now);

  const key = normalizeEmail(email);
  if (!key) return;

  resetLinks.delete(key);
  resetLinks.set(key, {
    url,
    expiresAt: now + DESKTOP_RESET_LINK_TTL_MS,
  });

  while (resetLinks.size > MAX_STORED_RESET_LINKS) {
    const oldestEmail = resetLinks.keys().next().value;
    if (!oldestEmail) break;
    resetLinks.delete(oldestEmail);
  }
}

/** Consume a reset URL once; Better Auth validates and invalidates its token. */
export function consumeDesktopPasswordResetLink(email: string) {
  const now = Date.now();
  removeExpiredResetLinks(now);

  const key = normalizeEmail(email);
  const entry = resetLinks.get(key);
  if (!entry) return null;

  resetLinks.delete(key);
  return entry.url;
}
