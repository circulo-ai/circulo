import { getActiveOrganizationId } from "@/lib/auth";
import { BadRequestError } from "@circulo-ai/types";

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
