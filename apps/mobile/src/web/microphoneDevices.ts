export type MicrophoneDevice = {
  deviceId: string;
  label: string;
};

const MIC_DEVICE_STORAGE_KEY = "voice-bridge-mic-device-id";

export function loadSavedMicDeviceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(MIC_DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveMicDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(MIC_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    // Ignore storage errors in private browsing.
  }
}

export function clearSavedMicDeviceId(): void {
  try {
    localStorage.removeItem(MIC_DEVICE_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

const VIRTUAL_MIC_DEVICE_IDS = new Set(["default", "communications"]);

export function isVirtualMicDevice(deviceId: string): boolean {
  return VIRTUAL_MIC_DEVICE_IDS.has(deviceId);
}

export function isRemotePhoneMic(label: string): boolean {
  return /iphone|ipad|android phone|continuity|your iphone/i.test(label);
}

export function preferBuiltInMic(
  devices: MicrophoneDevice[],
): MicrophoneDevice | null {
  if (devices.length === 0) {
    return null;
  }

  const realDevices = devices.filter(
    (device) => !isVirtualMicDevice(device.deviceId),
  );

  const builtIn = realDevices.find(
    (device) =>
      /built-in|macbook|internal|imac|studio display|microphone array/i.test(
        device.label,
      ) && !isRemotePhoneMic(device.label),
  );
  if (builtIn) {
    return builtIn;
  }

  const notPhone = realDevices.find((device) => !isRemotePhoneMic(device.label));
  return notPhone ?? realDevices[0] ?? null;
}

export async function enumerateMicrophones(): Promise<MicrophoneDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter(
      (device) =>
        device.kind === "audioinput" && !isVirtualMicDevice(device.deviceId),
    )
    .map((device, index) => ({
      deviceId: device.deviceId,
      label:
        device.label ||
        `Microphone ${index + 1}`,
    }));
}

export function getAudioConstraints(
  deviceId: string | null,
  exact = false,
): MediaStreamConstraints {
  if (deviceId) {
    return {
      audio: {
        deviceId: exact ? { exact: deviceId } : { ideal: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
      },
    };
  }

  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  };
}
