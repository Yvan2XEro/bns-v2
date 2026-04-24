import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";
import { useCallback, useMemo } from "react";
import { useAlert } from "../contexts/AlertContext";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getAuthModalParams } from "../lib/authRedirect";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FavoriteListingInput {
	id: string;
	[key: string]: unknown;
}

export interface Favorite {
	id: string;
	listing: FavoriteListingInput | string;
	user: string;
	createdAt: string;
}

export interface FavoritesResponse {
	docs: Favorite[];
	totalDocs: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user's favorites (up to 200).
 * Only enabled when the user is authenticated.
 */
export function useFavorites() {
	const { user, isLoading } = useAuth();

	return useQuery({
		queryKey: ["favorites"],
		queryFn: () =>
			api.get<FavoritesResponse>("/api/favorites?limit=200&depth=2"),
		enabled: !!user && !isLoading,
	});
}

/**
 * Returns whether a specific listing is in the user's favorites,
 * and the favorite document ID (needed for deletion).
 */
export function useIsFavorite(listingId: string): {
	isFavorite: boolean;
	favoriteId: string | undefined;
} {
	const { data } = useFavorites();

	if (!data?.docs) {
		return { isFavorite: false, favoriteId: undefined };
	}

	const favorite = data.docs.find((fav) => {
		const id = typeof fav.listing === "string" ? fav.listing : fav.listing?.id;
		return id === listingId;
	});

	return {
		isFavorite: !!favorite,
		favoriteId: favorite?.id,
	};
}

interface ToggleFavoriteInput {
	listingId: string;
	isFavorite: boolean;
	favoriteId?: string;
	listing?: FavoriteListingInput;
}

/**
 * Toggles a listing's favorite status.
 * - If currently favorited: deletes the favorite document.
 * - If not favorited: creates a new favorite document.
 *
 * Invalidates the favorites query on settle so the UI reflects the new state.
 */
export function useToggleFavorite() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			listingId,
			isFavorite,
			favoriteId,
		}: ToggleFavoriteInput) => {
			if (isFavorite && favoriteId) {
				return api.delete(`/api/favorites/${favoriteId}`);
			}
			return api.post("/api/favorites", { listing: listingId });
		},
		// Optimistic update: flip the cached state immediately
		onMutate: async ({ listingId, isFavorite, favoriteId, listing }) => {
			await queryClient.cancelQueries({ queryKey: ["favorites"] });

			const previous = queryClient.getQueryData<FavoritesResponse>([
				"favorites",
			]);

			queryClient.setQueryData<FavoritesResponse>(["favorites"], (old) => {
				if (!old) return old;

				if (isFavorite && favoriteId) {
					// Remove from cache
					return {
						...old,
						docs: old.docs.filter((f) => f.id !== favoriteId),
						totalDocs: old.totalDocs - 1,
					};
				}

				// Add a placeholder to cache (will be replaced by server data on settle)
				const placeholder: Favorite = {
					id: `__optimistic__${listingId}`,
					listing: listing ?? listingId,
					user: "",
					createdAt: new Date().toISOString(),
				};
				return {
					...old,
					docs: [...old.docs, placeholder],
					totalDocs: old.totalDocs + 1,
				};
			});

			return { previous };
		},
		onError: (_err, _vars, context) => {
			// Roll back on error
			if (context?.previous) {
				queryClient.setQueryData(["favorites"], context.previous);
			}
		},
		onSettled: () => {
			// Always refetch to ensure server truth
			queryClient.invalidateQueries({ queryKey: ["favorites"] });
		},
	});
}

export function useFavoriteActions() {
	const { user } = useAuth();
	const { showError } = useAlert();
	const pathname = usePathname();
	const favoritesQuery = useFavorites();
	const toggleMutation = useToggleFavorite();

	const favorites = favoritesQuery.data?.docs ?? [];

	const favoriteIds = useMemo(
		() =>
			new Set(
				favorites
					.map((fav) =>
						typeof fav.listing === "string" ? fav.listing : fav.listing?.id,
					)
					.filter(Boolean),
			),
		[favorites],
	);

	const findFavorite = useCallback(
		(listingId: string) =>
			favorites.find((fav) => {
				const id =
					typeof fav.listing === "string" ? fav.listing : fav.listing?.id;
				return id === listingId;
			}),
		[favorites],
	);

	const toggleFavorite = useCallback(
		(listing: FavoriteListingInput | string) => {
			const listingId = typeof listing === "string" ? listing : listing.id;

			if (!user) {
				router.push({
					pathname: "/auth/login",
					params: getAuthModalParams(pathname),
				});
				return;
			}

			const favorite = findFavorite(listingId);
			toggleMutation.mutate(
				{
					listingId,
					isFavorite: !!favorite,
					favoriteId: favorite?.id,
					listing: typeof listing === "string" ? undefined : listing,
				},
				{
					onError: (err) => {
						console.error(err);
						showError("Favoris", "Impossible de mettre a jour les favoris.");
					},
				},
			);
		},
		[findFavorite, pathname, showError, toggleMutation, user],
	);

	return {
		favorites,
		favoriteIds,
		isFavorite: (listingId: string) => favoriteIds.has(listingId),
		toggleFavorite,
		isLoading: favoritesQuery.isLoading,
		isPending: toggleMutation.isPending,
		refetch: favoritesQuery.refetch,
	};
}
