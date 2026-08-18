"use client";

import { artifactDefinitions } from "@/components/artifacts/artifact";
import {
  initialArtifactData,
  useArtifact,
} from "@/hooks/api/chats/use-artifact";
import { useEffect, useRef } from "react";
import { useDataStream } from "./data-stream-provider";

export function DataStreamHandler() {
  const { dataStream, setDataStream } = useDataStream();

  const { artifact, setArtifact, setMetadata } = useArtifact();
  const artifactKindRef = useRef(artifact.kind);

  useEffect(() => {
    artifactKindRef.current = artifact.kind;
  }, [artifact.kind]);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice();
    setDataStream([]);

    for (const delta of newDeltas) {
      // Data parts can arrive in the same batch. Keep the kind ref in sync
      // before routing the first content delta so code/sheet/image streams do
      // not get handled by the previous artifact definition.
      if (delta.type === "data-kind") {
        artifactKindRef.current = delta.data;
      }
      const artifactDefinition = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === artifactKindRef.current,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      switch (delta.type) {
        case "data-id":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            documentId: delta.data,
            error: undefined,
            isVisible: true,
            status: "streaming",
          }));
          break;

        case "data-title":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            error: undefined,
            title: delta.data,
            status: "streaming",
          }));
          break;

        case "data-kind":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            error: undefined,
            kind: delta.data,
            status: "streaming",
          }));
          break;

        case "data-clear":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            content: "",
            error: undefined,
            status: "streaming",
          }));
          break;

        case "data-finish":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            status: "idle",
          }));
          break;
      }
    }
  }, [dataStream, setArtifact, setMetadata, setDataStream]);

  return null;
}
