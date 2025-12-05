import { getActiveOrganizationId } from "@/lib/auth";
import { BadRequestError } from "@/lib/server/errors";

export async function resolveOrganizationId(
  activeOrganizationId?: string,
  request?: Request,
): Promise<string> {
  if (activeOrganizationId) return activeOrganizationId;

  try {
    return await getActiveOrganizationId(request);
  } catch {
    throw new BadRequestError("No active organization found");
  }
}
