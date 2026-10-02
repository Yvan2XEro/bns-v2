import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { VariantPicker } from "@/src/components/shop/VariantPicker";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { decideBuyBox } from "@/src/lib/buyBox";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductDoc } from "@/src/types/api";
import { BuyActions } from "./BuyActions";

export interface BuyBoxProps {
	listingId: string;
	product: ProductDoc | null;
	shop: { id: string; restricted: boolean } | null;
	orderable: boolean | null | undefined;
	ownShop: boolean;
	productAvailable: boolean | null;
	signedIn: boolean;
}

/**
 * The listing's buy box. Every outcome but `buy` renders the variant picker
 * exactly as the screen had it before ordering, so a listing that cannot be
 * ordered looks as it always did.
 */
export function BuyBox(props: BuyBoxProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { ordersEnabled } = useAppConfig();
	const decision = decideBuyBox({
		ordersEnabled,
		orderable: props.orderable,
		shop: props.shop,
		ownShop: props.ownShop,
		productAvailable: props.productAvailable,
		signedIn: props.signedIn,
	});
	const asToday = props.product ? (
		<VariantPicker product={props.product} />
	) : null;

	if (decision.kind === "hidden" || !props.product) return asToday;

	if (decision.kind === "restricted") {
		return (
			<>
				<View
					accessibilityRole="alert"
					style={[styles.notice, { backgroundColor: c.warningSoft }]}
				>
					<Ionicons name="time-outline" size={18} color={c.warningText} />
					<View style={{ flex: 1 }}>
						<Text style={[styles.noticeTitle, { color: c.warningText }]}>
							{t("buyBox.restrictedTitle")}
						</Text>
						<Text style={[styles.noticeBody, { color: c.warningText }]}>
							{t("buyBox.restrictedBody")}
						</Text>
					</View>
				</View>
				{asToday}
			</>
		);
	}

	return (
		<VariantPicker product={props.product}>
			{(variant) => (
				<BuyActions
					listingId={props.listingId}
					shopId={props.shop?.id ?? null}
					variant={variant}
					signedIn={decision.signedIn}
				/>
			)}
		</VariantPicker>
	);
}

const styles = StyleSheet.create({
	notice: {
		flexDirection: "row",
		gap: 10,
		padding: 14,
		borderRadius: 14,
		marginBottom: 12,
	},
	noticeTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	noticeBody: { fontSize: 13, fontFamily: Fonts.body, marginTop: 2 },
});
