export default function Loading() {
	return (
		<div className="space-y-3">
			<div className="h-8 w-64 animate-pulse rounded-lg bg-[#E2E8F0]" />
			{Array.from({ length: 6 }, (_, i) => (
				<div key={i} className="h-14 animate-pulse rounded-xl bg-[#E2E8F0]" />
			))}
		</div>
	);
}
