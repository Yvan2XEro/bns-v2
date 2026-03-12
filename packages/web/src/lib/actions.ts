"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "./server-api";

type ActionResult<T = unknown> =
	| { success: true; data?: T }
	| { success: false; error: string };

export async function updateProfile(
	userId: number,
	data: { name?: string; bio?: string; phone?: string; location?: string; avatar?: number },
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

export async function deleteListing(id: number): Promise<ActionResult> {
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

export async function toggleFavorite(
	listingId: number,
	action: "add" | "remove",
): Promise<ActionResult> {
	try {
		if (action === "add") {
			// Payload expects the collection fields: user is auto-set via hook or we need to get the current user
			const meRes = await serverFetch("/api/users/me");
			if (!meRes.ok) return { success: false, error: "Not authenticated" };
			const meData = await meRes.json();
			const userId = meData.user?.id;
			if (!userId) return { success: false, error: "Not authenticated" };

			const res = await serverFetch("/api/favorites", {
				method: "POST",
				body: JSON.stringify({ user: userId, listing: listingId }),
			});
			if (!res.ok) return { success: false, error: "Failed to add favorite" };
		} else {
			// Find the favorite document by listing ID, then delete it
			const findRes = await serverFetch(
				`/api/favorites?where[listing][equals]=${listingId}&limit=1`,
			);
			if (!findRes.ok)
				return { success: false, error: "Failed to find favorite" };

			const findData = await findRes.json();
			const favDoc = findData.docs?.[0];
			if (!favDoc)
				return { success: false, error: "Favorite not found" };

			const res = await serverFetch(`/api/favorites/${favDoc.id}`, {
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
