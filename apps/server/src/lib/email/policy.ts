export type EmailType =
  | "transactional"
  | "marketing"
  | "updates"
  | "notifications";

export type SuppressibleEmailType = Exclude<EmailType, "transactional">;

export function normalizeRecipients(to: string | string[]): string[] {
  return [
    ...new Set(
      (Array.isArray(to) ? to : [to])
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  ];
}

export function isTransactionalEmail(emailType: EmailType): boolean {
  return emailType === "transactional";
}

/** Remove only recipients who opted out of a non-transactional category. */
export async function selectEmailRecipients(
  to: string | string[],
  emailType: EmailType,
  isSuppressed: (
    email: string,
    emailType: SuppressibleEmailType,
  ) => Promise<boolean>,
): Promise<string[]> {
  const recipients = normalizeRecipients(to);
  if (isTransactionalEmail(emailType)) return recipients;

  const eligible = await Promise.all(
    recipients.map(async (email) =>
      (await isSuppressed(email, emailType as SuppressibleEmailType))
        ? null
        : email,
    ),
  );
  return eligible.filter((email): email is string => Boolean(email));
}

export function buildUnsubscribeUrl(
  email: string,
  emailType: SuppressibleEmailType,
  token: string,
  appUrl: string,
): string {
  const url = new URL("/unsubscribe", appUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("token", token);
  url.searchParams.set("type", emailType);
  return url.toString();
}
