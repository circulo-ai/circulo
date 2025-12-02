"use server";

import { suggestionRepo } from "@/db/repositories";

export async function getSuggestions({ documentId }: { documentId: string }) {
  const suggestions = await suggestionRepo.findForDocument(documentId);
  return suggestions ?? [];
}
