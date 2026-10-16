import { ArrowLeft, ExternalLink, Rocket } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { renderOrderMoney } from "~/lib/order-money";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import { getMarket } from "~/lib/server-shop";
import type { BoostPayment, Listing } from "~/types";

const STATUS_CLASSES: Record<string, string> = {
	pending: "bg-amber-50 text-amber-700 border-amber-200",
	completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
	failed: "bg-red-50 text-red-700 border-red-200",
	refunded: "bg-gray-50 text-gray-500 border-gray-200",
};
const BOOST_STATUSES = ["pending", "completed", "failed", "refunded"] as const;
type BoostStatus = (typeof BOOST_STATUSES)[number];
const boostStatusOf = (status: string): BoostStatus =>
	BOOST_STATUSES.find((value) => value === status) ?? "pending";

function getListingId(listing: string | Listing): string {
	if (typeof listing === "string") return listing;
	return listing.id;
}

export default async function BoostPaymentHistoryPage() {
	const user = (await getAuthUser()) as { id: string } | null;
	if (!user) return null;
	const [locale, market, t] = await Promise.all([
		getLocale(),
		getMarket(),
		getTranslations("BoostHistory"),
	]);
	const formatDate = (dateStr: string) =>
		new Date(dateStr).toLocaleDateString(locale, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	const listingTitle = (listing: string | Listing) =>
		typeof listing === "string" ? t("listing") : listing.title || t("untitled");

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
		<div className="min-h-screen bg-canvas">
			{/* Header */}
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
					<Link
						href="/profile/me/listings"
						className="mb-4 inline-flex items-center gap-1 text-ink-muted text-sm transition-colors hover:text-brand"
					>
						<ArrowLeft className="h-4 w-4" />
						{t("backToListings")}
					</Link>
					<div className="flex items-start justify-between">
						<div>
							<h1 className="font-extrabold text-2xl text-ink">{t("title")}</h1>
							<p className="mt-1 text-ink-muted text-sm">{t("subtitle")}</p>
						</div>
					</div>

					{/* Stats */}
					<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-brand">
							<span className="font-extrabold text-2xl">{payments.length}</span>
							<span className="font-medium text-xs opacity-80">
								{t("statTotal")}
							</span>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
							<span className="font-extrabold text-2xl">{completedCount}</span>
							<span className="font-medium text-xs opacity-80">
								{t("statCompleted")}
							</span>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-700">
							<span className="font-extrabold text-2xl">
								{renderOrderMoney(market, totalSpent, locale)}
							</span>
							<span className="font-medium text-xs opacity-80">
								{t("statSpent")}
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
							const status = boostStatusOf(payment.status);
							const listingId = getListingId(payment.listing);

							return (
								<div
									key={payment.id}
									className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex-1 space-y-1">
										<div className="flex items-center gap-2">
											<Link
												href={`/listing/${listingId}`}
												className="font-semibold text-ink transition-colors hover:text-brand"
											>
												{listingTitle(payment.listing)}
												<ExternalLink className="ml-1 inline h-3.5 w-3.5 text-ink-faint" />
											</Link>
											<span
												className={`inline-flex rounded-full border px-2 py-0.5 font-medium text-xs ${STATUS_CLASSES[status]}`}
											>
												{t(`status.${status}`)}
											</span>
										</div>
										<p className="text-ink-muted text-sm">
											{t("durationBoost", { days: payment.duration })}
											{" · "}
											{formatDate(payment.createdAt)}
										</p>
									</div>
									<div className="text-right">
										<span className="font-bold text-ink text-lg">
											{renderOrderMoney(market, payment.amount, locale)}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					/* Empty state */
					<div className="relative overflow-hidden rounded-2xl border border-brand-tint bg-surface py-16 text-center">
						<div className="pattern-dots absolute inset-0 opacity-50" />
						<div className="relative">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-brand-tint">
								<Rocket className="h-7 w-7 text-brand" />
							</div>
							<h3 className="font-bold text-ink text-lg">{t("emptyTitle")}</h3>
							<p className="mx-auto mt-1 max-w-xs text-ink-muted text-sm">
								{t("emptyBody")}
							</p>
							<Link href="/profile/me/listings">
								<button
									type="button"
									className="mt-5 rounded-xl bg-gradient-to-r from-brand to-brand-bright px-6 py-2.5 font-bold text-white shadow-blue-500/20 shadow-lg"
								>
									{t("emptyCta")}
								</button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
