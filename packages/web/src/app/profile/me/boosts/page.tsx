import { ArrowLeft, ExternalLink, Rocket } from "lucide-react";
import Link from "next/link";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { BoostPayment, Listing } from "~/types";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
	pending: {
		label: "Pending",
		className: "bg-amber-50 text-amber-700 border-amber-200",
	},
	completed: {
		label: "Completed",
		className: "bg-emerald-50 text-emerald-700 border-emerald-200",
	},
	failed: {
		label: "Failed",
		className: "bg-red-50 text-red-700 border-red-200",
	},
	refunded: {
		label: "Refunded",
		className: "bg-gray-50 text-gray-500 border-gray-200",
	},
};

const DURATION_LABELS: Record<string, string> = {
	"7": "7 days",
	"14": "14 days",
	"30": "30 days",
};

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatAmount(amount: number): string {
	return new Intl.NumberFormat("fr-CM", {
		style: "decimal",
		minimumFractionDigits: 0,
	}).format(amount);
}

function getListingTitle(listing: string | Listing): string {
	if (typeof listing === "string") return "Listing";
	return listing.title || "Untitled listing";
}

function getListingId(listing: string | Listing): string {
	if (typeof listing === "string") return listing;
	return listing.id;
}

export default async function BoostPaymentHistoryPage() {
	const user = (await getAuthUser()) as { id: string } | null;
	if (!user) return null;

	let payments: BoostPayment[] = [];
	try {
		const res = await serverFetch(
			"/api/boost-payments?sort=-createdAt&depth=1&limit=50",
		);
		if (res.ok) {
			const data = await res.json();
			payments = data.docs || [];
		}
	} catch {
		// fail silently
	}

	const totalSpent = payments
		.filter((p) => p.status === "completed")
		.reduce((sum, p) => sum + p.amount, 0);
	const _pendingCount = payments.filter((p) => p.status === "pending").length;
	const completedCount = payments.filter(
		(p) => p.status === "completed",
	).length;

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Header */}
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
					<Link
						href="/profile/me/listings"
						className="mb-4 inline-flex items-center gap-1 text-[#64748B] text-sm transition-colors hover:text-[#1E40AF]"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to listings
					</Link>
					<div className="flex items-start justify-between">
						<div>
							<h1 className="font-extrabold text-2xl text-[#0F172A]">
								Boost Payment History
							</h1>
							<p className="mt-1 text-[#64748B] text-sm">
								Track your boost payments and spending
							</p>
						</div>
					</div>

					{/* Stats */}
					<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div className="flex items-center gap-3 rounded-xl bg-[#EFF6FF] px-4 py-3 text-[#1E40AF]">
							<span className="font-extrabold text-2xl">{payments.length}</span>
							<span className="font-medium text-xs opacity-80">Total</span>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
							<span className="font-extrabold text-2xl">{completedCount}</span>
							<span className="font-medium text-xs opacity-80">Completed</span>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-700">
							<span className="font-extrabold text-2xl">
								{formatAmount(totalSpent)} XAF
							</span>
							<span className="font-medium text-xs opacity-80">
								Total Spent
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				{payments.length > 0 ? (
					<div className="space-y-3">
						{payments.map((payment) => {
							const badge =
								STATUS_BADGES[payment.status] || STATUS_BADGES.pending;
							const listingId = getListingId(payment.listing);

							return (
								<div
									key={payment.id}
									className="flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex-1 space-y-1">
										<div className="flex items-center gap-2">
											<Link
												href={`/listing/${listingId}`}
												className="font-semibold text-[#0F172A] transition-colors hover:text-[#1E40AF]"
											>
												{getListingTitle(payment.listing)}
												<ExternalLink className="ml-1 inline h-3.5 w-3.5 text-[#94A3B8]" />
											</Link>
											<span
												className={`inline-flex rounded-full border px-2 py-0.5 font-medium text-xs ${badge.className}`}
											>
												{badge.label}
											</span>
										</div>
										<p className="text-[#64748B] text-sm">
											{DURATION_LABELS[payment.duration] || payment.duration}{" "}
											boost
											{" \u00B7 "}
											{formatDate(payment.createdAt)}
										</p>
									</div>
									<div className="text-right">
										<span className="font-bold text-[#0F172A] text-lg">
											{formatAmount(payment.amount)} XAF
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					/* Empty state */
					<div className="relative overflow-hidden rounded-2xl border border-[#DBEAFE] bg-white py-16 text-center">
						<div className="pattern-dots absolute inset-0 opacity-50" />
						<div className="relative">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]">
								<Rocket className="h-7 w-7 text-[#1E40AF]" />
							</div>
							<h3 className="font-bold text-[#0F172A] text-lg">
								No boost payments yet
							</h3>
							<p className="mx-auto mt-1 max-w-xs text-[#64748B] text-sm">
								Boost your listings to reach more buyers and sell faster.
							</p>
							<Link href="/profile/me/listings">
								<button
									type="button"
									className="mt-5 rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] px-6 py-2.5 font-bold text-white shadow-blue-500/20 shadow-lg"
								>
									Go to listings
								</button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
