export const DETECTOR_STATUS_SIGNALS = Object.freeze({
  SIGUSR1: "unavailable",
  SIGUSR2: "live",
});

export function installDetectorStatusSignals({
  engine,
  signalTarget = process,
}) {
  const handlers = new Map(
    Object.entries(DETECTOR_STATUS_SIGNALS).map(([signal, status]) => [
      signal,
      () => engine.setTelemetryStatus(status),
    ]),
  );
  for (const [signal, handler] of handlers) {
    signalTarget.on(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) {
      if (typeof signalTarget.off === "function") {
        signalTarget.off(signal, handler);
      } else {
        signalTarget.removeListener(signal, handler);
      }
    }
  };
}
