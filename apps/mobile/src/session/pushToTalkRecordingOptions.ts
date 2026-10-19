import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  type RecordingOptions,
} from "expo-audio";
import { Platform } from "react-native";

/**
 * Whisper accepts wav/m4a/webm but not CAF. iOS AAC in .m4a often fails Whisper
 * (incomplete moov/mdat) while the same preset works for ElevenLabs enrollment.
 * PTT on iOS uses 16 kHz mono PCM WAV — reliable for Whisper, still small over the wire.
 */
const IOS_PUSH_TO_TALK_RECORDING: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 256_000,
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: RecordingPresets.HIGH_QUALITY.android,
  web: RecordingPresets.HIGH_QUALITY.web,
};

export function pushToTalkRecordingOptions(): RecordingOptions {
  if (Platform.OS === "ios") {
    return IOS_PUSH_TO_TALK_RECORDING;
  }
  return RecordingPresets.HIGH_QUALITY;
}
