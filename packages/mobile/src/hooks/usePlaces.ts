import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { useDebouncedValue } from "@/src/components/sellerOrders/useClock";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import {
	getRecentPlacesSnapshot,
	type Place,
	searchPlaces,
	subscribeRecentPlaces,
} from "@/src/lib/places";
import {
	PLACE_QUERY_MIN_LENGTH,
	type PopularPlacesResponse,
	popularPlacesRequest,
	popularToPlace,
} from "../../../api/src/contracts/places";

type Coords = { lat: number; lng: number } | null;

export function placeSearchKey(
	photonUrl: string | null,
	query: string,
	lang: string,
	bias: Coords,
) {
	// Rounded: a bias that moves a few metres must not refetch.
	const biasKey = bias
		? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}`
		: "market";
	return ["places", "search", photonUrl, lang, biasKey, query] as const;
}

/** Photon autocomplete, debounced, cached per query for the session. */
export function usePlaceSearch(query: string, bias: Coords = null) {
	const { photonUrl } = useAppConfig();
	const { i18n } = useTranslation();
	const trimmed = query.trim();
	const settled = useDebouncedValue(trimmed, 250);
	const enabled = !!photonUrl && settled.length >= PLACE_QUERY_MIN_LENGTH;

	const search = useQuery({
		queryKey: placeSearchKey(photonUrl, settled, i18n.language, bias),
		queryFn: ({ signal }) =>
			searchPlaces(photonUrl ?? "", settled, {
				bias,
				lang: i18n.language,
				signal,
			}),
		enabled,
		staleTime: 60 * 60 * 1000,
		placeholderData: keepPreviousData,
		retry: 1,
	});

	return {
		places: enabled ? (search.data ?? []) : [],
		searching: enabled && (search.isFetching || trimmed !== settled),
		failed: enabled && search.isError,
		/** No geocoder configured: the picker offers the typed text instead. */
		unavailable: !photonUrl,
	};
}

/** The cities the platform's listings concentrate in. */
export function usePopularPlaces(): Array<Place & { listings: number }> {
	const request = popularPlacesRequest();
	const { data } = useQuery({
		queryKey: request.queryKey,
		queryFn: () => api.get<PopularPlacesResponse>(request.path),
		staleTime: 10 * 60 * 1000,
	});
	return useMemo(
		() =>
			(data?.places ?? []).map((popular) => ({
				...popularToPlace(popular),
				listings: popular.listings,
			})),
		[data],
	);
}

/** Places this device confirmed recently, newest first. */
export function useRecentPlaces(): Place[] {
	return useSyncExternalStore(subscribeRecentPlaces, getRecentPlacesSnapshot);
}
