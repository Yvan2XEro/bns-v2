import { Ionicons } from "@expo/vector-icons";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { districtName } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import {
	coordinatesText,
	type SavedAddress,
	savedAddressToInput,
} from "@/src/lib/savedAddresses";

/** The leading icon (20) and its gap (12) past the card's 16pt edge. */
const TEXT_INSET = 16 + 20 + 12;

/** The actions a card was given, with fragments and conditionals unwrapped. */
function flattenActions(children: ReactNode): ReactNode[] {
	return Children.toArray(children).flatMap((child) => {
		if (!isValidElement(child)) return [];
		if (child.type === Fragment) {
			return flattenActions((child.props as { children?: ReactNode }).children);
		}
		return [child];
	});
}

/**
 * One saved address, drawn as a grouped card: the address, then its actions
 * on a row under a hairline inset to the text. No map on mobile yet (it
 * needs a native module, planned with the next native build): the landmark
 * and the coordinates stand in.
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
	const c = useGroupedColors();
	const { t } = useTranslation();
	const disabled = Boolean(disabledReason);
	const title = address.label ?? address.recipientName;
	const place = `${districtName(savedAddressToInput(address))}, ${cityLabel}${
		address.landmark ? ` — ${address.landmark}` : ""
	}`;
	const contact = `${address.label ? `${address.recipientName} · ` : ""}${address.phone}`;
	const actionList = flattenActions(actions);

	return (
		<View
			style={[
				styles.card,
				selected
					? { borderWidth: 2, borderColor: c.primary }
					: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
				{ backgroundColor: c.card },
			]}
		>
			<Pressable
				onPress={onSelect}
				disabled={disabled || !onSelect}
				accessibilityRole={onSelect ? "radio" : undefined}
				accessibilityState={{ checked: selected, disabled }}
				accessibilityLabel={[
					title,
					address.isDefault ? t("addresses.default") : null,
					place,
					contact,
					disabledReason,
				]
					.filter(Boolean)
					.join(", ")}
				android_ripple={onSelect ? { color: c.well } : undefined}
				style={({ pressed }) => [
					styles.body,
					pressed && onSelect && Platform.OS === "ios"
						? { backgroundColor: c.well }
						: null,
				]}
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
					color={selected ? c.primary : c.mutedForeground}
					style={[styles.lead, disabled && styles.dim]}
				/>
				<View style={[styles.text, disabled && styles.dim]}>
					<View style={styles.titleRow}>
						<Text
							style={[styles.title, { color: c.foreground }]}
							numberOfLines={1}
						>
							{title}
						</Text>
						{address.isDefault ? (
							<View style={[styles.tag, { backgroundColor: c.primaryTint }]}>
								<Text style={[styles.tagText, { color: c.link }]}>
									{t("addresses.default")}
								</Text>
							</View>
						) : null}
					</View>
					<Text style={[styles.line, { color: c.body }]}>{place}</Text>
					<Text style={[styles.meta, { color: c.mutedForeground }]}>
						{contact}
					</Text>
					{address.gps ? (
						// Raw coordinates mean nothing to a buyer or a rider: the
						// card says a position is saved, the numbers stay for a
						// screen reader and the order details.
						<View
							style={styles.gpsRow}
							accessible
							accessibilityLabel={t("addresses.coordinates", {
								coordinates: coordinatesText(address.gps),
							})}
						>
							<Ionicons
								name="navigate-outline"
								size={13}
								color={c.mutedForeground}
							/>
							<Text style={[styles.meta, { color: c.mutedForeground }]}>
								{t("addresses.gpsSaved", {
									defaultValue: "Position GPS enregistrée",
								})}
							</Text>
						</View>
					) : null}
				</View>
			</Pressable>
			{disabledReason ? (
				// Said at full strength: dimmed, the reason would be unreadable.
				<Text style={[styles.reason, { color: c.warningText }]}>
					{disabledReason}
				</Text>
			) : null}
			{actionList.length > 0 ? (
				<>
					<View style={[styles.separator, { backgroundColor: c.border }]} />
					<View style={styles.actions}>{actionList}</View>
				</>
			) : null}
		</View>
	);
}

export function CardAction({
	label,
	onPress,
	tone = "primary",
	disabled = false,
	target,
}: {
	label: string;
	onPress: () => void;
	tone?: "primary" | "danger";
	disabled?: boolean;
	/** The address it acts on, said to a screen reader ("Supprimer, Maison"). */
	target?: string;
}) {
	const c = useGroupedColors();
	const color =
		tone === "danger" ? (c.isDark ? c.dangerText : c.destructive) : c.link;
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={target ? `${label}, ${target}` : label}
			accessibilityState={{ disabled }}
			android_ripple={{ color: c.well }}
			style={({ pressed }) => [
				styles.action,
				pressed && Platform.OS === "ios" ? { backgroundColor: c.well } : null,
				disabled ? styles.dim : null,
			]}
		>
			<Text style={[styles.actionText, { color }]} numberOfLines={1}>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 14, overflow: "hidden" },
	body: {
		flexDirection: "row",
		gap: 12,
		alignItems: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	lead: { marginTop: 1 },
	dim: { opacity: 0.55 },
	text: { flex: 1, gap: 3 },
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	title: {
		flexShrink: 1,
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.bodySemibold,
	},
	tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
	tagText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	line: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	gpsRow: { flexDirection: "row", alignItems: "center", gap: 5 },
	reason: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
		marginLeft: TEXT_INSET,
		marginRight: 16,
		marginTop: -6,
		marginBottom: 12,
	},
	separator: { height: StyleSheet.hairlineWidth, marginLeft: TEXT_INSET },
	actions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		paddingHorizontal: 4,
	},
	action: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 14,
		borderRadius: 10,
	},
	actionText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
});
