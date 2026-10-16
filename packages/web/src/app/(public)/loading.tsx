export default function Loading() {
	return (
		<div className="flex flex-col">
			<section className="py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 h-6 w-48 animate-pulse rounded bg-line" />
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{Array.from({ length: 8 }).map((_, i) => (
							<div
								key={i}
								className="overflow-hidden rounded-xl border border-line bg-surface"
							>
								<div className="aspect-[4/3] animate-pulse bg-subtle" />
								<div className="space-y-2 p-3">
									<div className="h-4 w-3/4 animate-pulse rounded bg-line" />
									<div className="h-3 w-1/2 animate-pulse rounded bg-line" />
									<div className="h-5 w-1/3 animate-pulse rounded bg-line" />
								</div>
							</div>
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
