import { redirect } from "next/navigation";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Category, Listing } from "~/types";
import { EditListingForm } from "./edit-listing-form";

async function getListing(id: string): Promise<Listing | null> {
	try {
		const res = await serverFetch(`/api/listings/${id}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/categories");
		if (!res.ok) return [];
		const data = await res.json();
		return data.categories || [];
	} catch {
		return [];
	}
}

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: PageProps) {
	const { id } = await params;
	const [user, listing, categories] = await Promise.all([
		getAuthUser(),
		getListing(id),
		getCategories(),
	]);

	if (!user) {
		redirect(`/auth/login?redirect=/listing/${id}/edit`);
	}

	if (!listing) {
		redirect("/");
	}

	const sellerId =
		typeof listing.seller === "object" ? listing.seller?.id : listing.seller;
	if (sellerId !== user.id) {
		redirect(`/listing/${id}`);
	}

	return (
		<div className="container mx-auto max-w-3xl px-4 py-8">
			<EditListingForm listing={listing} categories={categories} />
		</div>
	);
}
