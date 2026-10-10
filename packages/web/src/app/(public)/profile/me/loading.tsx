export default function Loading() {
	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			{/* Header skeleton */}
			<div className="mb-6 flex items-center justify-between">
				<div className="h-8 w-36 animate-pulse rounded bg-[#E2E8F0]" />
				<div className="h-9 w-40 animate-pulse rounded-xl bg-[#E2E8F0]" />
			</div>

			{/* Tabs skeleton */}
			<div className="mb-6 h-10 w-64 animate-pulse rounded-lg bg-[#E2E8F0]" />

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Profile form skeleton */}
				<div className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6 lg:col-span-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="space-y-2">
							<div className="h-4 w-20 animate-pulse rounded bg-[#E2E8F0]" />
							<div className="h-10 w-full animate-pulse rounded-lg bg-[#F1F5F9]" />
						</div>
					))}
				</div>

				{/* Profile preview card skeleton */}
				<div className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
					<div className="flex flex-col items-center">
						<div className="h-24 w-24 animate-pulse rounded-full bg-[#E2E8F0]" />
						<div className="mt-4 h-6 w-32 animate-pulse rounded bg-[#E2E8F0]" />
						<div className="mt-2 h-4 w-24 animate-pulse rounded bg-[#E2E8F0]" />
						<div className="mt-4 h-4 w-20 animate-pulse rounded bg-[#E2E8F0]" />
					</div>
				</div>
			</div>
		</div>
	);
}
