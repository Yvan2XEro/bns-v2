export default function Loading() {
	return (
		<div className="flex h-[calc(100vh-4rem)] overflow-hidden">
			{/* Conversation list sidebar skeleton */}
			<div className="w-80 shrink-0 border-[#E2E8F0] border-r bg-white">
				<div className="border-[#E2E8F0] border-b p-4">
					<div className="h-6 w-28 animate-pulse rounded bg-[#E2E8F0]" />
				</div>
				<div className="space-y-1 p-2">
					{Array.from({ length: 8 }).map((_, i) => (
						<div key={i} className="flex items-center gap-3 rounded-lg p-3">
							<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#E2E8F0]" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-24 animate-pulse rounded bg-[#E2E8F0]" />
								<div className="h-3 w-36 animate-pulse rounded bg-[#F1F5F9]" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Chat area skeleton */}
			<div className="flex flex-1 flex-col bg-[#F8FAFC]">
				{/* Chat header */}
				<div className="flex items-center gap-3 border-[#E2E8F0] border-b bg-white px-6 py-4">
					<div className="h-10 w-10 animate-pulse rounded-full bg-[#E2E8F0]" />
					<div className="space-y-2">
						<div className="h-4 w-28 animate-pulse rounded bg-[#E2E8F0]" />
						<div className="h-3 w-20 animate-pulse rounded bg-[#F1F5F9]" />
					</div>
				</div>
				{/* Empty chat body */}
				<div className="flex-1" />
				{/* Input skeleton */}
				<div className="border-[#E2E8F0] border-t bg-white px-6 py-4">
					<div className="h-10 w-full animate-pulse rounded-xl bg-[#F1F5F9]" />
				</div>
			</div>
		</div>
	);
}
