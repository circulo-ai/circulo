import { getActiveOrganizationId } from "@/lib/auth";
import { BadRequestError } from "@/lib/server";

export async function resolveOrganizationId(
  activeOrganizationId?: string,
): Promise<string> {
  if (activeOrganizationId) return activeOrganizationId;

  try {
    return await getActiveOrganizationId();
  } catch {
    throw new BadRequestError("No active organization found");
  }
}
