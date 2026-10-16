import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerChecklistCard } from "@/src/components/shop/SellerChecklistCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import {
	SellerGuideLink,
	SellerLaunchCard,
	SellerTipCard,
} from "@/src/components/shop/SellerHomeCards";
import {
	HUB_HEADER_BG,
	SellerHubBar,
} from "@/src/components/shop/SellerHubHeader";
import { SellerInsightsSummary } from "@/src/components/shop/SellerInsightsSummary";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useSellerHomeActions } from "@/src/hooks/useSellerHomeActions";
import { useSellerOrders } from "@/src/hooks/useSellerOrders";
import { useSellerPayments } from "@/src/hooks/useSellerPayments";
import { useSellerHome } from "@/src/hooks/useShopOnboarding";
import { useMyShop } from "@/src/hooks/useShops";
import { type DashboardTaskKey, dashboardTasks } from "@/src/lib/appMode";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { launchTarget, stepTarget, tipTarget } from "@/src/lib/sellerHome";
import { sellerPaymentsActionCount } from "@/src/lib/sellerPayments";
import { showsOrdersTile } from "@/src/lib/sellerTiles";
import { can } from "@/src/lib/shopRoles";

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function SellerDashboardTab() {
	return (
		<SellerTabRootContext.Provider value>
			<SellerDashboard />
		</SellerTabRootContext.Provider>
	);
}

