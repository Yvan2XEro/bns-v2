import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
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
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useMyShop } from "@/src/hooks/useShops";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	buildChecklistSteps,
	type ChecklistStepKey,
	countDoneSteps,
} from "@/src/lib/sellerChecklist";
import { shopUrl, shopUrlLabel } from "@/src/lib/shopHandle";
import type { MyShop, MyShopResponse } from "@/src/types/api";

type ShopCounts = NonNullable<MyShopResponse["counts"]>;

type IconName = keyof typeof Ionicons.glyphMap;

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

	const url = shopUrl(shop.handle, webUrl);
	const share = () => Share.share({ message: `${shop.name}\n${url}`, url });
	const productCount = counts.activeProducts + counts.draftProducts;
	const firstRun = productCount === 0;
	const createdToday =
		new Date(shop.createdAt).toDateString() === new Date().toDateString();

	const stepMeta: Record<
		ChecklistStepKey,
		{
			title: string;
			body: string;
			action?: string;
			onPress: () => void;
		}
	> = {
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

	const steps = buildChecklistSteps({
		hasLogo: Boolean(shop.logo),
		productCount,
		personalListings: counts.personalListings,
	});
	const doneCount = countDoneSteps(steps);

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
				<View style={[styles.top, { backgroundColor: c.header }]}>
					<View style={styles.topRow}>
						<Pressable
							onPress={() =>
								router.canGoBack()
									? router.back()
									: router.replace("/(tabs)/account")
							}
							style={styles.iconHit}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t("common.back")}
						>
							<Ionicons name="arrow-back" size={22} color={c.text} />
						</Pressable>
						<ShopAvatar
							name={shop.name}
							logo={shop.logo?.url}
							size={44}
							radius={12}
						/>
						<View style={{ flex: 1 }}>
							<Text
								style={[styles.shopName, { color: c.text }]}
								numberOfLines={1}
							>
								{shop.name}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("seller.space")}
							</Text>
						</View>
						<Pressable
							onPress={() => router.push(`/s/${shop.handle}` as never)}
							style={styles.iconHit}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t("seller.publicPage")}
						>
							<Ionicons name="storefront-outline" size={22} color={c.primary} />
						</Pressable>
					</View>

					<View
						style={[
							styles.linkCard,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<View style={{ flex: 1 }}>
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("seller.publicPage")}
							</Text>
							<Text
								style={[styles.link, { color: c.primary }]}
								numberOfLines={1}
							>
								{shopUrlLabel(shop.handle, webUrl)}
							</Text>
						</View>
						<Pressable
							onPress={share}
							style={[styles.shareBtn, { backgroundColor: c.primary }]}
							accessibilityRole="button"
							accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
						>
							<Ionicons name="share-social-outline" size={16} color="#fff" />
							<Text style={styles.shareText}>{t("seller.share")}</Text>
						</Pressable>
					</View>
				</View>

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
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.pills}>
								<LevelBadge level={shop.level} size="sm" />
								{createdToday ? (
									<View
										style={[styles.pill, { backgroundColor: c.successSoft }]}
									>
										<Text style={[styles.pillText, { color: c.successText }]}>
											{t("seller.createdToday")}
										</Text>
									</View>
								) : null}
							</View>
							<Text style={[styles.welcome, { color: c.text }]}>
								{t("seller.welcome", { name: shop.owner.name.split(" ")[0] })}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t("seller.welcomeBody", { shop: shop.name })}
							</Text>
							<View style={styles.stepsHead}>
								<Text style={[styles.section, { color: c.text }]}>
									{t("seller.getStarted")}
								</Text>
								<Text style={[styles.meta, { color: c.muted }]}>
									{doneCount} / {steps.length}
								</Text>
							</View>
							{steps.map((step, index) => {
								const meta = stepMeta[step.key];
								return (
									<Pressable
										key={step.key}
										onPress={meta.onPress}
										style={[styles.step, { borderTopColor: c.border }]}
										accessibilityRole="button"
										accessibilityLabel={meta.title}
									>
										<View
											style={[
												styles.stepDot,
												{
													backgroundColor: step.done
														? c.success
														: c.neutralSoft,
												},
											]}
										>
											{step.done ? (
												<Ionicons name="checkmark" size={14} color="#fff" />
											) : (
												<Text style={[styles.stepNum, { color: c.body }]}>
													{index + 1}
												</Text>
											)}
										</View>
										<View style={{ flex: 1 }}>
											<Text style={[styles.stepTitle, { color: c.text }]}>
												{meta.title}
											</Text>
											<Text style={[styles.meta, { color: c.muted }]}>
												{meta.body}
											</Text>
										</View>
										{meta.action ? (
											<View
												style={[styles.stepAction, { backgroundColor: c.sell }]}
											>
												<Text style={styles.stepActionText}>{meta.action}</Text>
											</View>
										) : (
											<Ionicons
												name="chevron-forward"
												size={16}
												color={c.muted}
											/>
										)}
									</Pressable>
								);
							})}
						</View>
					) : null}

					<Text style={[styles.sectionLabel, { color: c.muted }]}>
						{t("seller.manage")}
					</Text>
					<View
						style={[
							styles.card,
							styles.tiles,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Tile
							icon="cube-outline"
							title={t("seller.tileCatalogue")}
							body={t("seller.tileCatalogueBody", {
								count: counts.activeProducts,
								drafts: counts.draftProducts,
							})}
							onPress={() => router.push("/seller/catalogue" as never)}
						/>
						<Tile
							icon="layers-outline"
							title={t("seller.tileStock")}
							body={
								counts.lowStockVariants > 0
									? t("seller.tileStockAlerts", {
											count: counts.lowStockVariants,
											sample: counts.lowStockSample ?? "",
										})
									: t("seller.tileStockOk")
							}
							alert={counts.lowStockVariants > 0}
							onPress={() =>
								router.push({
									pathname: "/seller/catalogue",
									params: { filter: "low" },
								} as never)
							}
						/>
						<Tile
							icon="settings-outline"
							title={t("seller.tileSettings")}
							body={t("seller.tileSettingsBody")}
							onPress={() => router.push("/shop/manage" as never)}
							last
						/>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

function Tile({
	icon,
	title,
	body,
	onPress,
	alert,
	last,
}: {
	icon: IconName;
	title: string;
	body: string;
	onPress: () => void;
	alert?: boolean;
	last?: boolean;
}) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.tile,
				!last && {
					borderBottomWidth: StyleSheet.hairlineWidth,
					borderBottomColor: c.border,
				},
			]}
			accessibilityRole="button"
			accessibilityLabel={title}
		>
			<View
				style={[
					styles.tileIcon,
					{ backgroundColor: alert ? c.warningSoft : c.primarySoft },
				]}
			>
				<Ionicons
					name={icon}
					size={18}
					color={alert ? c.warningText : c.primary}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.stepTitle, { color: c.text }]}>{title}</Text>
				<Text style={[styles.meta, { color: alert ? c.warningText : c.muted }]}>
					{body}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	top: { padding: 16, gap: 14 },
	topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	iconHit: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	shopName: { fontSize: 18, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	linkCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	link: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	shareBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minHeight: 44,
	},
	shareText: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodySemibold },
	content: { padding: 16, gap: 14 },
	banner: {
		flexDirection: "row",
		gap: 10,
		padding: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	bannerTitle: { fontSize: 14, fontFamily: Fonts.displayBold },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 8,
	},
	pills: { flexDirection: "row", gap: 8 },
	pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	welcome: { fontSize: 20, fontFamily: Fonts.displayExtrabold },
	body: { fontSize: 14, fontFamily: Fonts.body },
	stepsHead: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
	},
	section: { fontSize: 15, fontFamily: Fonts.displayBold },
	step: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	stepDot: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	stepNum: { fontSize: 12, fontFamily: Fonts.bodyBold },
	stepTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	stepAction: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
	stepActionText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	tiles: { padding: 0, gap: 0 },
	tile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
	tileIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
