export default function Loading() {
	return (
		<div className="min-h-screen bg-canvas">
			{/* Breadcrumb skeleton */}
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
					<div className="h-4 w-40 animate-pulse rounded bg-line" />
				</div>
			</div>

			<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="grid gap-6 lg:grid-cols-5">
					{/* Left column */}
					<div className="lg:col-span-3">
						{/* Image gallery skeleton */}
						<div className="aspect-[4/3] animate-pulse rounded-xl border border-line bg-subtle" />
						{/* Details skeleton */}
						<div className="mt-4 space-y-4 rounded-xl border border-line bg-surface p-5">
							<div className="h-7 w-2/3 animate-pulse rounded bg-line" />
							<div className="h-7 w-1/4 animate-pulse rounded bg-line" />
							<div className="flex gap-3">
								<div className="h-4 w-24 animate-pulse rounded bg-line" />
								<div className="h-4 w-20 animate-pulse rounded bg-line" />
							</div>
							<div className="border-line border-t pt-4">
								<div className="space-y-2">
									<div className="h-3 w-full animate-pulse rounded bg-line" />
									<div className="h-3 w-full animate-pulse rounded bg-line" />
									<div className="h-3 w-2/3 animate-pulse rounded bg-line" />
								</div>
							</div>
						</div>
					</div>

					{/* Right column - seller card */}
					<div className="lg:col-span-2">
						<div className="space-y-4 rounded-xl border border-line bg-surface p-5">
							<div className="flex items-center gap-3">
								<div className="h-12 w-12 animate-pulse rounded-full bg-line" />
								<div className="space-y-2">
									<div className="h-4 w-28 animate-pulse rounded bg-line" />
									<div className="h-3 w-20 animate-pulse rounded bg-line" />
								</div>
							</div>
							<div className="h-10 w-full animate-pulse rounded-lg bg-line" />
							<div className="h-10 w-full animate-pulse rounded-lg bg-subtle" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
