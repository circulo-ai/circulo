"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useVoiceRecorder({
  onRecordingComplete,
}: {
  onRecordingComplete: (file: File) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (isRecording) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecordingComplete(
        new File([blob], `voice-${new Date().toISOString()}.webm`, {
          type: mimeType,
        }),
      );
      chunksRef.current = [];
    });
    recorder.start();
    setIsRecording(true);
  }, [isRecording, onRecordingComplete]);

  useEffect(() => () => stop(), [stop]);

  return { isRecording, start, stop };
}
