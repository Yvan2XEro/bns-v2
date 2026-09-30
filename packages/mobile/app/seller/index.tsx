import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerChecklistCard } from "@/src/components/shop/SellerChecklistCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { SellerHubHeader } from "@/src/components/shop/SellerHubHeader";
import { SellerManageCard } from "@/src/components/shop/SellerManageCard";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useMyShop } from "@/src/hooks/useShops";
import { useShopVerification } from "@/src/hooks/useVerification";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { buildChecklistSteps } from "@/src/lib/sellerChecklist";
import { shopUrl } from "@/src/lib/shopHandle";
import {
	badgeForLevel,
	badgeLabelKey,
	canOpenRequest,
} from "@/src/lib/verification";
import type {
	MyShop,
	MyShopResponse,
	ShopVerificationResponse,
	VerificationStatus,
} from "@/src/types/api";

/**
 * The status of whichever of the two upgrade levels currently has an open
 * request — business takes priority over identity, since a seller working
 * on both would be finishing the higher one. Reads `canOpenRequest`'s own
 * "open" reason rather than re-deriving a status list here.
 */
function openRequestStatus(
	view: ShopVerificationResponse | undefined,
): VerificationStatus | null {
	if (!view) return null;
	for (const level of [3, 2] as const) {
		const request = view.requests[level === 2 ? "level2" : "level3"];
		if (!request) continue;
		const result = canOpenRequest(view, level);
		if (!result.ok && result.reason === "open") return request.status;
	}
	return null;
}

/**
 * An open request's status takes priority over the badge — it is the more
 * actionable thing to tell the seller about — falling back to the current
 * badge, or "no level yet" when there is none.
 */
function verificationTileBody(
	t: (key: string) => string,
	level: number,
	view: ShopVerificationResponse | undefined,
): string {
	const openStatus = openRequestStatus(view);
	if (openStatus) return t(`verification.timeline.status.${openStatus}`);
	const labelKey = badgeLabelKey(badgeForLevel(level));
	return labelKey
		? t(`shop.${labelKey}`)
		: t("verification.statusCard.noLevel");
}

type ShopCounts = NonNullable<MyShopResponse["counts"]>;

/**
 * `useMyShop` reflects the owner's shop regardless of the shops-enabled
 * flag — that flag gates opening a NEW shop only (see `shop/create.tsx`),
 * so this screen never reads it: an existing owner keeps full access to
 * their hub even while the flag is off.
 */
export default function SellerHubScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { webUrl } = useAppConfig();
	const { data, isLoading, isError, refetch, isRefetching } = useMyShop();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

	if (isLoading) {
		return (
			<View style={[styles.center, { backgroundColor: c.bg }]}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}

	const shop = data?.shop;
	const counts = data?.counts;

	if (isError || !shop || !counts) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={t("seller.space")} />
				<EmptyState
					illustration={isError ? "notFound" : "sell"}
					title={isError ? t("seller.loadError") : t("seller.noShopTitle")}
					subtitle={isError ? undefined : t("seller.noShopSubtitle")}
					ctaLabel={isError ? t("common.retry") : t("account.openShop")}
					onCta={() =>
						isError ? refetch() : router.replace("/shop/create" as never)
					}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SellerHubContent
			shop={shop}
			counts={counts}
			webUrl={webUrl}
			locale={locale}
			isRefetching={isRefetching}
			onRefetch={refetch}
		/>
	);
}

