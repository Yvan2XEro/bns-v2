export function sparklineHeights(values: readonly number[]): number[] {
	const max = Math.max(0, ...values);
	return max === 0
		? values.map(() => 0)
		: values.map((value) => (value / max) * 100);
}
