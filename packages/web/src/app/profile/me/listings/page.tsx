import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Package, PlusCircle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, User } from "~/types";
import { MyListingsClient } from "./listings-client";

const PER_PAGE = 12;

async function getUserListings(
	userId: number,
	page: number,
): Promise<{ listings: Listing[]; total: number; published: number; sold: number; boosted: number }> {
	try {
		const res = await serverFetch(
			`/api/listings?where[seller][equals]=${userId}&limit=${PER_PAGE}&page=${page}&sort=-createdAt&depth=1`,
		);
		if (!res.ok) return { listings: [], total: 0, published: 0, sold: 0, boosted: 0 };
		const data = await res.json();
		const docs: Listing[] = data.docs || [];
		return {
			listings: docs,
			total: data.totalDocs || 0,
			published: docs.filter((l) => l.status === "published").length,
			sold: docs.filter((l) => l.status === "sold").length,
			boosted: docs.filter((l) => l.boostedUntil && new Date(l.boostedUntil) > new Date()).length,
		};
	} catch {
		return { listings: [], total: 0, published: 0, sold: 0, boosted: 0 };
	}
}

interface PageProps {
	searchParams: Promise<{ page?: string }>;
}

export default async function MyListingsPage({ searchParams }: PageProps) {
	const user = (await getAuthUser()) as User | null;
	if (!user) return null;

	const { page: pageParam } = await searchParams;
	const page = Math.max(1, Number(pageParam) || 1);
	const { listings, total, published, sold, boosted } = await getUserListings(user.id, page);
	const totalPages = Math.ceil(total / PER_PAGE);

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Header */}
			<div className="border-b border-[#E2E8F0] bg-white">
				<div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
					<Link href="/profile/me" className="mb-4 inline-flex items-center gap-1 text-sm text-[#64748B] transition-colors hover:text-[#1E40AF]">
						<ArrowLeft className="h-4 w-4" />
						Back to profile
					</Link>
					<div className="flex items-start justify-between">
						<div>
							<h1 className="text-2xl font-extrabold text-[#0F172A]">My Listings</h1>
							<p className="mt-1 text-sm text-[#64748B]">
								Manage, edit and boost your listings
							</p>
						</div>
						<Link href="/create">
							<Button className="rounded-xl bg-[#F59E0B] font-bold text-[#0F172A] shadow-md shadow-amber-500/15 hover:bg-[#D97706]">
								<PlusCircle className="mr-2 h-4 w-4" />
								New listing
							</Button>
						</Link>
					</div>

					{/* Stats */}
					<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{[
							{ label: "Total", value: total, color: "bg-[#EFF6FF] text-[#1E40AF]" },
							{ label: "Active", value: published, color: "bg-emerald-50 text-emerald-700" },
							{ label: "Sold", value: sold, color: "bg-[#F1F5F9] text-[#64748B]" },
							{ label: "Boosted", value: boosted, color: "bg-amber-50 text-amber-700" },
						].map((stat) => (
							<div key={stat.label} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${stat.color}`}>
								<span className="text-2xl font-extrabold">{stat.value}</span>
								<span className="text-xs font-medium opacity-80">{stat.label}</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
				{listings.length > 0 ? (
					<>
						<MyListingsClient listings={listings} />

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="mt-8 flex items-center justify-center gap-1">
								{page > 1 ? (
									<Link href={`/profile/me/listings?page=${page - 1}`}>
										<button className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-all hover:bg-[#F1F5F9] hover:border-[#93C5FD]">
											<ChevronLeft className="h-4 w-4" />
										</button>
									</Link>
								) : (
									<button disabled className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#CBD5E1]">
										<ChevronLeft className="h-4 w-4" />
									</button>
								)}

								<div className="flex items-center gap-1">
									{Array.from({ length: totalPages }, (_, i) => i + 1)
										.filter(
											(p) =>
												p === 1 ||
												p === totalPages ||
												Math.abs(p - page) <= 1,
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
												<span key={`ellipsis-${i}`} className="px-1.5 text-xs text-[#94A3B8]">
													...
												</span>
											) : (
												<Link key={p} href={`/profile/me/listings?page=${p}`}>
													<button
														className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg text-sm font-medium transition-all ${
															p === page
																? "bg-[#1E40AF] text-white shadow-md shadow-blue-500/20"
																: "border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] hover:border-[#93C5FD]"
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
										<button className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-all hover:bg-[#F1F5F9] hover:border-[#93C5FD]">
											<ChevronRight className="h-4 w-4" />
										</button>
									</Link>
								) : (
									<button disabled className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#CBD5E1]">
										<ChevronRight className="h-4 w-4" />
									</button>
								)}
							</div>
						)}
					</>
				) : (
					/* Empty state */
					<div className="relative overflow-hidden rounded-2xl border border-[#DBEAFE] bg-white py-16 text-center">
						<div className="absolute inset-0 pattern-dots opacity-50" />
						<div className="relative">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]">
								<Camera className="h-7 w-7 text-[#1E40AF]" />
							</div>
							<h3 className="text-lg font-bold text-[#0F172A]">
								No listings yet
							</h3>
							<p className="mx-auto mt-1 max-w-xs text-sm text-[#64748B]">
								Snap a photo, set a price, and start selling to thousands of buyers near you.
							</p>
							<Link href="/create">
								<Button className="mt-5 rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] px-6 font-bold shadow-lg shadow-blue-500/20">
									<PlusCircle className="mr-2 h-4 w-4" />
									Create your first listing
								</Button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
