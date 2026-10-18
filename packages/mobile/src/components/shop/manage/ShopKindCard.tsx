import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { ShopProfilePicker } from "@/src/components/shop/ShopProfilePicker";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useUpdateShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { profileOf, type ShopProfile } from "@/src/lib/listingKind";
import type { MyShop } from "@/src/types/api";

/**
 * The kind of business. Leaving « shop » is refused by the server while the
 * catalogue has live products; its message says so.
 */
export function ShopKindCard({
	shop,
	readOnly,
	onSaved,
}: {
	shop: MyShop;
	readOnly: boolean;
	onSaved: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const updateShop = useUpdateShop(shop.id);
	const saved = profileOf(shop.profile);
	const [draft, setDraft] = useState<ShopProfile>(saved);
	const disabled = readOnly || updateShop.isPending;

	const save = async () => {
		try {
			await updateShop.mutateAsync({ profile: draft });
			showSuccess(t("shopProfile.saved"));
			onSaved();
		} catch (error) {
			showError(t("shop.saveError"), resolveErrorMessage(error, t));
		}
	};

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("shopProfile.settingsTitle")}
			</Text>
			<Text style={[f.hint, { color: c.muted }]}>
				{t("shopProfile.retailNote")}
			</Text>
			<ShopProfilePicker
				value={draft}
				onChange={setDraft}
				disabled={disabled}
			/>
			{!readOnly && (
				<Pressable
					onPress={save}
					disabled={disabled || draft === saved}
					accessibilityRole="button"
					accessibilityLabel={t("shopProfile.save")}
					style={[
						styles.action,
						{
							backgroundColor: c.primary,
							borderColor: c.primary,
							opacity: disabled || draft === saved ? 0.5 : 1,
						},
					]}
				>
					{updateShop.isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={[styles.actionText, { color: "#fff" }]}>
							{t("shopProfile.save")}
						</Text>
					)}
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	action: {
		minHeight: 44,
		marginTop: 12,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
