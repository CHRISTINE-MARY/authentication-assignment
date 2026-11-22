export function sensorError(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "The prompt was closed. If Windows shows a PIN box, choose the fingerprint icon.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
