import qrcode from "qrcode-generator";

/** A QR code drawn as SVG squares: crisp on paper at any size. */
export function QrCode({
	value,
	size = 96,
	label,
}: {
	value: string;
	size?: number;
	label: string;
}) {
	const qr = qrcode(0, "M");
	qr.addData(value);
	qr.make();
	const count = qr.getModuleCount();
	const cells: { x: number; y: number }[] = [];
	for (let y = 0; y < count; y++)
		for (let x = 0; x < count; x++) if (qr.isDark(y, x)) cells.push({ x, y });
	return (
		<svg
			role="img"
			aria-label={label}
			viewBox={`-2 -2 ${count + 4} ${count + 4}`}
			width={size}
			height={size}
			shapeRendering="crispEdges"
		>
			<rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#fff" />
			{cells.map(({ x, y }) => (
				<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />
			))}
		</svg>
	);
}
