import { getEmailDomain } from "@/lib/urls/utils";

/**
 * Get the from email address using the email domain
 */
export function getFromEmailAddress(): string {
  // Use noreply@ with the email domain
  return `noreply@${getEmailDomain()}`;
}
