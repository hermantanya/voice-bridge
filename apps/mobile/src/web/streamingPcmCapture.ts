function pcmFloatToBase64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export type StreamingPcmCapture = {
  stop: () => void;
};

/** 24 kHz mono PCM16 chunks for OpenAI Realtime transcription uplink. */
export function startStreamingPcmCapture(
  stream: MediaStream,
  onChunk: (pcm16Base64: string) => void,
): StreamingPcmCapture {
  const audioContext = new AudioContext({ sampleRate: 24_000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const sink = audioContext.createGain();
  sink.gain.value = 0;

  processor.onaudioprocess = (event) => {
    const channel = event.inputBuffer.getChannelData(0);
    if (channel.length === 0) {
      return;
    }
    onChunk(pcmFloatToBase64(channel));
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);

  return {
    stop: () => {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      sink.disconnect();
      void audioContext.close();
    },
  };
}
