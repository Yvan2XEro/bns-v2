import {
	ArrowLeft,
	Camera,
	ChevronLeft,
	ChevronRight,
	PlusCircle,
	Rocket,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "~/components/ui/button";
import { withContentLocale } from "~/lib/content-locale";
import {
	getAuthUser,
	serverContentLocale,
	serverFetch,
} from "~/lib/server-api";
import type { Listing, User } from "~/types";
import { MyListingsClient } from "./listings-client";

const PER_PAGE = 12;

async function getUserListings(
	userId: string,
	page: number,
): Promise<{
	listings: Listing[];
	total: number;
	published: number;
	pending: number;
	sold: number;
	expired: number;
	boosted: number;
}> {
	try {
		const res = await serverFetch(
			withContentLocale(
				`/api/listings?where[seller][equals]=${userId}&limit=${PER_PAGE}&page=${page}&sort=-createdAt&depth=1`,
				await serverContentLocale(),
			),
		);
		if (!res.ok)
			return {
				listings: [],
				total: 0,
				published: 0,
				pending: 0,
				sold: 0,
				expired: 0,
				boosted: 0,
			};
		const data = await res.json();
		const docs: Listing[] = data.docs || [];
		return {
			listings: docs,
			total: data.totalDocs || 0,
			published: docs.filter((l) => l.status === "published").length,
			pending: docs.filter((l) => l.status === "pending").length,
			sold: docs.filter((l) => l.status === "sold").length,
			expired: docs.filter((l) => l.status === "expired").length,
			boosted: docs.filter(
				(l) => l.boostedUntil && new Date(l.boostedUntil) > new Date(),
			).length,
		};
	} catch {
		return {
			listings: [],
			total: 0,
			published: 0,
			pending: 0,
			sold: 0,
			expired: 0,
			boosted: 0,
		};
	}
}

interface PageProps {
	searchParams: Promise<{ page?: string }>;
}

export default async function MyListingsPage({ searchParams }: PageProps) {
	const user = (await getAuthUser()) as User | null;
	if (!user) return null;
	const t = await getTranslations("MyListings");

	const { page: pageParam } = await searchParams;
	const page = Math.max(1, Number(pageParam) || 1);
	const { listings, total, published, pending, sold, expired, boosted } =
		await getUserListings(user.id, page);
	const totalPages = Math.ceil(total / PER_PAGE);

	return (
		<div className="min-h-screen bg-canvas">
			{/* Header */}
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
					<Link
						href="/profile/me"
						className="mb-4 inline-flex items-center gap-1 text-ink-muted text-sm transition-colors hover:text-brand"
					>
						<ArrowLeft className="h-4 w-4" />
						{t("backToProfile")}
					</Link>
					<div className="flex items-start justify-between">
						<div>
							<h1 className="font-extrabold text-2xl text-ink">{t("title")}</h1>
							<p className="mt-1 text-ink-muted text-sm">{t("subtitle")}</p>
						</div>
						<div className="flex items-center gap-2">
							<Link href="/profile/me/boosts">
								<Button
									variant="outline"
									className="rounded-xl border-line font-bold text-ink-muted hover:border-brand-line hover:text-brand"
								>
									<Rocket className="mr-2 h-4 w-4" />
									{t("boostHistory")}
								</Button>
							</Link>
							<Link href="/create">
								<Button className="rounded-xl bg-[#F59E0B] font-bold text-ink shadow-amber-500/15 shadow-md hover:bg-[#D97706]">
									<PlusCircle className="mr-2 h-4 w-4" />
									{t("newListing")}
								</Button>
							</Link>
						</div>
					</div>

					{/* Stats */}
					<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
						{[
							{
								label: t("statTotal"),
								value: total,
								color: "bg-brand-soft text-brand",
							},
							{
								label: t("statActive"),
								value: published,
								color: "bg-emerald-50 text-emerald-700",
							},
							{
								label: t("statPending"),
								value: pending,
								color: "bg-blue-50 text-blue-700",
							},
							{
								label: t("statSold"),
								value: sold,
								color: "bg-subtle text-ink-muted",
							},
							{
								label: t("statExpired"),
								value: expired,
								color: "bg-orange-50 text-orange-700",
							},
							{
								label: t("statBoosted"),
								value: boosted,
								color: "bg-amber-50 text-amber-700",
							},
						].map((stat) => (
							<div
								key={stat.label}
								className={`flex items-center gap-3 rounded-xl px-4 py-3 ${stat.color}`}
							>
								<span className="font-extrabold text-2xl">{stat.value}</span>
								<span className="font-medium text-xs opacity-80">
									{stat.label}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				{listings.length > 0 ? (
					<>
						<MyListingsClient listings={listings} />

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="mt-8 flex items-center justify-center gap-1">
								{page > 1 ? (
									<Link href={`/profile/me/listings?page=${page - 1}`}>
										<button
											type="button"
											className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-mid transition-all hover:border-brand-line hover:bg-subtle"
										>
											<ChevronLeft className="h-4 w-4" />
										</button>
									</Link>
								) : (
									<button
										type="button"
										disabled
										className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-ghost"
									>
										<ChevronLeft className="h-4 w-4" />
									</button>
								)}

								<div className="flex items-center gap-1">
									{Array.from({ length: totalPages }, (_, i) => i + 1)
										.filter(
											(p) =>
												p === 1 || p === totalPages || Math.abs(p - page) <= 1,
										)
										.reduce<(number | "...")[]>((acc, p, i, arr) => {
											if (i > 0 && p - (arr[i - 1] as number) > 1) {
												acc.push("...");
											}
											acc.push(p);
											return acc;
										}, [])
										.map((p, i) =>
											p === "..." ? (
												<span
													key={`ellipsis-${i}`}
													className="px-1.5 text-ink-faint text-xs"
												>
													...
												</span>
											) : (
												<Link key={p} href={`/profile/me/listings?page=${p}`}>
													<button
														type="button"
														className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg font-medium text-sm transition-all ${
															p === page
																? "bg-brand text-white shadow-blue-500/20 shadow-md"
																: "border border-line bg-surface text-ink-mid hover:border-brand-line hover:bg-subtle"
														}`}
													>
														{p}
													</button>
												</Link>
											),
										)}
								</div>

								{page < totalPages ? (
									<Link href={`/profile/me/listings?page=${page + 1}`}>
										<button
											type="button"
											className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-mid transition-all hover:border-brand-line hover:bg-subtle"
										>
											<ChevronRight className="h-4 w-4" />
										</button>
									</Link>
								) : (
									<button
										type="button"
										disabled
										className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-ghost"
									>
										<ChevronRight className="h-4 w-4" />
									</button>
								)}
							</div>
						)}
					</>
				) : (
					/* Empty state */
					<div className="relative overflow-hidden rounded-2xl border border-brand-tint bg-surface py-16 text-center">
						<div className="pattern-dots absolute inset-0 opacity-50" />
						<div className="relative">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-soft to-brand-tint">
								<Camera className="h-7 w-7 text-brand" />
							</div>
							<h3 className="font-bold text-ink text-lg">{t("emptyTitle")}</h3>
							<p className="mx-auto mt-1 max-w-xs text-ink-muted text-sm">
								{t("emptyBody")}
							</p>
							<Link href="/create">
								<Button className="mt-5 rounded-xl bg-gradient-to-r from-brand to-brand-bright px-6 font-bold shadow-blue-500/20 shadow-lg">
									<PlusCircle className="mr-2 h-4 w-4" />
									{t("emptyCta")}
								</Button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
