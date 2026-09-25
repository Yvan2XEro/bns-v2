import { Image } from "expo-image";
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
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useUpdateShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { pickAndUploadImage } from "@/src/lib/pickAndUpload";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { MyShop } from "@/src/types/api";

/** Logo and banner upload. Self-contained: its own mutation, its own upload state. */
export function ShopBrandingCard({
	shop,
	readOnly,
}: {
	shop: MyShop;
	readOnly: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const updateShop = useUpdateShop(shop.id);
	const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);

	const upload = async (kind: "logo" | "banner") => {
		setUploading(kind);
		try {
			const media = await pickAndUploadImage({
				alt: `${shop.name} ${kind}`,
				aspect: kind === "logo" ? [1, 1] : [3, 1],
			});
			if (media) {
				await updateShop.mutateAsync(
					kind === "logo" ? { logo: media.id } : { banner: media.id },
				);
			}
		} catch (error) {
			showError(t("shop.saveError"), resolveErrorMessage(error, t));
		} finally {
			setUploading(null);
		}
	};

	const bannerUri = resolveImageUrl(shop.banner?.url ?? null);

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Pressable
				disabled={readOnly}
				onPress={() => upload("banner")}
				accessibilityRole="button"
				accessibilityLabel={t("shop.banner")}
				style={[styles.banner, { backgroundColor: c.primary }]}
			>
				{bannerUri ? (
					<Image
						source={{ uri: bannerUri }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
					/>
				) : null}
				{uploading === "banner" ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.bannerText}>{t("shop.banner")}</Text>
				)}
			</Pressable>
			<View style={f.row}>
				<Pressable
					disabled={readOnly}
					onPress={() => upload("logo")}
					accessibilityRole="button"
					accessibilityLabel={t("shop.brandingTitle")}
					style={styles.logoTouch}
				>
					{uploading === "logo" ? (
						<View style={styles.logoLoading}>
							<ActivityIndicator color={c.primary} />
						</View>
					) : (
						<ShopAvatar name={shop.name} logo={shop.logo?.url} size={56} />
					)}
				</Pressable>
				<View style={{ flex: 1 }}>
					<Text style={[f.label, { color: c.text }]}>
						{t("shop.brandingTitle")}
					</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{t("shop.brandingHint")}
					</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		height: 110,
		borderRadius: 12,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	bannerText: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodySemibold },
	logoTouch: { minWidth: 56, minHeight: 56 },
	logoLoading: {
		width: 56,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
	},
});
