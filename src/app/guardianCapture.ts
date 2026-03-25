export const VERIFICATION_PHRASE = "guardian secure transfer";

export type GeoSnapshot = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type MotionCaptureStatus = "captured" | "denied" | "unsupported" | "unavailable";
export type MotionPermissionState = "required" | "granted" | "denied" | "unsupported";

export type MotionCaptureResult = {
  signature: number[];
  sampleCount: number;
  status: MotionCaptureStatus;
};

export type DeviceProfile = {
  platform: "mobile-web" | "desktop-web";
  userAgent: string;
  touchCapable: boolean;
  secureContext: boolean;
  language: string;
  languages: string[];
  timezone: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  cookieEnabled: boolean;
  viewport: {
    width: number | null;
    height: number | null;
    pixelRatio: number | null;
  };
  screen: {
    width: number | null;
    height: number | null;
  };
};

export const MIN_LIVE_MOTION_SAMPLES = 12;

type PermissionedDeviceMotionEvent = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export function supportsMotionCapture() {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export function supportsGeolocationCapture() {
  return typeof window !== "undefined" && window.isSecureContext && typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function getMotionPermissionState(): MotionPermissionState {
  if (!supportsMotionCapture()) return "unsupported";

  const motionEvent = window.DeviceMotionEvent as PermissionedDeviceMotionEvent;
  return typeof motionEvent.requestPermission === "function" ? "required" : "granted";
}

export function buildDeviceProfile(): DeviceProfile {
  const isTouchCapable =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints > 0 || "ontouchstart" in window);

  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"
      : "unknown";

  return {
    platform: isTouchCapable ? "mobile-web" : "desktop-web",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    touchCapable: isTouchCapable,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    language: typeof navigator !== "undefined" ? navigator.language ?? "" : "",
    languages:
      typeof navigator !== "undefined" && Array.isArray(navigator.languages)
        ? [...navigator.languages]
        : [],
    timezone,
    hardwareConcurrency:
      typeof navigator !== "undefined" &&
      typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : null,
    deviceMemory:
      typeof navigator !== "undefined" &&
      "deviceMemory" in navigator &&
      typeof navigator.deviceMemory === "number"
        ? navigator.deviceMemory
        : null,
    cookieEnabled:
      typeof navigator !== "undefined" ? Boolean(navigator.cookieEnabled) : false,
    viewport: {
      width: typeof window !== "undefined" ? window.innerWidth : null,
      height: typeof window !== "undefined" ? window.innerHeight : null,
      pixelRatio:
        typeof window !== "undefined" ? Number(window.devicePixelRatio || 1) : null,
    },
    screen: {
      width:
        typeof window !== "undefined" && typeof window.screen !== "undefined"
          ? window.screen.width
          : null,
      height:
        typeof window !== "undefined" && typeof window.screen !== "undefined"
          ? window.screen.height
          : null,
    },
  };
}

function resampleSequence(samples: number[], targetLength: number) {
  if (!samples.length) return [];
  if (samples.length === 1) return Array.from({ length: targetLength }, () => samples[0]);
  if (samples.length === targetLength) return [...samples];

  const out: number[] = [];
  const maxIndex = samples.length - 1;

  for (let i = 0; i < targetLength; i += 1) {
    const position = (i * maxIndex) / (targetLength - 1);
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(Math.ceil(position), maxIndex);
    const mix = position - leftIndex;
    const left = samples[leftIndex];
    const right = samples[rightIndex];
    out.push(left + (right - left) * mix);
  }

  return out;
}

export function trimKeypressSample(pressTimes: number[], releaseTimes: number[]) {
  const pairCount = Math.min(pressTimes.length, releaseTimes.length, 33);
  return {
    press_systimes: pressTimes.slice(0, pairCount),
    release_systimes: releaseTimes.slice(0, pairCount),
  };
}

export function deriveTypingSpeed(pressTimes: number[]) {
  if (pressTimes.length < 2) return 0.5;

  const intervals = pressTimes
    .slice(1)
    .map((time, index) => Math.max(0, time - pressTimes[index]));

  const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const normalized = 1 - Math.min(Math.max((averageInterval - 40) / 420, 0), 1);
  return Number(normalized.toFixed(4));
}

export function deriveSwipeSteadiness(signature: number[]) {
  if (!signature.length) return 0.5;

  const mean = signature.reduce((sum, value) => sum + value, 0) / signature.length;
  const variance =
    signature.reduce((sum, value) => sum + (value - mean) ** 2, 0) / signature.length;
  const stdDev = Math.sqrt(variance);
  const normalized = 1 - Math.min(Math.max((stdDev - 0.08) / 1.2, 0), 1);
  return Number(normalized.toFixed(4));
}

export function hasUsableMotionSignature(result: MotionCaptureResult) {
  if (
    result.status !== "captured" ||
    result.signature.length !== 128 ||
    result.sampleCount < MIN_LIVE_MOTION_SAMPLES
  ) {
    return false;
  }

  const mean = result.signature.reduce((sum, value) => sum + value, 0) / result.signature.length;
  const variance =
    result.signature.reduce((sum, value) => sum + (value - mean) ** 2, 0) / result.signature.length;
  const maxAbs = result.signature.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

  return maxAbs > 0.05 && variance > 1e-4;
}

export async function captureGeolocation(timeoutMs = 5000): Promise<GeoSnapshot | null> {
  if (!supportsGeolocationCapture()) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}

export async function requestMotionPermission(): Promise<MotionPermissionState> {
  if (!supportsMotionCapture()) return "unsupported";

  const motionEvent = window.DeviceMotionEvent as PermissionedDeviceMotionEvent;
  if (typeof motionEvent.requestPermission !== "function") {
    return "granted";
  }

  try {
    const result = await motionEvent.requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function captureMotionSignature(durationMs = 1600): Promise<MotionCaptureResult> {
  const permission = await requestMotionPermission();
  if (permission !== "granted") {
    return { signature: [], sampleCount: 0, status: permission };
  }

  return new Promise((resolve) => {
    const magnitudes: number[] = [];

    const onMotion = (event: DeviceMotionEvent) => {
      const source = event.accelerationIncludingGravity ?? event.acceleration;
      const x = source?.x ?? 0;
      const y = source?.y ?? 0;
      const z = source?.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (Number.isFinite(magnitude)) {
        magnitudes.push(Number(magnitude.toFixed(6)));
      }
    };

    window.addEventListener("devicemotion", onMotion);

    window.setTimeout(() => {
      window.removeEventListener("devicemotion", onMotion);

      if (!magnitudes.length) {
        resolve({ signature: [], sampleCount: 0, status: "unavailable" });
        return;
      }

      resolve({
        signature: resampleSequence(magnitudes, 128),
        sampleCount: magnitudes.length,
        status: "captured",
      });
    }, durationMs);
  });
}
