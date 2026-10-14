import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	usePlaceSearch,
	usePopularPlaces,
	useRecentPlaces,
} from "@/src/hooks/usePlaces";
import { useTranslation } from "@/src/lib/i18n";
import { type Place, placeKey, placePickerView } from "@/src/lib/places";
import type { LocationFailure } from "@/src/lib/userLocation";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { BottomSheet } from "./BottomSheet";
import { ActionRow, PlaceRow, SectionHeader, type SheetRow } from "./SheetRows";

export interface LocationSheetProps {
	visible: boolean;
	onClose: () => void;
	onSelect: (place: Place) => void;
	title?: string;
	/** The current value, ticked in the list. */
	selected?: Pick<Place, "name" | "district" | "region" | "countryCode"> | null;
	/** Browse mode: offers "All cities" above everything else. */
	onSelectAll?: () => void;
	allSelected?: boolean;
}

const FAILURE_KEYS: Record<LocationFailure, string> = {
	"permission-denied": "locationSheet.permissionDenied",
	"services-disabled": "locationSheet.servicesDisabled",
	"position-unavailable": "locationSheet.positionUnavailable",
	"geocode-unavailable": "locationSheet.geocodeUnavailable",
};

export function LocationSheet(props: LocationSheetProps) {
	const { t } = useTranslation();
	return (
		<BottomSheet
			visible={props.visible}
			title={props.title ?? t("locationSheet.title")}
			onClose={props.onClose}
		>
			{/* Mounted only while open, so the query starts empty every time. */}
			{props.visible ? <LocationSheetBody {...props} /> : null}
		</BottomSheet>
	);
}

function LocationSheetBody({
	onClose,
	onSelect,
	selected,
	onSelectAll,
	allSelected,
}: LocationSheetProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const location = useUserLocation();
	const [failure, setFailure] = useState<LocationFailure | null>(null);
	const search = usePlaceSearch(query, location.coords);
	const recents = useRecentPlaces();
	const popular = usePopularPlaces();

	const view = useMemo(
		() => placePickerView({ query, results: search.places, recents, popular }),
		[query, search.places, recents, popular],
	);
	const selectedKey = selected?.name ? placeKey(selected) : null;

	const pick = useCallback(
		(place: Place) => {
			onSelect(place);
			onClose();
		},
		[onSelect, onClose],
	);

	const locate = useCallback(async () => {
		setFailure(null);
		// From a press, so this is allowed to show the OS permission dialog.
		const result = await location.requestDetection();
		// A failed attempt still returns the previously remembered location.
		const found = result.failure ? null : result.location;
		if (!found?.city) {
			setFailure(result.failure ?? "position-unavailable");
			return;
		}
		pick({
			name: found.city,
			...(found.district ? { district: found.district } : {}),
			region: found.region ?? "",
			...(found.countryCode ? { countryCode: found.countryCode } : {}),
			...(found.lat !== null && found.lng !== null
				? { lat: found.lat, lng: found.lng }
				: {}),
			source: "device",
		});
	}, [location, pick]);

	const rows = useMemo<SheetRow[]>(() => {
		const out: SheetRow[] = [{ type: "nearby", key: "nearby" }];
		if (onSelectAll) out.push({ type: "all", key: "all" });
		for (const section of view.sections) {
			out.push({
				type: "header",
				key: `h-${section.key}`,
				section: section.key,
			});
			for (const place of section.places) {
				out.push({
					type: "place",
					key: `${section.key}-${placeKey(place)}`,
					section: section.key,
					place,
				});
			}
		}
		if (view.typed) out.push({ type: "typed", key: "typed", text: view.typed });
		return out;
	}, [view, onSelectAll]);

	const status = search.failed
		? t("locationSheet.searchFailed")
		: !search.searching &&
				view.typed &&
				!view.sections.some((s) => s.key === "results")
			? t("locationSheet.noResults", { query: view.typed })
			: null;

	return (
		<View style={styles.body}>
			<View style={styles.searchWrap}>
				<View
					style={[
						styles.search,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Ionicons name="search" size={18} color={c.muted} />
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder={t("locationSheet.searchPlaceholder")}
						placeholderTextColor={c.muted}
						style={[styles.input, { color: c.text }]}
						autoCorrect={false}
						returnKeyType="search"
						accessibilityLabel={t("locationSheet.searchPlaceholder")}
					/>
					{query ? (
						<Pressable
							onPress={() => setQuery("")}
							hitSlop={12}
							accessibilityRole="button"
							accessibilityLabel={t("locationSheet.clear")}
						>
							<Ionicons name="close-circle" size={18} color={c.muted} />
						</Pressable>
					) : null}
				</View>
				{status ? (
					<Text style={[styles.status, { color: c.muted }]}>{status}</Text>
				) : null}
			</View>
			<FlashList
				data={rows}
				keyExtractor={(row) => row.key}
				getItemType={(row) => row.type}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={styles.list}
				renderItem={({ item }) => {
					switch (item.type) {
						case "nearby":
							return (
								<ActionRow
									icon="navigate"
									label={t("locationSheet.nearMe")}
									hint={
										failure
											? t(FAILURE_KEYS[failure])
											: location.detecting
												? t("locationSheet.locating")
												: t("locationSheet.nearMeHint")
									}
									busy={location.detecting}
									tone={failure ? "warning" : "primary"}
									onPress={locate}
								/>
							);
						case "all":
							return (
								<ActionRow
									icon="globe-outline"
									label={t("locationSheet.allCities")}
									hint={t("locationSheet.allCitiesHint")}
									selected={allSelected}
									onPress={() => {
										onSelectAll?.();
										onClose();
									}}
								/>
							);
						case "header":
							return <SectionHeader section={item.section} />;
						case "typed":
							return (
								<ActionRow
									icon="create-outline"
									label={t("locationSheet.useTyped", { query: item.text })}
									tone="neutral"
									onPress={() =>
										pick({ name: item.text, region: "", source: "custom" })
									}
								/>
							);
						case "place":
							return (
								<PlaceRow
									place={item.place}
									section={item.section}
									selected={placeKey(item.place) === selectedKey}
									onPress={() => pick(item.place)}
								/>
							);
					}
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	body: { flex: 1 },
	searchWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
	search: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 50,
		paddingHorizontal: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	input: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.body,
		paddingVertical: 12,
	},
	status: {
		fontSize: 13,
		fontFamily: Fonts.body,
		marginTop: 8,
		lineHeight: 18,
	},
	list: { paddingHorizontal: 12, paddingBottom: 24 },
});
