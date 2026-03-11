import { serverFetch } from "~/lib/server-api";
import type { Category } from "~/types";
import { CreateListingForm } from "./create-listing-form";

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

export default async function CreateListingPage() {
	const categories = await getCategories();

	return (
		<div className="container mx-auto max-w-3xl px-4 py-8">
			<CreateListingForm categories={categories} />
		</div>
	);
}
