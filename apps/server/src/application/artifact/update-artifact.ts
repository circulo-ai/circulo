import type { DrizzleArtifactRepository } from "@/infrastructure/drizzle/artifact-repository";
import {
  Guard,
  Identifier,
  NotFoundError,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

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
  constructor(
    private readonly artifacts: DrizzleArtifactRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: UpdateArtifactInput): Promise<UpdateArtifactOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    return this.uow.transaction(async () => {
      const artifact = await this.artifacts.getById(Identifier.from(input.id));
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

      await this.artifacts.save(artifact);
      return Result.ok();
    });
  }
}
