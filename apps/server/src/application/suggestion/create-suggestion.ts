import { Suggestion } from "@/domain/suggestion/suggestion";
import type { DrizzleSuggestionRepository } from "@/infrastructure/drizzle/suggestion-repository";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

export type CreateSuggestionInput = {
  id: string;
  documentId: string;
  userId: string;
  originalText: string;
  suggestedText: string;
  description?: string | null;
};

export type CreateSuggestionOutput = Result<{ suggestionId: string }>;

export class CreateSuggestion implements UseCase<
  CreateSuggestionInput,
  CreateSuggestionOutput
> {
  constructor(
    private readonly suggestions: DrizzleSuggestionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateSuggestionInput): Promise<CreateSuggestionOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);
    const docCheck = Guard.isUuid(input.documentId, "documentId");
    if (!docCheck.succeeded) return Result.fail(docCheck.message);

    const originalCheck = Guard.againstEmptyString(
      input.originalText,
      "originalText",
    );
    if (!originalCheck.succeeded) return Result.fail(originalCheck.message);
    const suggestedCheck = Guard.againstEmptyString(
      input.suggestedText,
      "suggestedText",
    );
    if (!suggestedCheck.succeeded) return Result.fail(suggestedCheck.message);

    return this.uow.transaction(async () => {
      const suggestion = new Suggestion({
        id: Identifier.from(input.id),
        documentId: Identifier.from(input.documentId),
        userId: input.userId,
        originalText: input.originalText,
        suggestedText: input.suggestedText,
        description: input.description ?? null,
        isResolved: false,
        createdAt: new Date(),
      });
      await this.suggestions.save(suggestion);
      return Result.ok({ suggestionId: suggestion.getId().toString() });
    });
  }
}