function SellerDashboard() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { user } = useAuth();
	const { ordersEnabled, insightsEnabled } = useAppConfig();
	const mine = useMyShop();
	const { shop: active } = useActiveShop();
	const shop = mine.data?.shop;
	const counts = mine.data?.counts;
	const role = mine.data?.role ?? null;

	// Same query as the orders tab badge and the orders list's first tab.
	const readsOrders = showsOrdersTile(active?.role, ordersEnabled);
	const orders = useSellerOrders(readsOrders ? active?.shopId : undefined, {
		tab: "to_accept",
	});
	const orderCounts = orders.data?.pages[0]?.counts;
	const readsPayments = ordersEnabled && can(role, "payments.view");
	const payments = useSellerPayments(
		readsPayments ? (shop?.id ?? undefined) : undefined,
	);
	const home = useSellerHome(shop?.id);
	const actions = useSellerHomeActions({
		name: shop?.name ?? "",
		handle: shop?.handle ?? "",
	});

	if (mine.isLoading) {
		return (
			<View style={[styles.center, { backgroundColor: c.bg }]}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}

	if (!shop || !counts) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerMode.tabs.dashboard")} />
				<EmptyState
					illustration="notFound"
					title={t("seller.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => mine.refetch()}
				/>
			</SafeAreaView>
		);
	}

	const unread = can(active?.role, "inbox.reply")
		? (active?.inboxUnread ?? 0)
		: 0;
	const tasks = dashboardTasks({
		toAccept: orderCounts?.to_accept ?? 0,
		toShip: orderCounts?.to_ship ?? 0,
		unread,
		lowStock: counts.lowStockVariants,
		paymentsHolds: sellerPaymentsActionCount(payments.data),
	});
	const total = tasks.reduce((sum, task) => sum + task.count, 0);
	const firstName = user?.name?.split(" ")[0] ?? "";
	const model = home.model;
	// Until the facts arrive (or if they cannot), the screen is what it was:
	// tasks and insights. Guidance is added, never waited on.
	const stage = model?.stage ?? "active";
	const meta =
		total > 0
			? t("sellerMode.actionsWaiting", { count: total })
			: !model
				? t("sellerMode.noActions")
				: stage === "setup"
					? t("sellerHome.metaSetup")
					: stage === "launch"
						? t("sellerHome.metaLaunch")
						: t("sellerHome.metaActive");
	const tipOpen = model?.tip != null ? tipTarget(model.tip, model.facts) : null;

	const taskMeta: Record<
		DashboardTaskKey,
		{
			icon: IoniconsName;
			tint: string;
			soft: string;
			label: (count: number) => string;
			onPress: () => void;
		}
	> = {
		toAccept: {
			icon: "time-outline",
			tint: c.warningText,
			soft: c.warningSoft,
			label: (count) => t("sellerMode.taskToAccept", { count }),
			onPress: () =>
				router.push({
					pathname: "/seller/orders",
					params: { tab: "to_accept" },
				}),
		},
		toShip: {
			icon: "cube-outline",
			tint: c.primary,
			soft: c.primarySoft,
			label: (count) => t("sellerMode.taskToShip", { count }),
			onPress: () =>
				router.push({ pathname: "/seller/orders", params: { tab: "to_ship" } }),
		},
		unread: {
			icon: "chatbubble-ellipses-outline",
			tint: c.successText,
			soft: c.successSoft,
			label: (count) => t("sellerMode.taskUnread", { count }),
			onPress: () => router.push("/seller/inbox"),
		},
		paymentsHolds: {
			icon: "wallet-outline",
			tint: c.dangerText,
			soft: c.dangerSoft,
			label: (count) => t("sellerMode.taskPaymentsHold", { count }),
			onPress: () => router.push("/seller/payments"),
		},
		lowStock: {
			icon: "alert-circle-outline",
			tint: c.dangerText,
			soft: c.dangerSoft,
			label: (count) =>
				t("seller.tileStockAlerts", {
					count,
					sample: counts.lowStockSample ?? "",
				}),
			onPress: () =>
				router.push({
					pathname: "/seller/catalogue",
					params: { filter: "low" },
				}),
		},
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: HUB_HEADER_BG }]}
		>
			<SellerHubBar shop={shop} />
			<ScrollView
				style={{ backgroundColor: c.bg }}
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={mine.isRefetching}
						onRefresh={() => {
							void mine.refetch();
							void home.query.refetch();
							if (readsOrders) void orders.refetch();
							if (readsPayments) void payments.refetch();
						}}
						tintColor={c.primary}
					/>
				}
			>
				<View>
					<Text style={[styles.hello, { color: c.text }]}>
						{t("sellerMode.greeting", { name: firstName })}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>{meta}</Text>
				</View>

				{tasks.length > 0 ? (
					<View
						style={[
							styles.panel,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{tasks.map((task, index) => {
							const meta = taskMeta[task.key];
							return (
								<Pressable
									key={task.key}
									onPress={meta.onPress}
									accessibilityRole="button"
									style={({ pressed }) => [
										styles.task,
										index > 0 && {
											borderTopWidth: StyleSheet.hairlineWidth,
											borderTopColor: c.border,
										},
										pressed && { opacity: 0.85 },
									]}
								>
									<View
										style={[styles.taskIcon, { backgroundColor: meta.soft }]}
									>
										<Ionicons name={meta.icon} size={18} color={meta.tint} />
									</View>
									<Text
										style={[styles.taskLabel, { color: c.text }]}
										numberOfLines={2}
									>
										{meta.label(task.count)}
									</Text>
									<Ionicons name="chevron-forward" size={16} color={c.muted} />
								</Pressable>
							);
						})}
					</View>
				) : null}

				{model && model.mode !== "hidden" ? (
					<SellerChecklistCard
						steps={model.steps}
						mode={model.mode}
						onStep={(step) => actions.open(stepTarget(step))}
						onDismiss={home.dismissChecklist}
					/>
				) : null}

				{model && model.actions.length > 0 ? (
					<SellerLaunchCard
						actions={model.actions}
						onAction={(action) =>
							actions.open(launchTarget(action, model.facts))
						}
						onMoreShare={actions.shareAny}
					/>
				) : null}

				{model?.tip ? (
					<SellerTipCard
						tip={model.tip}
						onOpen={
							tipOpen && tipOpen.kind !== "none"
								? () => actions.open(tipOpen)
								: null
						}
						onDismiss={() => model.tip && home.dismissTip(model.tip)}
					/>
				) : null}

				{role && stage !== "setup" ? (
					<SellerInsightsSummary
						enabled={insightsEnabled}
						role={role}
						shopId={shop.id}
					/>
				) : null}

				<SellerGuideLink onPress={() => router.push("/seller/guide")} />
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 14, paddingBottom: 40 },
	hello: { fontSize: 22, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body, marginTop: 2 },
	panel: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
	task: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	taskIcon: {
		width: 36,
		height: 36,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	taskLabel: { flex: 1, fontSize: 15, fontFamily: Fonts.bodySemibold },
});
