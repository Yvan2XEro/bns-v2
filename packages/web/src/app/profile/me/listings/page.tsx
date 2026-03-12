import Link from "next/link";
import { Button } from "~/components/ui/button";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, User } from "~/types";
import { MyListingsClient } from "./listings-client";

const PER_PAGE = 12;

async function getUserListings(
	userId: string,
	page: number,
): Promise<{ listings: Listing[]; total: number }> {
	try {
		const res = await serverFetch(
			`/api/listings?where[seller][equals]=${userId}&limit=${PER_PAGE}&page=${page}&sort=-createdAt&depth=1`,
		);
		if (!res.ok) return { listings: [], total: 0 };
		const data = await res.json();
		return { listings: data.docs || [], total: data.totalDocs || 0 };
	} catch {
		return { listings: [], total: 0 };
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
	const { listings, total } = await getUserListings(user.id, page);
	const totalPages = Math.ceil(total / PER_PAGE);

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">My Listings</h1>
					<p className="text-muted-foreground text-sm">
						{total} listing{total !== 1 ? "s" : ""}
					</p>
				</div>
				<Link href="/create">
					<Button>Create Listing</Button>
				</Link>
			</div>

			{listings.length > 0 ? (
				<>
					<MyListingsClient listings={listings} />

					{totalPages > 1 && (
						<div className="mt-8 flex items-center justify-center gap-2">
							{page > 1 && (
								<Link href={`/profile/me/listings?page=${page - 1}`}>
									<Button variant="outline" size="sm">
										Previous
									</Button>
								</Link>
							)}
							<div className="flex items-center gap-1">
								{Array.from({ length: totalPages }, (_, i) => i + 1)
									.filter(
										(p) =>
											p === 1 || p === totalPages || Math.abs(p - page) <= 2,
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
												className="px-2 text-muted-foreground"
											>
												...
											</span>
										) : (
											<Link key={p} href={`/profile/me/listings?page=${p}`}>
												<Button
													variant={p === page ? "default" : "outline"}
													size="sm"
													className="min-w-[36px]"
												>
													{p}
												</Button>
											</Link>
										),
									)}
							</div>
							{page < totalPages && (
								<Link href={`/profile/me/listings?page=${page + 1}`}>
									<Button variant="outline" size="sm">
										Next
									</Button>
								</Link>
							)}
						</div>
					)}
				</>
			) : (
				<div className="py-16 text-center">
					<p className="text-lg text-muted-foreground">
						You haven&apos;t created any listings yet
					</p>
					<Link href="/create">
						<Button className="mt-4">Create Your First Listing</Button>
					</Link>
				</div>
			)}
		</div>
	);
}
