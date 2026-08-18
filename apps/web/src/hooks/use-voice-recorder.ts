"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RECORDING_MIME_TYPES = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/wav", extension: "wav" },
] as const;

export function useVoiceRecorder({
  onRecordingComplete,
  onRecordingError,
}: {
  onRecordingComplete: (file: File) => void;
  onRecordingError?: (error: Error) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const ignoreNextStopRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (isRecordingRef.current || isStarting) return;

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const unsupportedError = new Error(
        "Voice recording is not supported in this browser.",
      );
      setError(unsupportedError);
      onRecordingError?.(unsupportedError);
      throw unsupportedError;
    }

    setIsStarting(true);
    setError(null);

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recordingFormat = RECORDING_MIME_TYPES.find(({ mimeType }) =>
        MediaRecorder.isTypeSupported(mimeType),
      );

      if (!recordingFormat) {
        throw new Error("No supported audio recording format is available.");
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: recordingFormat.mimeType,
      });
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      isRecordingRef.current = true;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        const recordingError = new Error("Voice recording failed.");
        setError(recordingError);
        isRecordingRef.current = false;
        setIsRecording(false);
        onRecordingError?.(recordingError);
      });
      recorder.addEventListener("stop", () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        isRecordingRef.current = false;
        setIsRecording(false);
        recorderRef.current = null;
        streamRef.current = null;
        if (ignoreNextStopRef.current) {
          ignoreNextStopRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: recordingFormat.mimeType });
        if (blob.size === 0) {
          const emptyRecordingError = new Error("No audio was recorded.");
          setError(emptyRecordingError);
          onRecordingError?.(emptyRecordingError);
          return;
        }

        onRecordingComplete(
          new File(
            [blob],
            `voice-${new Date().toISOString()}.${recordingFormat.extension}`,
            { type: recordingFormat.mimeType.split(";", 1)[0] },
          ),
        );
      });
      recorder.start();
      setIsRecording(true);
    } catch (caughtError) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      isRecordingRef.current = false;
      const recordingError =
        caughtError instanceof Error
          ? caughtError
          : new Error("Unable to start voice recording.");
      setError(recordingError);
      onRecordingError?.(recordingError);
      throw recordingError;
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, onRecordingComplete, onRecordingError]);

  useEffect(() => {
    return () => {
      ignoreNextStopRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      isRecordingRef.current = false;
    };
  }, []);

  return { error, isRecording, isStarting, start, stop };
}
