import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { districtName } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import {
	coordinatesText,
	type SavedAddress,
	savedAddressToInput,
} from "@/src/lib/savedAddresses";

/**
 * One saved address. No map on mobile yet (it needs a native module, planned
 * with the next native build): the landmark and the coordinates stand in.
 */
export function SavedAddressCard({
	address,
	cityLabel,
	selected = false,
	disabledReason,
	onSelect,
	actions,
}: {
	address: SavedAddress;
	cityLabel: string;
	selected?: boolean;
	disabledReason?: string | null;
	onSelect?: () => void;
	actions?: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const disabled = Boolean(disabledReason);

	return (
		<View
			style={[
				styles.card,
				selected
					? {
							borderWidth: 2,
							borderColor: c.primary,
							backgroundColor: c.primarySoft,
						}
					: { borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
			]}
		>
			<Pressable
				onPress={onSelect}
				disabled={disabled || !onSelect}
				accessibilityRole={onSelect ? "radio" : undefined}
				accessibilityState={{ checked: selected, disabled }}
				style={[styles.body, disabled && { opacity: 0.6 }]}
			>
				<Ionicons
					name={
						onSelect
							? selected
								? "radio-button-on"
								: "radio-button-off"
							: "location-outline"
					}
					size={20}
					color={c.primary}
				/>
				<View style={{ flex: 1, gap: 2 }}>
					<View style={styles.titleRow}>
						<Text style={[styles.title, { color: c.text }]}>
							{address.label ?? address.recipientName}
						</Text>
						{address.isDefault ? (
							<Text
								style={[
									styles.tag,
									{ color: c.primary, backgroundColor: c.primarySoft },
								]}
							>
								{t("addresses.default")}
							</Text>
						) : null}
					</View>
					<Text style={[styles.line, { color: c.text }]}>
						{districtName(savedAddressToInput(address))}, {cityLabel}
						{address.landmark ? ` — ${address.landmark}` : ""}
					</Text>
					<Text style={[styles.line, { color: c.muted }]}>
						{address.label ? `${address.recipientName} · ` : ""}
						{address.phone}
					</Text>
					{address.gps ? (
						<Text style={[styles.small, { color: c.muted }]}>
							{t("addresses.coordinates", {
								coordinates: coordinatesText(address.gps),
							})}
						</Text>
					) : null}
					{disabledReason ? (
						<Text style={[styles.small, { color: c.warningText }]}>
							{disabledReason}
						</Text>
					) : null}
				</View>
			</Pressable>
			{actions ? <View style={styles.actions}>{actions}</View> : null}
		</View>
	);
}

export function CardAction({
	label,
	onPress,
	tone = "primary",
	disabled = false,
}: {
	label: string;
	onPress: () => void;
	tone?: "primary" | "danger";
	disabled?: boolean;
}) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={styles.action}
		>
			<Text
				style={[
					styles.actionText,
					{ color: tone === "danger" ? c.danger : c.primary },
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 14, padding: 12, gap: 6 },
	body: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	title: { fontSize: 15, fontFamily: Fonts.bodyBold },
	tag: {
		fontSize: 11,
		fontFamily: Fonts.bodyBold,
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 999,
		overflow: "hidden",
	},
	line: { fontSize: 13, fontFamily: Fonts.body },
	small: { fontSize: 12, fontFamily: Fonts.body },
	actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4 },
	action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
	actionText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
