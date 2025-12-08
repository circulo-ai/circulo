import type { DrizzleSuggestionRepository } from "@/infrastructure/drizzle/suggestion-repository";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

export type ResolveSuggestionInput = { id: string; resolved: boolean };
export type ResolveSuggestionOutput = Result<void>;

export class ResolveSuggestion implements UseCase<
  ResolveSuggestionInput,
  ResolveSuggestionOutput
> {
  constructor(
    private readonly suggestions: DrizzleSuggestionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: ResolveSuggestionInput,
  ): Promise<ResolveSuggestionOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async () => {
      const suggestion = await this.suggestions.getById(
        Identifier.from(input.id),
      );
      if (!suggestion) throw new NotFoundError("Suggestion", input.id);
      input.resolved ? suggestion.resolve() : suggestion.reopen();
      await this.suggestions.save(suggestion);
      return Result.ok();
    });
  }
}
