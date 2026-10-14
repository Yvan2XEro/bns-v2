import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { LocationSheet } from "@/src/components/location/LocationSheet";
import { useTranslation } from "@/src/lib/i18n";
import { formatPlaceLabel, type Place, rememberPlace } from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";

interface CityPickerProps {
	/** The stored city name, or the full place when the form keeps one. */
	value: string | Place | null;
	/**
	 * A `Place` carries optional `lat`/`lng`: a free-text place the user typed
	 * has no coordinates. Callers must handle that rather than assuming numbers.
	 */
	onSelect: (place: Place) => void;
	onClear?: () => void;
	placeholder?: string;
	title?: string;
	inputBg: string;
	borderColor: string;
	textColor: string;
	mutedColor: string;
}

/** A form field that opens the place sheet. */
export function CityPicker({
	value,
	onSelect,
	onClear,
	placeholder,
	title,
	inputBg,
	borderColor,
	textColor,
	mutedColor,
}: CityPickerProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const { location, selectPlace } = useUserLocation();

	const selected: Place | null =
		typeof value === "string"
			? value
				? { name: value, region: "", source: "saved" }
				: null
			: value;
	const label = selected ? formatPlaceLabel(selected) : "";
	const triggerLabel = placeholder ?? t("cityPicker.placeholder");

	const handleSelect = useCallback(
		(place: Place) => {
			onSelect(place);
			void rememberPlace(place);
			// The first city someone ever picks pre-fills the next form; a city
			// they already chose on purpose is never overwritten by a form.
			if (!location?.city) void selectPlace(place);
		},
		[onSelect, location?.city, selectPlace],
	);

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
				accessibilityRole="button"
				accessibilityLabel={label || triggerLabel}
				accessibilityHint={t("cityPicker.triggerHint")}
			>
				<Ionicons name="location-outline" size={18} color={mutedColor} />
				<Text
					style={[
						styles.triggerText,
						{ color: label ? textColor : mutedColor },
					]}
					numberOfLines={1}
				>
					{label || triggerLabel}
				</Text>
				{label && onClear ? (
					<Pressable
						onPress={onClear}
						hitSlop={12}
						accessibilityRole="button"
						accessibilityLabel={t("locationSheet.clear")}
					>
						<Ionicons name="close-circle" size={18} color={mutedColor} />
					</Pressable>
				) : (
					<Ionicons name="chevron-down" size={18} color={mutedColor} />
				)}
			</Pressable>
			<LocationSheet
				visible={open}
				onClose={() => setOpen(false)}
				onSelect={handleSelect}
				title={title}
				selected={selected}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
	},
	triggerText: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
});
