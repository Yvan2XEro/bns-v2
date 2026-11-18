/** A titled list of rows, for pages that list orders or cart lines. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
	return (
		<div className="container mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
			<div className="h-7 w-48 animate-pulse rounded bg-line" />
			{Array.from({ length: rows }).map((_, i) => (
				<div
					key={i}
					className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4"
				>
					<div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-subtle" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-2/3 animate-pulse rounded bg-line" />
						<div className="h-3 w-1/3 animate-pulse rounded bg-line" />
					</div>
					<div className="h-5 w-20 animate-pulse rounded bg-line" />
				</div>
			))}
		</div>
	);
}
