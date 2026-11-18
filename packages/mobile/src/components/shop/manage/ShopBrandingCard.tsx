import { Ionicons } from "@expo/vector-icons";
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
import { useBrandFor } from "@/src/components/shop/brand";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useUpdateShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { pickAndUploadImage } from "@/src/lib/pickAndUpload";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { MyShop } from "@/src/types/api";

/** Banner across the top with the logo set on it; each uploads on tap. */
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
	const brand = useBrandFor(shop.brandColor);
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

	const bannerUri = resolveListingImageUrl(shop.banner, "medium");

	return (
		<View>
			<Pressable
				disabled={readOnly}
				onPress={() => upload("banner")}
				accessibilityRole="button"
				accessibilityLabel={t("shop.banner")}
				accessibilityState={{
					disabled: readOnly,
					busy: uploading === "banner",
				}}
				style={[styles.banner, { backgroundColor: brand.headerBg }]}
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
				) : bannerUri ? null : (
					<Text style={[styles.bannerText, { color: brand.headerFg }]}>
						{t("shop.banner")}
					</Text>
				)}
				{readOnly || uploading === "banner" ? null : <EditMark />}
			</Pressable>
			<View style={styles.logoRow}>
				<Pressable
					disabled={readOnly}
					onPress={() => upload("logo")}
					accessibilityRole="button"
					accessibilityLabel={t("shop.logo")}
					accessibilityState={{
						disabled: readOnly,
						busy: uploading === "logo",
					}}
					style={[
						styles.logoTouch,
						{ borderColor: c.bg, backgroundColor: c.card },
					]}
				>
					{uploading === "logo" ? (
						<View style={styles.logoLoading}>
							<ActivityIndicator color={c.link} />
						</View>
					) : (
						<ShopAvatar
							name={shop.name}
							logo={shop.logo?.url}
							size={LOGO_SIZE}
							radius={16}
						/>
					)}
					{readOnly || uploading === "logo" ? null : <EditMark small />}
				</Pressable>
				<View style={styles.logoText}>
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

/** The camera mark that says a picture can be replaced, once one is set too. */
function EditMark({ small = false }: { small?: boolean }) {
	return (
		<View
			style={[styles.editMark, small && styles.editMarkSmall]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Ionicons name="camera-outline" size={small ? 14 : 16} color="#ffffff" />
		</View>
	);
}

const LOGO_SIZE = 72;

const styles = StyleSheet.create({
	banner: {
		height: 130,
		borderRadius: 16,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	bannerText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	logoRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 12,
		marginTop: -LOGO_SIZE / 2,
		paddingHorizontal: 16,
	},
	logoTouch: {
		borderWidth: 3,
		borderRadius: 19,
		overflow: "hidden",
	},
	logoLoading: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		alignItems: "center",
		justifyContent: "center",
	},
	logoText: { flex: 1, paddingBottom: 4 },
	// Ink at 72%: the white mark keeps 4.5:1 on any photo beneath it.
	editMark: {
		position: "absolute",
		right: 10,
		bottom: 10,
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "rgba(18, 22, 58, 0.72)",
		alignItems: "center",
		justifyContent: "center",
	},
	editMarkSmall: {
		right: 4,
		bottom: 4,
		width: 26,
		height: 26,
		borderRadius: 13,
	},
});
