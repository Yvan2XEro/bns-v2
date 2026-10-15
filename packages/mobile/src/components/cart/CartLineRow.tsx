import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { cartLineState, quantityStepper } from "@/src/lib/cartLines";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { CartLineView } from "@/src/types/order";

/** Stock left is worth showing only once it is low enough to matter. */
const LOW_STOCK = 5;

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
		{ opacity: enabled && !busy ? 1 : 0.35 },
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
				<Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
					{line.title}
				</Text>
				{line.variantLabel ? (
					<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
						{line.variantLabel}
					</Text>
				) : null}
				<Text style={[styles.price, { color: c.text }]}>
					{formatPrice(line.lineSubtotal, locale)}
				</Text>
				{state === "unavailable" ? (
					<Text style={[styles.meta, { color: c.dangerText }]}>
						{t("cart.unavailable")}
					</Text>
				) : null}
				{state === "price_changed" ? (
					<Text style={[styles.meta, { color: c.warningText }]}>
						{t("cart.priceChanged")} ·{" "}
						{t("cart.priceWas", {
							price: formatPrice(line.priceAtAdd, locale),
						})}
					</Text>
				) : null}
				<View style={styles.row}>
					<Pressable
						onPress={onRemove}
						disabled={busy}
						accessibilityRole="button"
						accessibilityLabel={t("cart.removeItem", { title: line.title })}
						style={[styles.remove, { opacity: busy ? 0.4 : 1 }]}
						hitSlop={6}
					>
						<Ionicons name="close" size={14} color={c.muted} />
						<Text style={[styles.removeText, { color: c.muted }]}>
							{t("cart.remove")}
						</Text>
					</Pressable>
					<View style={styles.rowEnd}>
						{line.maxQuantity != null && line.maxQuantity <= LOW_STOCK ? (
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("cart.available", { count: line.maxQuantity })}
							</Text>
						) : null}
						<View style={[styles.stepper, { borderColor: c.border }]}>
							<Pressable
								onPress={() => onQuantity(line.quantity - 1)}
								disabled={busy || !stepper.canDecrease}
								accessibilityRole="button"
								accessibilityLabel={t("cart.decrease", { title: line.title })}
								style={stepStyle(stepper.canDecrease)}
								hitSlop={4}
							>
								<Ionicons name="remove" size={16} color={c.text} />
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
								hitSlop={4}
							>
								<Ionicons name="add" size={16} color={c.primary} />
							</Pressable>
						</View>
					</View>
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
		borderWidth: 1,
	},
	thumb: {
		width: 72,
		height: 72,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	body: { flex: 1, gap: 3 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginTop: 6,
	},
	rowEnd: { flexDirection: "row", alignItems: "center", gap: 10 },
	title: { fontSize: 15, fontFamily: Fonts.displayBold, lineHeight: 20 },
	price: { fontSize: 16, fontFamily: Fonts.displayBold, marginTop: 2 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	stepper: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 12,
	},
	step: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
	},
	quantity: {
		minWidth: 24,
		textAlign: "center",
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
	},
	remove: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 36 },
	removeText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
