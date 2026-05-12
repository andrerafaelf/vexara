export function logInfo(event: string, meta: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...meta }));
}

export function logWarn(event: string, meta: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ level: 'warn', event, ts: new Date().toISOString(), ...meta }));
}

export function logError(event: string, meta: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: 'error', event, ts: new Date().toISOString(), ...meta }));
}
