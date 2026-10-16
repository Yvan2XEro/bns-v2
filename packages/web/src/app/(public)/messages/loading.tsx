export default function Loading() {
	return (
		<div className="flex h-[calc(100vh-4rem)] overflow-hidden">
			{/* Conversation list sidebar skeleton */}
			<div className="w-80 shrink-0 border-line border-r bg-surface">
				<div className="border-line border-b p-4">
					<div className="h-6 w-28 animate-pulse rounded bg-line" />
				</div>
				<div className="space-y-1 p-2">
					{Array.from({ length: 8 }).map((_, i) => (
						<div key={i} className="flex items-center gap-3 rounded-lg p-3">
							<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-line" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-24 animate-pulse rounded bg-line" />
								<div className="h-3 w-36 animate-pulse rounded bg-subtle" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Chat area skeleton */}
			<div className="flex flex-1 flex-col bg-canvas">
				{/* Chat header */}
				<div className="flex items-center gap-3 border-line border-b bg-surface px-6 py-4">
					<div className="h-10 w-10 animate-pulse rounded-full bg-line" />
					<div className="space-y-2">
						<div className="h-4 w-28 animate-pulse rounded bg-line" />
						<div className="h-3 w-20 animate-pulse rounded bg-subtle" />
					</div>
				</div>
				{/* Empty chat body */}
				<div className="flex-1" />
				{/* Input skeleton */}
				<div className="border-line border-t bg-surface px-6 py-4">
					<div className="h-10 w-full animate-pulse rounded-xl bg-subtle" />
				</div>
			</div>
		</div>
	);
}
