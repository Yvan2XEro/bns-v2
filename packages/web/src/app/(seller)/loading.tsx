export default function Loading() {
	// Renders inside the (seller) layout's own max-w/px container — no outer
	// wrapper here, or the pane double-pads.
	return (
		<div>
			<div className="mb-6 h-7 w-56 animate-pulse rounded bg-[#E2E8F0]" />
			<div className="mb-4 flex gap-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						key={i}
						className="h-9 w-28 animate-pulse rounded-lg bg-[#E2E8F0]"
					/>
				))}
			</div>
			<div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						key={i}
						className="h-14 animate-pulse border-[#F1F5F9] border-b bg-white"
					/>
				))}
			</div>
		</div>
	);
}
