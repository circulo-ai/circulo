"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RECORDING_MIME_TYPES = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/wav", extension: "wav" },
] as const;

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
};
type SpeechRecognitionErrorEvent = Event & { error: string };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognition(): BrowserSpeechRecognition | undefined {
  if (typeof window === "undefined") return undefined;

  const browserWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Constructor =
    browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;

  return Constructor ? new Constructor() : undefined;
}

export function useVoiceRecorder({
  onRecordingComplete,
  onRecordingError,
}: {
  onRecordingComplete: (file: File, transcript?: string) => void;
  onRecordingError?: (error: Error) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const finalizeTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const discardRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current !== null) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback((preserveResults = false) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setIsTranscribing(false);
    if (!recognition) return;

    if (!preserveResults) recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // The browser may already have ended recognition.
    }
  }, []);

  const resetRecordingState = useCallback(() => {
    clearFinalizeTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    startedAtRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsTranscribing(false);
    setInterimTranscript("");
    setElapsedSeconds(0);
  }, [clearFinalizeTimer]);

  const finishRecording = useCallback(
    (recordingFormat: { mimeType: string; extension: string }) => {
      if (discardRef.current) {
        chunksRef.current = [];
        resetRecordingState();
        return;
      }

      const chunks = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(chunks, { type: recordingFormat.mimeType });
      const recordedTranscript = transcriptRef.current.trim() || undefined;
      resetRecordingState();

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
        recordedTranscript,
      );
    },
    [onRecordingComplete, onRecordingError, resetRecordingState],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const recordingFormat = RECORDING_MIME_TYPES.find(
      ({ mimeType }) => mimeType === recorder.mimeType,
    ) ?? { mimeType: recorder.mimeType, extension: "webm" };
    recorder.stop();
    stopRecognition(true);
    // Let the browser deliver the final recognition result before reading the
    // transcript. Speech recognition events are asynchronous on stop.
    finalizeTimerRef.current = window.setTimeout(
      () => finishRecording(recordingFormat),
      160,
    );
  }, [finishRecording, stopRecognition]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stopRecognition();
    clearFinalizeTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // The browser may already be stopping the recorder.
      }
    }
    chunksRef.current = [];
    transcriptRef.current = "";
    setTranscript("");
    resetRecordingState();
    discardRef.current = false;
  }, [clearFinalizeTimer, resetRecordingState, stopRecognition]);

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
    setTranscript("");
    setInterimTranscript("");
    transcriptRef.current = "";
    discardRef.current = false;

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
      startedAtRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        const recordingError = new Error("Voice recording failed.");
        setError(recordingError);
        stopRecognition();
        resetRecordingState();
        onRecordingError?.(recordingError);
      });
      recorder.addEventListener("stop", () => {
        if (discardRef.current || finalizeTimerRef.current !== null) return;
        finalizeTimerRef.current = window.setTimeout(
          () => finishRecording(recordingFormat),
          160,
        );
      });

      const recognition = getSpeechRecognition();
      if (recognition) {
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        recognition.onresult = (event) => {
          let interim = "";
          for (
            let index = event.resultIndex;
            index < event.results.length;
            index += 1
          ) {
            const result = event.results[index];
            const text = result[0]?.transcript ?? "";
            if (result.isFinal) {
              transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
              setTranscript(transcriptRef.current);
            } else {
              interim += text;
            }
          }
          setInterimTranscript(interim.trim());
        };
        recognition.onerror = (event) => {
          setIsTranscribing(false);
          if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed"
          ) {
            return;
          }
        };
        recognition.onend = () => setIsTranscribing(false);
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setIsTranscribing(true);
        } catch {
          recognitionRef.current = null;
        }
      }

      recorder.start();
      setIsRecording(true);
    } catch (caughtError) {
      stream?.getTracks().forEach((track) => track.stop());
      stopRecognition();
      resetRecordingState();
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
  }, [
    finishRecording,
    isStarting,
    onRecordingError,
    resetRecordingState,
    stopRecognition,
  ]);

  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(
        startedAtRef.current
          ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
          : 0,
      );
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      discardRef.current = true;
      stopRecognition();
      clearFinalizeTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearFinalizeTimer, stopRecognition]);

  return {
    cancel,
    elapsedSeconds,
    error,
    interimTranscript,
    isRecording,
    isStarting,
    isTranscribing,
    start,
    stop,
    transcript,
  };
}
