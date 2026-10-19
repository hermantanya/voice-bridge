import WebSocket from "ws";

const REALTIME_TRANSCRIPTION_URL =
  "wss://api.openai.com/v1/realtime?intent=transcription";

const EV_DELTA = "conversation.item.input_audio_transcription.delta";
const EV_DONE = "conversation.item.input_audio_transcription.completed";

export type RealtimeTranscriptionHandlers = {
  onDelta?: (delta: string, accumulated: string) => void;
  onError?: (message: string) => void;
};

export type RealtimeTranscriptionSession = {
  appendPcm16Base64: (audioBase64: string) => void;
  finalize: () => Promise<string>;
  close: () => void;
  ready: Promise<void>;
};

export type RealtimeTranscriptionSessionFactory = (
  apiKey: string,
  handlers: RealtimeTranscriptionHandlers,
  sourceLangHint?: string,
) => RealtimeTranscriptionSession;

function buildSessionUpdate(language?: string): object {
  const transcription: Record<string, string> = {
    model: process.env.STREAMING_PTT_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe",
  };
  if (language) {
    transcription.language = language;
  }

  return {
    type: "transcription_session.update",
    session: {
      input_audio_format: "pcm16",
      turn_detection: null,
      input_audio_transcription: transcription,
    },
  };
}

export function createOpenAIRealtimeTranscriptionSession(
  apiKey: string,
  handlers: RealtimeTranscriptionHandlers,
  sourceLangHint?: string,
): RealtimeTranscriptionSession {
  let accumulated = "";
  let finalResolve: ((text: string) => void) | null = null;
  let finalReject: ((error: Error) => void) | null = null;
  let closed = false;

  const ws = new WebSocket(REALTIME_TRANSCRIPTION_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  const ready = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      handlers.onError?.(error.message);
      reject(error);
    };

    ws.once("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    ws.once("open", () => {
      ws.send(JSON.stringify(buildSessionUpdate(sourceLangHint)));
    });

    ws.on("message", (data) => {
      let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
      try {
        event = JSON.parse(data.toString()) as typeof event;
      } catch {
        return;
      }

      if (event.type === "error") {
        const message = event.error?.message ?? "Realtime transcription error";
        handlers.onError?.(message);
        if (finalReject) {
          finalReject(new Error(message));
          finalReject = null;
          finalResolve = null;
        }
        return;
      }

      if (
        event.type === "transcription_session.updated" ||
        event.type === "session.updated" ||
        event.type === "transcription_session.created"
      ) {
        resolve();
        return;
      }

      if (event.type === EV_DELTA && event.delta) {
        accumulated += event.delta;
        handlers.onDelta?.(event.delta, accumulated);
        return;
      }

      if (event.type === EV_DONE) {
        const transcript = (event.transcript ?? accumulated).trim();
        accumulated = transcript || accumulated;
        if (finalResolve) {
          finalResolve(accumulated.trim());
          finalResolve = null;
          finalReject = null;
        }
      }
    });
  });

  return {
    ready,
    appendPcm16Base64(audioBase64: string) {
      if (closed || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: audioBase64,
        }),
      );
    },
    finalize() {
      return new Promise<string>((resolve, reject) => {
        if (closed) {
          resolve(accumulated.trim());
          return;
        }

        finalResolve = resolve;
        finalReject = reject;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } else {
          reject(new Error("Realtime transcription socket not open"));
        }

        setTimeout(() => {
          if (finalResolve) {
            const text = accumulated.trim();
            finalResolve = null;
            finalReject = null;
            resolve(text);
          }
        }, 8_000);
      });
    },
    close() {
      closed = true;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}

/** In-memory session for unit/integration tests (no OpenAI network). */
export function createMockRealtimeTranscriptionSession(
  handlers: RealtimeTranscriptionHandlers,
): RealtimeTranscriptionSession {
  let accumulated = "";
  let closed = false;

  return {
    ready: Promise.resolve(),
    appendPcm16Base64(_audioBase64: string) {
      if (closed) {
        return;
      }
      const delta = "hello ";
      accumulated += delta;
      handlers.onDelta?.(delta, accumulated);
    },
    async finalize() {
      if (!accumulated.trim()) {
        accumulated = "hello world";
      }
      return accumulated.trim();
    },
    close() {
      closed = true;
    },
  };
}

export function getDefaultRealtimeSessionFactory(): RealtimeTranscriptionSessionFactory {
  return (apiKey, handlers, sourceLangHint) =>
    createOpenAIRealtimeTranscriptionSession(apiKey, handlers, sourceLangHint);
}
