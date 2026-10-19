import { createDrizzleRepositories } from "@/infrastructure/drizzle/repository-factory";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";
import type { DbInstance } from "@circulo-ai/db";

export type ResolveSuggestionInput = { id: string; resolved: boolean };
export type ResolveSuggestionOutput = Result<void>;

export class ResolveSuggestion implements UseCase<
  ResolveSuggestionInput,
  ResolveSuggestionOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(
    input: ResolveSuggestionInput,
  ): Promise<ResolveSuggestionOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { suggestion: suggestions } = createDrizzleRepositories(
        scope.client,
      );
      const suggestion = await suggestions.getById(Identifier.from(input.id));
      if (!suggestion) throw new NotFoundError("Suggestion", input.id);
      input.resolved ? suggestion.resolve() : suggestion.reopen();
      await suggestions.save(suggestion);
      return Result.ok();
    });
  }
}
