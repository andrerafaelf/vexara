// Tiny in-memory token bucket per key (IP). Sufficient because nginx IP-allowlists
// the admin origin, so the population of distinct attackers is small.

interface Bucket {
	tokens: number;
	updatedAt: number;
}

interface Limiter {
	check: (key: string) => boolean;
}

export function createRateLimiter(capacity: number, refillPerSec: number): Limiter {
	const buckets = new Map<string, Bucket>();

	function gc(now: number): void {
		if (buckets.size < 1000) return;
		for (const [k, b] of buckets) {
			if (now - b.updatedAt > 60 * 60 * 1000) buckets.delete(k);
		}
	}

	return {
		check(key: string): boolean {
			const now = Date.now();
			gc(now);
			let b = buckets.get(key);
			if (!b) {
				b = { tokens: capacity, updatedAt: now };
				buckets.set(key, b);
			}
			const elapsedSec = (now - b.updatedAt) / 1000;
			b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
			b.updatedAt = now;
			if (b.tokens < 1) return false;
			b.tokens -= 1;
			return true;
		}
	};
}
