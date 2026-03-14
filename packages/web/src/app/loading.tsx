export default function Loading() {
	return (
		<div className="flex flex-col">
			{/* Hero skeleton */}
			<section className="bg-[#1E40AF]">
				<div className="container mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
					<div className="mx-auto max-w-2xl text-center">
						<div className="mx-auto mb-3 h-10 w-72 animate-pulse rounded-lg bg-white/20" />
						<div className="mx-auto mb-8 h-5 w-80 animate-pulse rounded bg-white/10" />
						<div className="mx-auto h-14 max-w-xl animate-pulse rounded-2xl bg-white/20" />
					</div>
				</div>
			</section>

			{/* Categories skeleton */}
			<section className="bg-white py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 h-6 w-48 animate-pulse rounded bg-[#E2E8F0]" />
					<div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={i}
								className="flex flex-col items-center gap-2 rounded-xl p-4"
							>
								<div className="h-12 w-12 animate-pulse rounded-full bg-[#E2E8F0]" />
								<div className="h-3 w-16 animate-pulse rounded bg-[#E2E8F0]" />
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Listings skeleton */}
			<section className="py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 h-6 w-36 animate-pulse rounded bg-[#E2E8F0]" />
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{Array.from({ length: 8 }).map((_, i) => (
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
			</section>
		</div>
	);
}