function SellerHubContent({
	shop,
	counts,
	webUrl,
	locale,
	isRefetching,
	onRefetch,
}: {
	shop: MyShop;
	counts: ShopCounts;
	webUrl: string | null;
	locale: string;
	isRefetching: boolean;
	onRefetch: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const verification = useShopVerification(shop.id);

	const share = () => {
		const url = shopUrl(shop.handle, webUrl);
		Share.share({ message: `${shop.name}\n${url}`, url });
	};
	const productCount = counts.activeProducts + counts.draftProducts;
	const firstRun = productCount === 0;
	const createdToday =
		new Date(shop.createdAt).toDateString() === new Date().toDateString();

	const steps = buildChecklistSteps({
		hasLogo: Boolean(shop.logo),
		productCount,
		personalListings: counts.personalListings,
	});
	const stepMeta = {
		logo: {
			title: t("seller.stepLogo"),
			body: shop.logo ? t("seller.stepLogoDone") : t("seller.stepLogoBody"),
			onPress: () => router.push("/shop/manage" as never),
		},
		product: {
			title: t("seller.stepProduct"),
			body: t("seller.stepProductBody"),
			action: t("seller.add"),
			onPress: () => router.push("/seller/product/new" as never),
		},
		move: {
			title: t("seller.stepMove"),
			body: t("seller.stepMoveBody", { count: counts.personalListings }),
			onPress: () => router.push("/shop/move-listings" as never),
		},
		share: {
			title: t("seller.stepShare"),
			body: t("seller.stepShareBody"),
			onPress: share,
		},
	};

	const manageTiles = [
		{
			key: "catalogue",
			icon: "cube-outline" as const,
			title: t("seller.tileCatalogue"),
			body: t("seller.tileCatalogueBody", {
				count: counts.activeProducts,
				drafts: counts.draftProducts,
			}),
			onPress: () => router.push("/seller/catalogue" as never),
		},
		{
			key: "stock",
			icon: "layers-outline" as const,
			title: t("seller.tileStock"),
			body:
				counts.lowStockVariants > 0
					? t("seller.tileStockAlerts", {
							count: counts.lowStockVariants,
							sample: counts.lowStockSample ?? "",
						})
					: t("seller.tileStockOk"),
			alert: counts.lowStockVariants > 0,
			onPress: () =>
				router.push({
					pathname: "/seller/catalogue",
					params: { filter: "low" },
				} as never),
		},
		{
			key: "settings",
			icon: "settings-outline" as const,
			title: t("seller.tileSettings"),
			body: t("seller.tileSettingsBody"),
			onPress: () => router.push("/shop/manage" as never),
		},
		{
			key: "verification",
			icon: "shield-checkmark-outline" as const,
			title: t("seller.tileVerification"),
			body: verificationTileBody(t, shop.level, verification.data),
			onPress: () => router.push("/seller/verification" as never),
		},
	];

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.header }]}
		>
			<ScrollView
				style={{ backgroundColor: c.bg }}
				contentContainerStyle={{ paddingBottom: 40 }}
				refreshControl={
					<RefreshControl
						refreshing={isRefetching}
						onRefresh={onRefetch}
						tintColor={c.primary}
					/>
				}
			>
				<SellerHubHeader shop={shop} webUrl={webUrl} onShare={share} />

				<View style={styles.content}>
					{shop.status === "suspended" && shop.suspension ? (
						<View
							style={[
								styles.banner,
								{ backgroundColor: c.dangerSoft, borderColor: c.danger },
							]}
						>
							<Ionicons name="ban" size={18} color={c.danger} />
							<View style={{ flex: 1 }}>
								<Text style={[styles.bannerTitle, { color: c.danger }]}>
									{shop.suspension.indefinite || !shop.suspension.until
										? t("seller.suspendedIndefinitely")
										: t("seller.suspendedUntil", {
												date: formatDate(
													shop.suspension.until,
													{ day: "numeric", month: "long", year: "numeric" },
													locale,
												),
											})}
								</Text>
								{shop.suspension.reason ? (
									<Text style={[styles.meta, { color: c.text }]}>
										{t(`report.${shop.suspension.reason}`)}
									</Text>
								) : null}
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("seller.suspendedBody")}
								</Text>
							</View>
						</View>
					) : null}

					{firstRun ? (
						<SellerChecklistCard
							level={shop.level}
							createdToday={createdToday}
							ownerFirstName={shop.owner.name.split(" ")[0] ?? shop.owner.name}
							shopName={shop.name}
							steps={steps}
							stepMeta={stepMeta}
						/>
					) : null}

					<SellerManageCard tiles={manageTiles} />
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 14 },
	banner: {
		flexDirection: "row",
		gap: 10,
		padding: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	bannerTitle: { fontSize: 14, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
});
