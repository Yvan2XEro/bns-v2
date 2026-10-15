const DAY_MS = 86_400_000;

/** Whole days left before `iso`, rounded up; 0 once it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
	const left = new Date(iso).getTime() - now.getTime();
	return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}
