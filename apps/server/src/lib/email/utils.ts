import { getEnv } from "@/lib/env";
import { getEmailDomain } from "@/lib/urls/utils";

/**
 * Get the from email address using the email domain
 */
export function getFromEmailAddress(): string {
  return getEnv("EMAIL_FROM_ADDRESS")?.trim() || `noreply@${getEmailDomain()}`;
}
