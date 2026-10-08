import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { DeliveryOption } from "@/src/types/order";

export function DeliveryOptionCard({
	option,
	checked,
	locale,
	onSelect,
	selectable,
}: {
	option: DeliveryOption;
	checked: boolean;
	locale: "fr" | "en";
	onSelect: () => void;
	selectable: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const pickup = option.method === "pickup";
	const title = pickup
		? t("checkout.pickupAtShop")
		: option.method === "courier"
			? t("checkout.courierDelivery")
			: t("checkout.sellerDelivery");
	const fee =
		option.fee === 0 ? t("checkout.free") : formatXaf(option.fee, locale);
	const point = option.pickupPoint;

	return (
		<Pressable
			onPress={onSelect}
			disabled={!selectable}
			accessibilityRole="radio"
			accessibilityLabel={`${title}, ${fee}`}
			accessibilityState={{ checked, disabled: !selectable }}
			style={[
				styles.card,
				{
					borderColor: checked ? c.primary : c.border,
					backgroundColor: checked ? c.primarySoft : c.card,
					opacity: selectable ? 1 : 0.6,
				},
			]}
		>
			<View style={styles.row}>
				<Ionicons
					name={pickup ? "storefront-outline" : "bicycle-outline"}
					size={18}
					color={c.text}
				/>
				<Text style={[styles.title, { color: c.text }]}>{title}</Text>
				<Ionicons
					name={checked ? "radio-button-on" : "radio-button-off"}
					size={20}
					color={checked ? c.primary : c.muted}
				/>
			</View>
			<View style={styles.row}>
				<Text style={[styles.meta, { color: c.body, flex: 1 }]}>
					{t("checkout.fee")}
				</Text>
				<Text style={[styles.meta, { color: c.text }]}>{fee}</Text>
			</View>
			<Text style={[styles.meta, { color: c.muted }]}>
				{t("checkout.eta", { eta: option.etaText })}
			</Text>
			{option.promisedBy ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("checkout.promisedBy", {
						date: new Date(option.promisedBy).toLocaleString(locale),
					})}
				</Text>
			) : null}
			{option.freeApplied && option.originalFee ? (
				<Text style={[styles.meta, { color: c.primary }]}>
					{t("checkout.freeDeliveryApplied", {
						amount: formatXaf(option.originalFee, locale),
					})}
				</Text>
			) : null}
			{point ? (
				<View style={[styles.point, { backgroundColor: c.card }]}>
					<Text
						style={[
							styles.meta,
							{ color: c.text, fontFamily: Fonts.bodySemibold },
						]}
					>
						{t("checkout.pickupPoint")}
					</Text>
					<Text style={[styles.meta, { color: c.body }]}>{point.address}</Text>
					{point.landmark ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{point.landmark}
						</Text>
					) : null}
					{point.hours ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("checkout.pickupHours", { hours: point.hours })}
						</Text>
					) : null}
				</View>
			) : null}
			{selectable ? null : (
				<Text style={[styles.meta, { color: c.warningText }]}>
					{t("checkout.codUnavailableOption")}
				</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: 1,
		borderRadius: 16,
		padding: 14,
		gap: 6,
		minHeight: 44,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
	title: { flex: 1, fontSize: 15, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	point: { marginTop: 4, padding: 10, borderRadius: 12, gap: 2 },
});
