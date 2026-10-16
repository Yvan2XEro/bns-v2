export default function Loading() {
	// Renders inside the (seller) layout's own max-w/px container — no outer
	// wrapper here, or the pane double-pads.
	return (
		<div>
			<div className="mb-6 h-7 w-56 animate-pulse rounded bg-line" />
			<div className="mb-4 flex gap-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={i} className="h-9 w-28 animate-pulse rounded-lg bg-line" />
				))}
			</div>
			<div className="overflow-hidden rounded-xl border border-line bg-surface">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						key={i}
						className="h-14 animate-pulse border-subtle border-b bg-surface"
					/>
				))}
			</div>
		</div>
	);
}
