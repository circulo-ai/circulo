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
            status: "streaming",
          }));
          break;

        case "data-title":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            title: delta.data,
            status: "streaming",
          }));
          break;

        case "data-kind":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            kind: delta.data,
            status: "streaming",
          }));
          break;

        case "data-clear":
          setArtifact((draftArtifact) => ({
            ...(draftArtifact ?? initialArtifactData),
            content: "",
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
