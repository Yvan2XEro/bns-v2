/**
 * Derives a remaining-seconds count from an absolute server timestamp rather
 * than a tick counter, so it stays correct across the screen being
 * backgrounded and resumed — the caller only needs to re-render on an
 * interval, not track elapsed time itself.
 */
export function secondsUntil(iso: string | null, now = Date.now()): number {
	if (!iso) return 0;
	const target = Date.parse(iso);
	if (Number.isNaN(target)) return 0;
	return Math.max(0, Math.ceil((target - now) / 1000));
}

export function formatCountdown(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}
