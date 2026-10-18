import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { ShopAddressCard } from "@/src/components/shop/manage/ShopAddressCard";
import { ShopBrandColorCard } from "@/src/components/shop/manage/ShopBrandColorCard";
import { ShopCloseCard } from "@/src/components/shop/manage/ShopCloseCard";
import { ShopKindCard } from "@/src/components/shop/manage/ShopKindCard";
import { ShopLegalCard } from "@/src/components/shop/manage/ShopLegalCard";
import { ShopProfileCard } from "@/src/components/shop/manage/ShopProfileCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import {
	isShopSettingsSection,
	type ShopSettingsSection,
	sectionNeedsOwner,
} from "@/src/lib/shopSettingsRows";
import { isShopOwner } from "@/src/lib/variants";

const TITLE_KEYS: Record<ShopSettingsSection, string> = {
	profile: "shopProfile.settingsTitle",
	name: "shop.nameLabel",
	description: "shop.descriptionLabel",
	city: "shop.cityLabel",
	categories: "shop.settingsRows.categories",
	contacts: "shop.contactsTitle",
	color: "shop.brandColorTitle",
	address: "shop.addressTitle",
	legal: "shop.legalSectionTitle",
	close: "shop.closeTitle",
};

const goBack = () =>
	router.canGoBack() ? router.back() : router.replace("/shop/manage");

/** One settings row's editor: the same card, rules and endpoint the full form used. */
export default function ShopSettingsSectionScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ section?: string }>();
	const section = isShopSettingsSection(params.section) ? params.section : null;
	const { data, isLoading } = useMyShop();
	const shop = data?.shop;
	const owner = isShopOwner(data?.role);

	const title = section ? t(TITLE_KEYS[section]) : t("shop.settingsTitle");

	if (isLoading || (!shop && !data)) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={title} />
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!shop || !section || (sectionNeedsOwner(section) && !owner)) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={title} />
				<EmptyState
					illustration="sell"
					title={t("shop.settingsRows.unavailable")}
					ctaLabel={t("common.back")}
					onCta={goBack}
				/>
			</SafeAreaView>
		);
	}

	const readOnly = shop.status !== "active";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={title} subtitle={shop.name} />
			<KeyboardAwareScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				{section === "name" ||
				section === "description" ||
				section === "city" ||
				section === "categories" ||
				section === "contacts" ? (
					<ShopProfileCard
						shop={shop}
						readOnly={readOnly}
						section={section}
						onSaved={goBack}
					/>
				) : null}
				{section === "profile" ? (
					<ShopKindCard shop={shop} readOnly={readOnly} onSaved={goBack} />
				) : null}
				{section === "color" ? (
					<ShopBrandColorCard shop={shop} readOnly={readOnly} />
				) : null}
				{section === "address" ? (
					<ShopAddressCard
						shop={shop}
						role={data?.role ?? null}
						readOnly={readOnly}
					/>
				) : null}
				{section === "legal" ? <ShopLegalCard shop={shop} /> : null}
				{section === "close" ? <ShopCloseCard shop={shop} /> : null}
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 40 },
});
