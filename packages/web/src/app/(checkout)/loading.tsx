export default function CheckoutLoading() {
	return (
		<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
			<div className="space-y-4">
				<div className="h-40 animate-pulse rounded-xl bg-[#E2E8F0]" />
				<div className="h-56 animate-pulse rounded-xl bg-[#E2E8F0]" />
				<div className="h-32 animate-pulse rounded-xl bg-[#E2E8F0]" />
			</div>
			<div className="h-72 animate-pulse rounded-xl bg-[#E2E8F0]" />
		</div>
	);
}
