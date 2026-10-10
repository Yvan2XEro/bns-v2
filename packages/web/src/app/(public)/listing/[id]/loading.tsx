export default function Loading() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Breadcrumb skeleton */}
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="container mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
					<div className="h-4 w-40 animate-pulse rounded bg-[#E2E8F0]" />
				</div>
			</div>

			<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="grid gap-6 lg:grid-cols-5">
					{/* Left column */}
					<div className="lg:col-span-3">
						{/* Image gallery skeleton */}
						<div className="aspect-[4/3] animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
						{/* Details skeleton */}
						<div className="mt-4 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
							<div className="h-7 w-2/3 animate-pulse rounded bg-[#E2E8F0]" />
							<div className="h-7 w-1/4 animate-pulse rounded bg-[#E2E8F0]" />
							<div className="flex gap-3">
								<div className="h-4 w-24 animate-pulse rounded bg-[#E2E8F0]" />
								<div className="h-4 w-20 animate-pulse rounded bg-[#E2E8F0]" />
							</div>
							<div className="border-[#E2E8F0] border-t pt-4">
								<div className="space-y-2">
									<div className="h-3 w-full animate-pulse rounded bg-[#E2E8F0]" />
									<div className="h-3 w-full animate-pulse rounded bg-[#E2E8F0]" />
									<div className="h-3 w-2/3 animate-pulse rounded bg-[#E2E8F0]" />
								</div>
							</div>
						</div>
					</div>

					{/* Right column - seller card */}
					<div className="lg:col-span-2">
						<div className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
							<div className="flex items-center gap-3">
								<div className="h-12 w-12 animate-pulse rounded-full bg-[#E2E8F0]" />
								<div className="space-y-2">
									<div className="h-4 w-28 animate-pulse rounded bg-[#E2E8F0]" />
									<div className="h-3 w-20 animate-pulse rounded bg-[#E2E8F0]" />
								</div>
							</div>
							<div className="h-10 w-full animate-pulse rounded-lg bg-[#E2E8F0]" />
							<div className="h-10 w-full animate-pulse rounded-lg bg-[#F1F5F9]" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
