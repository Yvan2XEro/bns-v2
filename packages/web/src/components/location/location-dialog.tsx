"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import {
	Globe,
	Loader2,
	Navigation,
	PencilLine,
	Search,
	X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useAppConfig } from "~/hooks/use-app-config";
import { usePlacePreferences } from "~/hooks/use-place-preferences";
import { usePlaceSearch, usePopularPlaces } from "~/hooks/use-places";
import { DeviceLocationError, locateDevice } from "~/lib/device-location";
import {
	customPlace,
	type Place,
	placeCoords,
	placeKey,
	placePickerView,
} from "../../../../api/src/contracts/places";
import { ActionRow, PlaceRow, SectionTitle } from "./location-rows";

export interface LocationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (place: Place) => void;
	title?: string;
	selected?: Pick<Place, "name" | "district" | "region" | "countryCode"> | null;
	/** Browse mode: offers "All cities" above everything else. */
	onSelectAll?: () => void;
	allSelected?: boolean;
}

/**
 * The place picker: a centred dialog on wide screens, a bottom sheet on
 * phones. Search (Photon), "near me", recent places and the platform's
 * popular cities, in that order of intent.
 */
export function LocationDialog(props: LocationDialogProps) {
	const t = useTranslations("LocationPicker");
	return (
		<DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="location-overlay fixed inset-0 z-50 bg-[#0F172A]/55 backdrop-blur-[2px]" />
				<DialogPrimitive.Content
					aria-describedby={undefined}
					className="location-sheet sm:-translate-x-1/2 sm:-translate-y-1/2 fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] min-h-[60dvh] flex-col rounded-t-3xl bg-canvas pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(640px,85vh)] sm:min-h-0 sm:w-full sm:max-w-lg sm:rounded-3xl"
				>
					<div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
					<div className="flex items-center justify-between gap-3 px-5 pt-3 pb-1 sm:pt-5">
						<DialogPrimitive.Title className="font-bold font-heading text-ink text-xl">
							{props.title ?? t("title")}
						</DialogPrimitive.Title>
						<DialogPrimitive.Close
							className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-ink transition-colors hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
							aria-label={t("close")}
						>
							<X className="h-5 w-5" />
						</DialogPrimitive.Close>
					</div>
					{props.open ? <LocationDialogBody {...props} /> : null}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

const FAILURE_KEYS = {
	unsupported: "unsupported",
	"permission-denied": "permissionDenied",
	"position-unavailable": "positionUnavailable",
	"geocode-unavailable": "geocodeUnavailable",
} as const;

function LocationDialogBody({
	onOpenChange,
	onSelect,
	selected,
	onSelectAll,
	allSelected,
}: LocationDialogProps) {
	const t = useTranslations("LocationPicker");
	const lang = useLocale();
	const { photonUrl } = useAppConfig();
	const [query, setQuery] = useState("");
	const { place: myPlace, recents } = usePlacePreferences();
	const search = usePlaceSearch(query, placeCoords(myPlace));
	const popular = usePopularPlaces();
	const view = useMemo(
		() => placePickerView({ query, results: search.places, recents, popular }),
		[query, search.places, recents, popular],
	);
	const selectedKey = selected?.name ? placeKey(selected) : null;
	const typed = view.typed;

	const pick = (place: Place) => {
		onSelect(place);
		onOpenChange(false);
	};

	const nearMe = useMutation({
		mutationFn: () => locateDevice(photonUrl, lang),
		onSuccess: pick,
	});
	const failure =
		nearMe.error instanceof DeviceLocationError ? nearMe.error.failure : null;

	const status = search.failed
		? t("searchFailed")
		: !search.searching &&
				typed &&
				!view.sections.some((s) => s.key === "results")
			? t("noResults", { query: typed ?? "" })
			: null;

	return (
		<>
			<div className="px-5 pt-3 pb-2">
				<label className="flex h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
					<Search className="h-5 w-5 shrink-0 text-ink-faint" />
					<span className="sr-only">{t("searchLabel")}</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t("searchPlaceholder")}
						autoComplete="off"
						className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
					/>
					{search.searching ? (
						<Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-faint" />
					) : null}
				</label>
				<p className="min-h-5 pt-2 text-ink-muted text-sm" aria-live="polite">
					{status}
				</p>
			</div>
			<div className="flex-1 overflow-y-auto px-3 pb-4">
				<ActionRow
					icon={
						nearMe.isPending ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Navigation className="h-5 w-5" />
						)
					}
					label={t("nearMe")}
					hint={
						failure
							? t(FAILURE_KEYS[failure])
							: nearMe.isPending
								? t("locating")
								: t("nearMeHint")
					}
					tone={failure ? "warning" : "primary"}
					disabled={nearMe.isPending}
					onClick={() => nearMe.mutate()}
				/>
				{onSelectAll ? (
					<ActionRow
						icon={<Globe className="h-5 w-5" />}
						label={t("allCities")}
						hint={t("allCitiesHint")}
						selected={allSelected}
						onClick={() => {
							onSelectAll();
							onOpenChange(false);
						}}
					/>
				) : null}
				{view.sections.map((section) => (
					<section key={section.key} aria-labelledby={`places-${section.key}`}>
						<SectionTitle id={`places-${section.key}`} section={section.key} />
						<ul>
							{section.places.map((place) => (
								<li key={placeKey(place)}>
									<PlaceRow
										place={place}
										section={section.key}
										selected={placeKey(place) === selectedKey}
										onClick={() => pick(place)}
									/>
								</li>
							))}
						</ul>
					</section>
				))}
				{typed ? (
					<ActionRow
						icon={<PencilLine className="h-5 w-5" />}
						label={t("useTyped", { query: typed })}
						tone="neutral"
						onClick={() => pick(customPlace(typed))}
					/>
				) : null}
			</div>
		</>
	);
}
