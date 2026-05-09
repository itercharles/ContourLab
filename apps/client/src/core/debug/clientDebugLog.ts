declare global {
  interface Window {
    __WEBTPS_DEBUG_LOGS__?: string[];
  }
}

let remoteLoggingDisabled = false;

export function logClientDebug(scope: string, message: string): void {
  const entry = `[${scope}] ${message}`;

  if (typeof window !== 'undefined') {
    const logs = window.__WEBTPS_DEBUG_LOGS__ ?? [];
    logs.push(entry);
    if (logs.length > 500) {
      logs.splice(0, logs.length - 500);
    }
    window.__WEBTPS_DEBUG_LOGS__ = logs;
  }

  console.debug(entry);

  if (remoteLoggingDisabled) {
    return;
  }

  void fetch('/debug/client-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope, message }),
  }).then((response) => {
    if (!response.ok) {
      remoteLoggingDisabled = true;
    }
  }).catch(() => {
    remoteLoggingDisabled = true;
  });
}
