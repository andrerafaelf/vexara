export function logInfo(event, meta = {}) {
  console.log(
    JSON.stringify({
      level: 'info',
      event,
      ts: new Date().toISOString(),
      ...meta,
    }),
  );
}

export function logWarn(event, meta = {}) {
  console.warn(
    JSON.stringify({
      level: 'warn',
      event,
      ts: new Date().toISOString(),
      ...meta,
    }),
  );
}

export function logError(event, meta = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      ts: new Date().toISOString(),
      ...meta,
    }),
  );
}
