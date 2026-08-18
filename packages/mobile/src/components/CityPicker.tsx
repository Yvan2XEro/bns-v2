import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";
import {
	customPlace,
	formatPlaceLabel,
	type Place,
	placeKey,
	rememberPlace,
	searchPlaces,
} from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";

interface CityPickerProps {
	value: string;
	/**
	 * A `Place` carries optional `lat`/`lng`: a free-text place the user typed
	 * has no coordinates. Callers must handle that rather than assuming numbers.
	 */
	onSelect: (place: Place) => void;
	onClear?: () => void;
	placeholder?: string;
	inputBg: string;
	borderColor: string;
	textColor: string;
	mutedColor: string;
	primaryColor: string;
}

export function CityPicker({
	value,
	onSelect,
	onClear,
	placeholder,
	inputBg,
	borderColor,
	textColor,
	mutedColor,
	primaryColor,
}: CityPickerProps) {
	const { t } = useTranslation();
	const isDark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { centeredContent } = useResponsive();
	const [visible, setVisible] = useState(false);
	const [search, setSearch] = useState("");

	const triggerLabel = placeholder ?? t("cityPicker.placeholder");
	const searchLabel = t("cityPicker.searchPlaceholder");

	const { asPlace, canPrompt, detecting, requestDetection, selectPlace } =
		useUserLocation();

	const [results, setResults] = useState<Place[]>([]);

	// searchPlaces() is async because its last tier is the OS geocoder. Debounced
	// so typing does not fire a geocode per keystroke, and guarded so a slow
	// lookup cannot overwrite the results of a newer query.
	useEffect(() => {
		if (!visible) return;
		let cancelled = false;
		const query = search;

		const run = async () => {
			const places = await searchPlaces(query, {
				pinned: asPlace,
				homeCountryCode: asPlace?.countryCode ?? null,
			});
			if (!cancelled) setResults(places);
		};

		const timer = setTimeout(run, query.trim() ? 250 : 0);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [search, visible, asPlace]);

	// Offer the raw query as a selectable place when nothing matched. The server
	// stores `listing.location` as free text and searches it with `contains`, so
	// a place no tier knows about is still a first-class, searchable value.
	const trimmed = search.trim();
	const showCustomRow =
		trimmed.length >= 2 &&
		!results.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

	// Always reset the query with the modal, otherwise reopening the picker
	// shows a stale filtered list from the previous session.
	const closeModal = useCallback(() => {
		setVisible(false);
		setSearch("");
	}, []);

	const handleSelect = useCallback(
		(place: Place) => {
			onSelect(place);
			// Remembered so the picker becomes worldwide per user over time, at no
			// data cost, and so the profile can pre-fill this place elsewhere.
			void rememberPlace(place);
			void selectPlace(place);
			closeModal();
		},
		[onSelect, selectPlace, closeModal],
	);

	const handleUseMyLocation = useCallback(async () => {
		const result = await requestDetection();
		if (result.location) {
			const place: Place = {
				name: result.location.city ?? "",
				region: result.location.region ?? "",
				country: result.location.country ?? undefined,
				countryCode: result.location.countryCode ?? undefined,
				lat: result.location.lat ?? undefined,
				lng: result.location.lng ?? undefined,
				source: "device",
			};
			// A fix without a resolvable city name is useless as a listing location:
			// keep the picker open rather than writing an empty string.
			if (place.name) {
				onSelect(place);
				void rememberPlace(place);
				closeModal();
			}
		}
	}, [requestDetection, onSelect, closeModal]);

	const modalBg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const separatorColor = isDark ? "#1e3a5f" : "#e2e8f0";

	// The list is the only "confirm" affordance of this picker, so its last row
	// must clear the Android navigation bar / iOS home indicator. Padding goes on
	// the content container (not the SafeAreaView) so the scrollable area still
	// spans the full window and the last city stays reachable.
	const listContentStyle = useMemo(
		() => ({ paddingBottom: insets.bottom + 24 }),
		[insets.bottom],
	);

	return (
		<>
			<Pressable
				onPress={() => setVisible(true)}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
				accessibilityRole="button"
				accessibilityLabel={value || triggerLabel}
				accessibilityHint={t("cityPicker.triggerHint", {
					defaultValue: "Ouvre la liste des villes",
				})}
			>
				<Ionicons name="location-outline" size={16} color={mutedColor} />
				<Text
					style={[
						styles.triggerText,
						{ color: value ? textColor : mutedColor },
					]}
					numberOfLines={1}
				>
					{value || triggerLabel}
				</Text>
				{value && onClear ? (
					<Pressable
						onPress={onClear}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("search.clearSearch")}
					>
						<Ionicons name="close-circle" size={16} color={mutedColor} />
					</Pressable>
				) : (
					<Ionicons name="chevron-down" size={16} color={mutedColor} />
				)}
			</Pressable>

			<Modal
				visible={visible}
				animationType="slide"
				onRequestClose={closeModal}
				statusBarTranslucent
				navigationBarTranslucent
			>
				{/* `bottom` is deliberately excluded: the list must scroll under the
				    system bar, it just must not *end* under it. `left`/`right` keep
				    content off the notch in landscape. */}
				<SafeAreaView
					style={[styles.modalSafe, { backgroundColor: modalBg }]}
					edges={["top", "left", "right"]}
				>
					<KeyboardAvoidingView style={styles.flex} behavior="padding">
						{/* Header */}
						<View
							style={[
								styles.modalHeader,
								{ borderBottomColor: separatorColor },
							]}
						>
							<View style={[styles.modalHeaderRow, centeredContent]}>
								<Text
									style={[styles.modalTitle, { color: textColor }]}
									accessibilityRole="header"
								>
									{t("cityPicker.title", {
										defaultValue: "Choisir une ville",
									})}
								</Text>
								<Pressable
									onPress={closeModal}
									hitSlop={8}
									accessibilityRole="button"
									accessibilityLabel={t("common.close")}
								>
									<Ionicons name="close" size={24} color={textColor} />
								</Pressable>
							</View>
						</View>

						{/* Search */}
						<View style={[styles.searchBarWrap, centeredContent]}>
							<View
								style={[
									styles.searchBar,
									{
										backgroundColor: cardBg,
										borderColor: separatorColor,
									},
								]}
							>
								<Ionicons name="search-outline" size={16} color={mutedColor} />
								<TextInput
									value={search}
									onChangeText={setSearch}
									placeholder={searchLabel}
									placeholderTextColor={mutedColor}
									style={[styles.searchInput, { color: textColor }]}
									autoFocus
									autoCorrect={false}
									autoCapitalize="none"
									returnKeyType="search"
									accessibilityLabel={searchLabel}
								/>
								{search.length > 0 && (
									<Pressable
										onPress={() => setSearch("")}
										hitSlop={8}
										accessibilityRole="button"
										accessibilityLabel={t("search.clearSearch")}
									>
										<Ionicons
											name="close-circle"
											size={16}
											color={mutedColor}
										/>
									</Pressable>
								)}
							</View>
						</View>

						{/* List */}
						<FlatList
							data={results}
							// Name alone is not unique once the list is worldwide — there
							// is a Douala in more than one country's data.
							keyExtractor={(item) => placeKey(item)}
							ListHeaderComponent={
								canPrompt ? (
									<Pressable
										onPress={handleUseMyLocation}
										disabled={detecting}
										style={[
											styles.cityRow,
											{ borderBottomColor: separatorColor },
										]}
										accessibilityRole="button"
										accessibilityLabel={t("cityPicker.useMyLocation")}
									>
										<Ionicons
											name="locate-outline"
											size={18}
											color={primaryColor}
										/>
										<View style={styles.cityInfo}>
											<Text style={[styles.cityName, { color: primaryColor }]}>
												{t("cityPicker.useMyLocation")}
											</Text>
										</View>
										{detecting && (
											<ActivityIndicator size="small" color={primaryColor} />
										)}
									</Pressable>
								) : null
							}
							ListFooterComponent={
								showCustomRow ? (
									<Pressable
										onPress={() => handleSelect(customPlace(trimmed))}
										style={[
											styles.cityRow,
											{ borderBottomColor: separatorColor },
										]}
										accessibilityRole="button"
										accessibilityLabel={t("cityPicker.useTyped", {
											query: trimmed,
										})}
									>
										<Ionicons
											name="add-circle-outline"
											size={18}
											color={mutedColor}
										/>
										<View style={styles.cityInfo}>
											<Text style={[styles.cityName, { color: textColor }]}>
												{t("cityPicker.useTyped", { query: trimmed })}
											</Text>
										</View>
									</Pressable>
								) : null
							}
							renderItem={({ item }) => {
								const selected = value === item.name;
								const subtitle = formatPlaceLabel(item, {
									homeCountryCode: asPlace?.countryCode ?? null,
								});
								return (
									<Pressable
										onPress={() => handleSelect(item)}
										style={[
											styles.cityRow,
											{ borderBottomColor: separatorColor },
										]}
										accessibilityRole="button"
										accessibilityLabel={subtitle || item.name}
										accessibilityState={{ selected }}
									>
										{item.source === "recent" && (
											<Ionicons
												name="time-outline"
												size={16}
												color={mutedColor}
											/>
										)}
										<View style={styles.cityInfo}>
											<Text style={[styles.cityName, { color: textColor }]}>
												{item.name}
											</Text>
											<Text style={[styles.cityRegion, { color: mutedColor }]}>
												{item.region || item.country || ""}
											</Text>
										</View>
										{selected && (
											<Ionicons
												name="checkmark-circle"
												size={20}
												color={primaryColor}
											/>
										)}
									</Pressable>
								);
							}}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							showsVerticalScrollIndicator={false}
							contentContainerStyle={[listContentStyle, centeredContent]}
							ListEmptyComponent={
								showCustomRow ? null : (
									<View style={styles.emptyState}>
										<Text style={[styles.emptyText, { color: mutedColor }]}>
											{t("cityPicker.empty")}
										</Text>
									</View>
								)
							}
						/>
					</KeyboardAvoidingView>
				</SafeAreaView>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 13,
	},
	triggerText: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	flex: { flex: 1 },
	modalSafe: { flex: 1 },
	modalHeader: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderBottomWidth: 1,
	},
	modalHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	modalTitle: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	searchBarWrap: {
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 12,
		borderWidth: 1,
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
		paddingVertical: 0,
	},
	cityRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	cityInfo: { flex: 1 },
	cityName: {
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
	},
	cityRegion: {
		fontSize: 12,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	emptyState: {
		padding: 40,
		alignItems: "center",
	},
	emptyText: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
});
