export default function Loading() {
	return (
		<div className="min-h-screen bg-canvas">
			{/* Header skeleton */}
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
					<div className="h-4 w-28 animate-pulse rounded bg-line" />
					<div className="mt-4 h-8 w-36 animate-pulse rounded bg-line" />
					<div className="mt-1 h-4 w-56 animate-pulse rounded bg-line" />

					{/* Stats bar skeleton */}
					<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={i}
								className="h-14 animate-pulse rounded-xl bg-subtle"
							/>
						))}
					</div>
				</div>
			</div>

			{/* Listing cards skeleton */}
			<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="space-y-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4"
						>
							<div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-subtle" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-2/3 animate-pulse rounded bg-line" />
								<div className="h-3 w-1/3 animate-pulse rounded bg-line" />
							</div>
							<div className="h-6 w-20 animate-pulse rounded-full bg-line" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
