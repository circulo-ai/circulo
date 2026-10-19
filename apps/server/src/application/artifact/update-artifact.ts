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

export type UpdateArtifactInput = {
  id: string;
  title?: string;
  content?: string | null;
  bumpVersion?: boolean;
};

export type UpdateArtifactOutput = Result<void>;

export class UpdateArtifact implements UseCase<
  UpdateArtifactInput,
  UpdateArtifactOutput
> {
  constructor(private readonly uow: UnitOfWork<{ client: DbInstance }>) {}

  async execute(input: UpdateArtifactInput): Promise<UpdateArtifactOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async (scope) => {
      const { artifact: artifacts } = createDrizzleRepositories(scope.client);
      const artifact = await artifacts.getById(Identifier.from(input.id));
      if (!artifact) throw new NotFoundError("Artifact", input.id);

      if (input.title !== undefined) {
        if (!input.title.trim()) return Result.fail("Title cannot be empty");
        artifact.rename(input.title);
      }
      if (input.content !== undefined) {
        artifact.updateContent(input.content ?? null);
      }
      if (input.bumpVersion) {
        artifact.bumpVersion();
      }

      await artifacts.save(artifact);
      return Result.ok();
    });
  }
}
