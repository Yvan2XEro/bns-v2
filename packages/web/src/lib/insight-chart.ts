export function insightPolyline(
	values: readonly number[],
	width: number,
	height: number,
): string {
	if (values.length === 0) return "";
	const maximum = Math.max(0, ...values);
	return values
		.map((value, index) => {
			const x =
				values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
			const y =
				maximum === 0
					? height
					: height - (Math.max(0, value) / maximum) * height;
			return `${x},${y}`;
		})
		.join(" ");
}
