export default function Loading() {
	return (
		<div className="w-full max-w-md space-y-4 rounded-[28px] bg-white/80 p-8 ring-1 ring-[#E2E8F0]/70 sm:p-10">
			<div className="h-8 w-2/3 animate-pulse rounded-xl bg-[#E2E8F0]" />
			<div className="h-4 w-full animate-pulse rounded-lg bg-[#EEF2F7]" />
			<div className="h-12 animate-pulse rounded-2xl bg-[#EEF2F7]" />
			<div className="h-12 animate-pulse rounded-2xl bg-[#EEF2F7]" />
			<div className="h-12 animate-pulse rounded-2xl bg-[#DBEAFE]" />
		</div>
	);
}
