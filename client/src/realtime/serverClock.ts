// Server clock offset. The browser clock can drift (especially on phones and
// Windows machines without NTP), which makes every server-issued `completesAt`
// timestamp read inaccurately on the client — countdowns appear shorter or
// longer than they really are. We sample the server's clock from the `Date`
// HTTP response header on every API request and expose the average offset.
//
// Usage: `serverNow()` returns the best estimate of the current server time
// in milliseconds since the epoch. Anything that compares against a
// server-issued timestamp (build/train queue countdowns, attack ETAs,
// resource interpolation anchors) should prefer `serverNow()` over
// `Date.now()`.

// Ring buffer of the last N (clientNow - serverDate) samples in ms.
// We keep the value `clientMinusServer` so that `serverNow = clientNow - offset`.
const SAMPLE_LIMIT = 8;
const samples: number[] = [];

// Cached median of the ring buffer. Computed on write because reads happen
// at 1 Hz from every countdown.
let offsetMs = 0;

// HTTP-header dates have second precision (no millisecond field), so we
// account for the full second of rounding plus an estimate of one-way
// network latency (~half the request RTT). Without this, the offset
// systematically reads ~500 ms high on every sample.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Record one observation from an API response. Pass the response object and
 * the timestamps captured immediately before and after the fetch settled.
 * The function pulls the `Date` header itself, so callers don't need to
 * parse anything.
 */
export function recordServerTimeSample(
  response: { headers: { get(name: string): string | null } } | null | undefined,
  requestStartMs: number,
  requestEndMs: number,
): void {
  if (!response) return;
  const dateHeader = response.headers.get('Date');
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  // The server stamped `Date` *somewhere* between when it received the request
  // and when the response started streaming back. The best client-side guess
  // for that moment is the midpoint of the round-trip. Subtract that midpoint
  // from the local clock to get the clientMinusServer offset at that moment.
  const midpointMs = (requestStartMs + requestEndMs) / 2;
  const sample = midpointMs - serverMs;
  samples.push(sample);
  if (samples.length > SAMPLE_LIMIT) samples.shift();
  offsetMs = median(samples);
}

/** Current best estimate of `clientNow - serverNow` in ms. */
export function getClockOffsetMs(): number {
  return offsetMs;
}

/** Current best estimate of the server's clock in ms-since-epoch. */
export function serverNow(): number {
  return Date.now() - offsetMs;
}
