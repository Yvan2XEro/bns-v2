export default function Loading() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				{/* Search bar skeleton */}
				<div className="mb-6 h-12 w-full animate-pulse rounded-xl bg-[#E2E8F0]" />

				<div className="flex gap-6">
					{/* Sidebar filters skeleton */}
					<div className="hidden w-64 shrink-0 space-y-4 lg:block">
						{Array.from({ length: 5 }).map((_, i) => (
							<div
								key={i}
								className="space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-4"
							>
								<div className="h-4 w-24 animate-pulse rounded bg-[#E2E8F0]" />
								<div className="h-9 w-full animate-pulse rounded-lg bg-[#F1F5F9]" />
							</div>
						))}
					</div>

					{/* Listing cards skeleton */}
					<div className="flex-1">
						<div className="mb-4 flex items-center justify-between">
							<div className="h-4 w-32 animate-pulse rounded bg-[#E2E8F0]" />
							<div className="h-9 w-36 animate-pulse rounded-lg bg-[#E2E8F0]" />
						</div>
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
							{Array.from({ length: 12 }).map((_, i) => (
								<div
									key={i}
									className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
								>
									<div className="aspect-[4/3] animate-pulse bg-[#F1F5F9]" />
									<div className="space-y-2 p-3">
										<div className="h-4 w-3/4 animate-pulse rounded bg-[#E2E8F0]" />
										<div className="h-3 w-1/2 animate-pulse rounded bg-[#E2E8F0]" />
										<div className="h-5 w-1/3 animate-pulse rounded bg-[#E2E8F0]" />
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
