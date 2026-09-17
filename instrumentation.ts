// Sentry integration point: wire the SDK's captureRequestError here when a project is configured.
// Keep PII out of logs; never log request bodies, receipt capabilities or payment credentials.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs")
    console.info(
      JSON.stringify({
        level: "info",
        event: "application_started",
        environment: process.env.NODE_ENV,
      }),
    );
}
export function onRequestError(error: Error & { digest?: string }) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_request_error",
      digest: error.digest,
      name: error.name,
    }),
  );
}
