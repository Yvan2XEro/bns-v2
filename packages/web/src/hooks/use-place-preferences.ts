"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "~/hooks/use-auth";
import { usersApi } from "~/lib/api";
import {
	getPreferences,
	getServerPreferences,
	homeLocationFromPlace,
	placeFromHomeLocation,
	reconcileWithProfile,
	subscribePreferences,
	updatePreferences,
	withRecent,
} from "~/lib/place-preferences";
import type { Place } from "../../../api/src/contracts/places";

// Module scope: every picker on the page shares one reconciliation.
let reconciledUserId: string | null = null;

/** The places this browser remembers, mirrored onto the signed-in profile. */
export function usePlacePreferences() {
	const prefs = useSyncExternalStore(
		subscribePreferences,
		getPreferences,
		getServerPreferences,
	);
	const { user } = useAuth();

	const mirror = useMutation({
		mutationFn: (input: { userId: string; place: Place; at: string }) =>
			usersApi.update(input.userId, {
				homeLocation: homeLocationFromPlace(input.place, input.at),
			}),
		// The browser copy stays authoritative; the next sign-in carries it up.
		retry: 1,
	});
	const { mutate: pushToProfile } = mirror;

	useEffect(() => {
		if (!user || reconciledUserId === user.id) return;
		reconciledUserId = user.id;
		const current = getPreferences();
		const decision = reconcileWithProfile(current, user.homeLocation);
		if (decision === "adopt") {
			updatePreferences(() => ({
				place: placeFromHomeLocation(user.homeLocation),
				placeUpdatedAt: user.homeLocation?.updatedAt ?? null,
			}));
		} else if (decision === "push" && current.place && current.placeUpdatedAt) {
			pushToProfile({
				userId: user.id,
				place: current.place,
				at: current.placeUpdatedAt,
			});
		}
	}, [user, pushToProfile]);

	const remember = useCallback((place: Place) => {
		updatePreferences((current) => ({
			recents: withRecent(current.recents, place),
		}));
	}, []);

	const selectPlace = useCallback(
		(place: Place) => {
			const at = new Date().toISOString();
			updatePreferences((current) => ({
				place,
				placeUpdatedAt: at,
				recents: withRecent(current.recents, place),
			}));
			if (user) pushToProfile({ userId: user.id, place, at });
		},
		[user, pushToProfile],
	);

	/** Choosing a city to browse is also the user saying where they are. */
	const setBrowsePlace = useCallback(
		(place: Place | null) => {
			updatePreferences(() => ({ browseAll: place === null }));
			if (place) selectPlace(place);
		},
		[selectPlace],
	);

	return {
		place: prefs.place,
		browsePlace: prefs.browseAll ? null : prefs.place,
		recents: prefs.recents,
		remember,
		selectPlace,
		setBrowsePlace,
	};
}
