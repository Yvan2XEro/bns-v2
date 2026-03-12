"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "./server-api";

type ActionResult<T = unknown> =
	| { success: true; data?: T }
	| { success: false; error: string };

export async function updateProfile(
	userId: string,
	data: { name?: string; bio?: string; phone?: string; location?: string },
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

export async function toggleFavorite(
	listingId: string,
	action: "add" | "remove",
): Promise<ActionResult> {
	try {
		if (action === "add") {
			const res = await serverFetch("/api/favorites", {
				method: "POST",
				body: JSON.stringify({ listingId }),
			});
			if (!res.ok) return { success: false, error: "Failed to add favorite" };
		} else {
			const res = await serverFetch(`/api/favorites/${listingId}`, {
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
