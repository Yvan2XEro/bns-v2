import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { shopUrlLabel } from "@/src/lib/shopHandle";
import { shopTrustStrip, trustItemText } from "@/src/lib/shopStorefront";
import type { PublicShop } from "@/src/types/api";
import type { ShopTrustItem } from "../../../../api/src/contracts/shopTrust";
import { useShopBrand } from "./brand";
import { LevelBadge } from "./LevelBadge";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

export function ShopHeader({
	shop,
	onShare,
	onNameBottom,
}: {
	shop: PublicShop;
	onShare: () => void;
	/** The name's bottom edge within the header, what the compact bar's swap is keyed on. */
	onNameBottom?: (y: number) => void;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const { webUrl } = useAppConfig();
	const banner = resolveListingImageUrl(shop.banner, "medium");
	const bodyY = useRef(0);
	const nameBox = useRef<{ y: number; height: number } | null>(null);
	const report = () => {
		if (nameBox.current)
			onNameBottom?.(
				bodyY.current + nameBox.current.y + nameBox.current.height,
			);
	};

	return (
		<View>
			<View style={[styles.banner, { backgroundColor: brand.headerBg }]}>
				{banner ? (
					<Image
						source={{ uri: banner }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
					/>
				) : null}
			</View>
			<View
				style={styles.body}
				onLayout={(e) => {
					bodyY.current = e.nativeEvent.layout.y;
					report();
				}}
			>
				<View style={[styles.logoRing, { borderColor: c.bg }]}>
					<ShopAvatar
						name={shop.name}
						logo={shop.logo?.url}
						size={72}
						radius={18}
					/>
				</View>
				<Text
					style={[styles.name, { color: c.text }]}
					onLayout={(e) => {
						nameBox.current = e.nativeEvent.layout;
						report();
					}}
				>
					{shop.name}
				</Text>
				<View style={styles.row}>
					<LevelBadge badge={shop.badge} />
					<Pressable
						onPress={onShare}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
					>
						<Text style={[styles.link, { color: brand.accentText }]}>
							{shopUrlLabel(shop.handle, webUrl)}
						</Text>
					</Pressable>
				</View>
				<TrustStrip shop={shop} />
				{shop.description ? (
					<Text
						style={[styles.description, { color: c.body }]}
						numberOfLines={3}
					>
						{shop.description}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: { height: 140, overflow: "hidden" },
	body: { paddingHorizontal: 16, marginTop: -36, gap: 8 },
	logoRing: { alignSelf: "flex-start", borderWidth: 4, borderRadius: 22 },
	name: { fontSize: 24, fontFamily: Fonts.displayExtrabold },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		flexWrap: "wrap",
	},
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold, paddingVertical: 4 },
	description: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 21 },
	trust: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: 12,
		rowGap: 4,
	},
	trustItem: { flexDirection: "row", alignItems: "center", gap: 4 },
	trustText: { fontSize: 13, fontFamily: Fonts.body },
	trustStrong: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});

const TRUST_ICONS: Record<
	ShopTrustItem["kind"],
	keyof typeof Ionicons.glyphMap
> = {
	rating: "star",
	responseTime: "chatbubble-ellipses-outline",
	city: "location-outline",
	memberSince: "calendar-outline",
	newShop: "sparkles-outline",
	activeListings: "pricetags-outline",
};

/** Platform colours on purpose: trust signals are never painted in the shop's brand. */
function TrustStrip({ shop }: { shop: PublicShop }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const items = shopTrustStrip(shop);
	if (items.length === 0) return null;
	return (
		<View
			style={styles.trust}
			accessible
			accessibilityLabel={`${t("shop.trustLabel")} : ${items
				.map((item) => trustItemText(item, t, i18n.language))
				.join(", ")}`}
		>
			{items.map((item) => (
				<View key={item.kind} style={styles.trustItem}>
					<Ionicons
						name={TRUST_ICONS[item.kind]}
						size={13}
						color={item.kind === "rating" ? "#f59e0b" : c.muted}
					/>
					<Text
						style={[
							item.kind === "rating" || item.kind === "newShop"
								? styles.trustStrong
								: styles.trustText,
							{ color: item.kind === "rating" ? c.text : c.muted },
						]}
					>
						{trustItemText(item, t, i18n.language)}
					</Text>
				</View>
			))}
		</View>
	);
}
