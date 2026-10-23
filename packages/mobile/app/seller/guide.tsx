import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useSellerHomeActions } from "@/src/hooks/useSellerHomeActions";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { GUIDE_TARGETS } from "@/src/lib/sellerHome";
import {
	SELLER_GUIDE_SECTIONS,
	type SellerGuideSection,
} from "../../../api/src/contracts/sellerOnboarding";

type IoniconsName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<SellerGuideSection, IoniconsName> = {
	setup: "storefront-outline",
	visibility: "megaphone-outline",
	orders: "receipt-outline",
	payments: "wallet-outline",
	trust: "shield-checkmark-outline",
};

/** Pull help: read when the seller wants it, each part one tap from its screen. */
export default function SellerGuideScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const shop = useMyShop().data?.shop;
	const actions = useSellerHomeActions({
		name: shop?.name ?? "",
		handle: shop?.handle ?? "",
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("sellerGuide.title")} />
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.content}>
					<Text style={[styles.intro, { color: c.body }]}>
						{t("sellerGuide.intro")}
					</Text>
					{SELLER_GUIDE_SECTIONS.map((section) => {
						const target = GUIDE_TARGETS[section];
						// Sharing needs the shop's handle; without it the link is left out.
						const canOpen = target.kind !== "share" || Boolean(shop);
						return (
							<View
								key={section}
								style={[
									styles.card,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<View style={styles.head}>
									<View
										style={[styles.icon, { backgroundColor: c.primarySoft }]}
									>
										<Ionicons
											name={ICONS[section]}
											size={19}
											color={c.primary}
										/>
									</View>
									<Text
										style={[styles.title, { color: c.text }]}
										accessibilityRole="header"
									>
										{t(`sellerGuide.sections.${section}.title`)}
									</Text>
								</View>
								<Text style={[styles.body, { color: c.body }]}>
									{t(`sellerGuide.sections.${section}.body`)}
								</Text>
								{canOpen ? (
									<Pressable
										onPress={() => actions.open(target)}
										accessibilityRole="link"
										style={styles.link}
									>
										<Text style={[styles.linkText, { color: c.primary }]}>
											{t(`sellerGuide.sections.${section}.action`)}
										</Text>
										<Ionicons
											name="arrow-forward"
											size={15}
											color={c.primary}
										/>
									</Pressable>
								) : null}
							</View>
						);
					})}
					<Pressable
						onPress={() => router.push("/help")}
						accessibilityRole="link"
						style={styles.link}
					>
						<Ionicons name="help-circle-outline" size={17} color={c.primary} />
						<Text style={[styles.linkText, { color: c.primary }]}>
							{t("sellerGuide.helpCenter")}
						</Text>
					</Pressable>
				</ScrollView>
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 12, paddingBottom: 40 },
	intro: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 8,
	},
	head: { flexDirection: "row", alignItems: "center", gap: 10 },
	icon: {
		width: 36,
		height: 36,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { flex: 1, fontSize: 16, fontFamily: Fonts.displayBold },
	body: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.body },
	link: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44,
		alignSelf: "flex-start",
	},
	linkText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
