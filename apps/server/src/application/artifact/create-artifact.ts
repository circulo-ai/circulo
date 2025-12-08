import { Artifact } from "@/domain/artifact/artifact";
import type { DrizzleArtifactRepository } from "@/infrastructure/drizzle/artifact-repository";
import {
  Guard,
  Identifier,
  Result,
  type UnitOfWork,
  type UseCase,
} from "@circulo-ai/core";

export type CreateArtifactInput = {
  id: string;
  chatId?: string | null;
  userId: string;
  title: string;
  content?: string | null;
  kind: "text" | "code" | "image" | "sheet";
};

export type CreateArtifactOutput = Result<{ artifactId: string }>;

export class CreateArtifact implements UseCase<
  CreateArtifactInput,
  CreateArtifactOutput
> {
  constructor(
    private readonly artifacts: DrizzleArtifactRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: CreateArtifactInput): Promise<CreateArtifactOutput> {
    const idCheck = Guard.isUuid(input.id, "id");
    if (!idCheck.succeeded) return Result.fail(idCheck.message);

    const titleCheck = Guard.againstEmptyString(input.title, "title");
    if (!titleCheck.succeeded) return Result.fail(titleCheck.message);

    return this.uow.transaction(async () => {
      const artifact = new Artifact({
        id: Identifier.from(input.id),
        chatId: input.chatId ? Identifier.from(input.chatId) : null,
        userId: input.userId,
        title: input.title,
        content: input.content ?? null,
        kind: input.kind,
        version: 1,
        createdAt: new Date(),
      });
      await this.artifacts.save(artifact);
      return Result.ok({ artifactId: artifact.getId().toString() });
    });
  }
}
