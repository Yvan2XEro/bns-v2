import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { FALLBACK_KEYS, type HandoverFallback } from "@/src/lib/handoverKeypad";
import { useTranslation } from "@/src/lib/i18n";
import { DeclareDeliveredForm } from "./DeclareDeliveredForm";
import { SheetButton } from "./FormBits";

/**
 * What replaces the keypad once the code is locked: the buyer confirms in
 * their own app (a call is the quickest way to ask), or the seller declares
 * the delivery, with the 48-hour contest warning the form always carries.
 */
export function HandoverFallbacks({
	fallbacks,
	orderId,
	shopId,
	tel,
	onRefresh,
	onDeclared,
}: {
	fallbacks: HandoverFallback[];
	orderId: string;
	shopId: string;
	tel: string | null;
	onRefresh: () => void;
	onDeclared: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={styles.wrap}>
			<View style={[styles.banner, { backgroundColor: c.dangerSoft }]}>
				<Ionicons name="lock-closed" size={20} color={c.dangerText} />
				<Text style={[styles.bannerText, { color: c.dangerText }]}>
					{t("sellerOrders.handoverLocked")}
				</Text>
			</View>
			<Text style={[styles.heading, { color: c.text }]}>
				{t("sellerOrders.handoverFallbacks")}
			</Text>
			{fallbacks.map((fallback) => (
				<View
					key={fallback}
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[styles.title, { color: c.text }]}>
						{t(FALLBACK_KEYS[fallback].title)}
					</Text>
					{fallback === "buyer_confirmation" ? (
						<>
							<Text style={[styles.body, { color: c.body }]}>
								{t(FALLBACK_KEYS[fallback].body)}
							</Text>
							{tel ? (
								<SheetButton
									label={t("sellerOrders.callBuyer")}
									tone="secondary"
									onPress={() => Linking.openURL(tel)}
								/>
							) : null}
							<SheetButton
								label={t("sellerOrders.handoverRefresh")}
								tone="secondary"
								onPress={onRefresh}
							/>
						</>
					) : (
						<DeclareDeliveredForm
							orderId={orderId}
							shopId={shopId}
							onDone={onDeclared}
						/>
					)}
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 12 },
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	bannerText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	heading: { fontSize: 16, fontFamily: Fonts.displayBold },
	card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
	title: { fontSize: 15, fontFamily: Fonts.bodyBold },
	body: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
