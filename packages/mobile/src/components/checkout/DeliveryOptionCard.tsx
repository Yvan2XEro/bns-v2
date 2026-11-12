import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
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
		option.fee === 0 ? t("checkout.free") : formatPrice(option.fee, locale);
	const point = option.pickupPoint;

	return (
		<Pressable
			onPress={onSelect}
			disabled={!selectable}
			accessibilityRole="radio"
			accessibilityLabel={`${title}, ${fee}, ${t("checkout.eta", { eta: option.etaText })}`}
			accessibilityState={{ checked, disabled: !selectable }}
			style={({ pressed }) => [
				styles.card,
				{
					borderColor: checked ? c.primary : c.border,
					backgroundColor: checked ? c.primarySoft : c.card,
					opacity: pressed ? 0.85 : 1,
				},
				pressed ? styles.pressed : null,
			]}
		>
			{/* An option the payment rules out is dimmed, but the reason under it
			    keeps full ink: a faded explanation fails its contrast. */}
			<View style={[styles.row, selectable ? null : styles.off]}>
				<View
					style={[
						styles.tile,
						{ backgroundColor: checked ? c.card : c.neutralSoft },
					]}
				>
					<Ionicons
						name={pickup ? "storefront-outline" : "bicycle-outline"}
						size={20}
						color={checked ? c.primary : c.text}
					/>
				</View>
				<View style={styles.main}>
					<Text style={[styles.title, { color: c.text }]}>{title}</Text>
					<Text style={[styles.meta, { color: c.body }]}>
						{t("checkout.eta", { eta: option.etaText })}
					</Text>
				</View>
				<View style={styles.end}>
					<Text
						style={[
							styles.fee,
							{ color: option.fee === 0 ? c.successText : c.text },
						]}
					>
						{fee}
					</Text>
					<Ionicons
						name={checked ? "radio-button-on" : "radio-button-off"}
						size={22}
						color={checked ? c.primary : c.muted}
					/>
				</View>
			</View>
			{option.promisedBy ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("checkout.promisedBy", {
						date: formatPromise(option.promisedBy, locale),
					})}
				</Text>
			) : null}
			{option.freeApplied && option.originalFee ? (
				<Text style={[styles.meta, { color: c.successText }]}>
					{t("checkout.freeDeliveryApplied", {
						amount: formatPrice(option.originalFee, locale),
					})}
				</Text>
			) : null}
			{point ? (
				<View
					style={[
						styles.point,
						{ backgroundColor: checked ? c.card : c.neutralSoft },
					]}
				>
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
				<View style={styles.row}>
					<Ionicons name="information-circle" size={16} color={c.warningText} />
					<Text style={[styles.meta, styles.main, { color: c.warningText }]}>
						{t("checkout.codUnavailableOption")}
					</Text>
				</View>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	pressed: { transform: [{ scale: 0.99 }] },
	off: { opacity: 0.5 },
	card: {
		borderWidth: 1.5,
		borderRadius: 16,
		padding: 14,
		gap: 8,
		minHeight: 48,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	tile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	main: { flex: 1, gap: 2 },
	end: { alignItems: "flex-end", gap: 6 },
	title: { fontSize: 16, fontFamily: Fonts.bodySemibold },
	fee: {
		fontSize: 16,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	meta: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
	point: { padding: 12, borderRadius: 12, gap: 2 },
});

/** "jeu. 12 nov., 14:00": the promise as a buyer reads it, in Douala time. */
function formatPromise(iso: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Africa/Douala",
	}).format(new Date(iso));
}
