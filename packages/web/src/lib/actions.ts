"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "./server-api";

type ActionResult<T = unknown> =
	| { success: true; data?: T }
	| { success: false; error: string };

export async function updateProfile(
	userId: string,
	data: {
		name?: string;
		bio?: string;
		phone?: string;
		location?: string;
		avatar?: string;
	},
): Promise<ActionResult> {
	try {
		const res = await serverFetch(`/api/users/${userId}`, {
			method: "PATCH",
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return {
				success: false,
				error: err.errors?.[0]?.message || "Failed to update profile",
			};
		}

		revalidatePath("/profile/me");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to update profile" };
	}
}

export async function deleteListing(id: string): Promise<ActionResult> {
	try {
		const res = await serverFetch(`/api/listings/${id}`, {
			method: "DELETE",
		});

		if (!res.ok) {
			return { success: false, error: "Failed to delete listing" };
		}

		revalidatePath("/profile/me/listings");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to delete listing" };
	}
}

export async function saveSearch(data: {
	name: string;
	query: string;
	filters: Record<string, unknown>;
	url: string;
}): Promise<ActionResult> {
	try {
		const res = await serverFetch("/api/saved-searches", {
			method: "POST",
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return {
				success: false,
				error: err.errors?.[0]?.message || "Failed to save search",
			};
		}

		revalidatePath("/profile/me/searches");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to save search" };
	}
}

export async function toggleSearchAlert(
	id: string,
	enabled: boolean,
): Promise<ActionResult> {
	try {
		const res = await serverFetch(`/api/saved-searches/${id}`, {
			method: "PATCH",
			body: JSON.stringify({ alertEnabled: enabled }),
		});

		if (!res.ok) {
			return { success: false, error: "Failed to update alert preference" };
		}

		revalidatePath("/profile/me/searches");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to update alert preference" };
	}
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
	try {
		const res = await serverFetch(`/api/saved-searches/${id}`, {
			method: "DELETE",
		});

		if (!res.ok) {
			return { success: false, error: "Failed to delete saved search" };
		}

		revalidatePath("/profile/me/searches");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to delete saved search" };
	}
}

export async function markListingAsSold(
	listingId: string,
): Promise<ActionResult> {
	try {
		const res = await serverFetch(`/api/listings/${listingId}`, {
			method: "PATCH",
			body: JSON.stringify({ status: "sold" }),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return {
				success: false,
				error: err.errors?.[0]?.message || "Failed to mark listing as sold",
			};
		}

		revalidatePath("/profile/me/listings");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to mark listing as sold" };
	}
}

export async function renewListing(listingId: string): Promise<ActionResult> {
	try {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 30);

		const res = await serverFetch(`/api/listings/${listingId}`, {
			method: "PATCH",
			body: JSON.stringify({
				status: "pending",
				expiresAt: expiresAt.toISOString(),
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return {
				success: false,
				error: err.errors?.[0]?.message || "Failed to renew listing",
			};
		}

		revalidatePath("/profile/me/listings");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to renew listing" };
	}
}

export async function createBoostPayment(
	listingId: string,
	duration: "7" | "14" | "30",
): Promise<ActionResult<{ paymentUrl: string }>> {
	try {
		const res = await serverFetch("/api/public/boost", {
			method: "POST",
			body: JSON.stringify({ listingId, duration }),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return {
				success: false,
				error: err.error || "Failed to create boost payment",
			};
		}

		const data = await res.json();
		if (data.paymentUrl) {
			return { success: true, data: { paymentUrl: data.paymentUrl } };
		}

		return {
			success: false,
			error: "Payment URL not available. Please try again later.",
		};
	} catch {
		return { success: false, error: "Failed to create boost payment" };
	}
}

export async function toggleFavorite(
	listingId: string,
	action: "add" | "remove",
): Promise<ActionResult> {
	try {
		// Check if favorite already exists
		const findRes = await serverFetch(
			`/api/favorites?where[listing][equals]=${listingId}&limit=1`,
		);
		if (!findRes.ok)
			return { success: false, error: "Failed to check favorite" };
		const findData = await findRes.json();
		const existingFav = findData.docs?.[0];

		if (action === "add") {
			// Already favorited — no-op, still success
			if (existingFav) {
				return { success: true };
			}

			const res = await serverFetch("/api/favorites", {
				method: "POST",
				body: JSON.stringify({ listing: listingId }),
			});
			if (!res.ok) return { success: false, error: "Failed to add favorite" };
		} else {
			// Not favorited — no-op, still success
			if (!existingFav) {
				return { success: true };
			}

			const res = await serverFetch(`/api/favorites/${existingFav.id}`, {
				method: "DELETE",
			});
			if (!res.ok)
				return { success: false, error: "Failed to remove favorite" };
		}

		revalidatePath("/favorites");
		return { success: true };
	} catch {
		return { success: false, error: "Failed to update favorite" };
	}
}
