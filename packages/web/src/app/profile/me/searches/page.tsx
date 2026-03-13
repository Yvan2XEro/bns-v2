import { ArrowLeft, Bookmark, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "~/components/ui/badge";
import { deleteSavedSearch } from "~/lib/actions";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { User } from "~/types";

interface SavedSearch {
	id: string;
	name: string;
	query?: string;
	filters?: {
		category?: string;
		minPrice?: string;
		maxPrice?: string;
		location?: string;
		sort?: string;
		attributes?: Record<string, string>;
	};
	url: string;
	createdAt: string;
}

async function getSavedSearches(): Promise<SavedSearch[]> {
	try {
		const res = await serverFetch(
			"/api/saved-searches?sort=-createdAt&limit=50",
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.docs || [];
	} catch {
		return [];
	}
}

function DeleteButton({ id }: { id: string }) {
	return (
		<form
			action={async () => {
				"use server";
				await deleteSavedSearch(id);
			}}
		>
			<button
				type="submit"
				className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-red-600"
				title="Delete saved search"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</form>
	);
}

export default async function SavedSearchesPage() {
	const user = (await getAuthUser()) as User | null;
	if (!user) return redirect("/login");

	const searches = await getSavedSearches();

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Header */}
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
					<Link
						href="/profile/me"
						className="mb-4 inline-flex items-center gap-1 text-[#64748B] text-sm transition-colors hover:text-[#1E40AF]"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to profile
					</Link>
					<div className="flex items-start justify-between">
						<div>
							<h1 className="font-extrabold text-2xl text-[#0F172A]">
								Saved Searches
							</h1>
							<p className="mt-1 text-[#64748B] text-sm">
								Quickly re-run your saved searches
							</p>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-[#EFF6FF] px-4 py-3 text-[#1E40AF]">
							<span className="font-extrabold text-2xl">{searches.length}</span>
							<span className="font-medium text-xs opacity-80">Saved</span>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				{searches.length > 0 ? (
					<div className="space-y-3">
						{searches.map((search) => (
							<div
								key={search.id}
								className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD]"
							>
								<Link href={search.url} className="min-w-0 flex-1">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF]">
											<Search className="h-5 w-5 text-[#1E40AF]" />
										</div>
										<div className="min-w-0">
											<p className="truncate font-medium text-[#0F172A]">
												{search.name}
											</p>
											<div className="mt-1 flex flex-wrap items-center gap-1.5">
												{search.query && (
													<Badge variant="secondary" className="text-xs">
														&quot;{search.query}&quot;
													</Badge>
												)}
												{search.filters?.category && (
													<Badge variant="secondary" className="text-xs">
														Category
													</Badge>
												)}
												{search.filters?.location && (
													<Badge variant="secondary" className="text-xs">
														{search.filters.location}
													</Badge>
												)}
												{(search.filters?.minPrice ||
													search.filters?.maxPrice) && (
													<Badge variant="secondary" className="text-xs">
														{search.filters.minPrice || "0"} -{" "}
														{search.filters.maxPrice || "..."} XAF
													</Badge>
												)}
												<span className="text-[#94A3B8] text-xs">
													{new Date(search.createdAt).toLocaleDateString()}
												</span>
											</div>
										</div>
									</div>
								</Link>
								<DeleteButton id={search.id} />
							</div>
						))}
					</div>
				) : (
					<div className="relative overflow-hidden rounded-2xl border border-[#DBEAFE] bg-white py-16 text-center">
						<div className="relative">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]">
								<Bookmark className="h-7 w-7 text-[#1E40AF]" />
							</div>
							<h3 className="font-bold text-[#0F172A] text-lg">
								No saved searches yet
							</h3>
							<p className="mx-auto mt-1 max-w-xs text-[#64748B] text-sm">
								When you find a search you want to track, click the &quot;Save
								search&quot; button to save it here.
							</p>
							<Link href="/search">
								<button
									type="button"
									className="mt-5 rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] px-6 py-2.5 font-bold text-sm text-white shadow-blue-500/20 shadow-lg"
								>
									<Search className="mr-2 inline h-4 w-4" />
									Go to search
								</button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
