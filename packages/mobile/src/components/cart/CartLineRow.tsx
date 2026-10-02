import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { cartLineState, quantityStepper } from "@/src/lib/cartLines";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { CartLineView } from "@/src/types/order";

export function CartLineRow({
	line,
	locale,
	busy,
	onQuantity,
	onRemove,
}: {
	line: CartLineView;
	locale: "fr" | "en";
	busy: boolean;
	onQuantity: (quantity: number) => void;
	onRemove: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const state = cartLineState(line);
	const stepper = quantityStepper(line);
	const image = resolveImageUrl(line.imageUrl);
	const stepStyle = (enabled: boolean) => [
		styles.step,
		{ borderColor: c.border, opacity: enabled && !busy ? 1 : 0.4 },
	];

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: state === "unavailable" ? c.dangerSoft : c.card,
					borderColor: c.border,
				},
			]}
		>
			<View style={[styles.thumb, { backgroundColor: c.neutralSoft }]}>
				{image ? (
					<Image
						source={{ uri: image }}
						style={[styles.thumb, state === "unavailable" && { opacity: 0.5 }]}
						contentFit="cover"
						accessibilityIgnoresInvertColors
					/>
				) : (
					<Ionicons name="image-outline" size={24} color={c.muted} />
				)}
			</View>
			<View style={styles.body}>
				<View style={styles.row}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
							{line.title}
						</Text>
						{line.variantLabel ? (
							<Text style={[styles.meta, { color: c.muted }]}>
								{line.variantLabel}
							</Text>
						) : null}
					</View>
					<Text style={[styles.title, { color: c.text }]}>
						{formatXaf(line.lineSubtotal, locale)}
					</Text>
				</View>
				{state === "unavailable" ? (
					<Text style={[styles.meta, { color: c.dangerText }]}>
						{t("cart.unavailable")}
					</Text>
				) : null}
				{state === "price_changed" ? (
					<Text style={[styles.meta, { color: c.warningText }]}>
						{t("cart.priceChanged")} ·{" "}
						{t("cart.priceWas", {
							price: formatXaf(line.priceAtAdd, locale),
						})}
					</Text>
				) : null}
				<View style={styles.row}>
					<View style={styles.stepper}>
						<Pressable
							onPress={() => onQuantity(line.quantity - 1)}
							disabled={busy || !stepper.canDecrease}
							accessibilityRole="button"
							accessibilityLabel={t("cart.decrease", { title: line.title })}
							style={stepStyle(stepper.canDecrease)}
						>
							<Ionicons name="remove" size={18} color={c.text} />
						</Pressable>
						<Text
							style={[styles.quantity, { color: c.text }]}
							accessibilityLabel={`${t("cart.quantity")} ${line.quantity}`}
							accessibilityLiveRegion="polite"
						>
							{line.quantity}
						</Text>
						<Pressable
							onPress={() => onQuantity(line.quantity + 1)}
							disabled={busy || !stepper.canIncrease}
							accessibilityRole="button"
							accessibilityLabel={t("cart.increase", { title: line.title })}
							style={stepStyle(stepper.canIncrease)}
						>
							<Ionicons name="add" size={18} color={c.text} />
						</Pressable>
					</View>
					<Pressable
						onPress={onRemove}
						disabled={busy}
						accessibilityRole="button"
						accessibilityLabel={t("cart.removeItem", { title: line.title })}
						style={[styles.remove, { opacity: busy ? 0.4 : 1 }]}
					>
						<Ionicons name="trash-outline" size={16} color={c.danger} />
						<Text style={[styles.meta, { color: c.danger }]}>
							{t("cart.remove")}
						</Text>
					</Pressable>
				</View>
				{stepper.atMax ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("cart.maxQuantity")}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		gap: 12,
		padding: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	thumb: {
		width: 72,
		height: 72,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	body: { flex: 1, gap: 6 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
	step: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	quantity: {
		minWidth: 28,
		textAlign: "center",
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
	},
	remove: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
		paddingHorizontal: 8,
	},
});
