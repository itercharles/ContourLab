export function logClientDebug(scope: string, message: string): void {
  void fetch('/debug/client-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope, message }),
  }).catch(() => {
    // Ignore logging transport failures in the client.
  });
}
