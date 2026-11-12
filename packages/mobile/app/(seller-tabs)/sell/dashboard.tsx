import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, TextStyles } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { SellerChecklistCard } from "@/src/components/shop/SellerChecklistCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import {
	SellerGuideLink,
	SellerLaunchCard,
	SellerTipCard,
} from "@/src/components/shop/SellerHomeCards";
import {
	SellerHubBar,
	useHubHeaderBg,
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
import { shopProfileRules } from "@/src/lib/listingKind";
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
	const hubBg = useHubHeaderBg();
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

	// The first load keeps the workspace's frame: its title and rows in the
	// shape of the task list, rather than a lone spinner on a blank ground.
	if (mine.isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerMode.tabs.dashboard")} />
				<View style={styles.skeleton}>
					<ListSkeleton rows={4} />
				</View>
			</SafeAreaView>
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
	// A count that could not be read is not a zero: "nothing to do" is only
	// said when every list it depends on answered.
	const countsFailed =
		(readsOrders && orders.isError) || (readsPayments && payments.isError);
	const firstName = user?.name?.split(" ")[0]?.trim() ?? "";
	const model = home.model;
	// Until the facts arrive (or if they cannot), the screen is what it was:
	// tasks and insights. Guidance is added, never waited on.
	const stage = model?.stage ?? "active";
	const meta =
		total > 0
			? t("sellerMode.actionsWaiting", { count: total })
			: countsFailed
				? null
				: !model
					? t("sellerMode.noActions")
					: stage === "setup"
						? t("sellerHome.metaSetup")
						: stage === "launch"
							? t("sellerHome.metaLaunch")
							: t("sellerHome.metaActive");
	const tipOpen = model?.tip != null ? tipTarget(model.tip, model.facts) : null;

	// Orders, messages and stock are tabs of this workspace: a task opens the
	// tab, rather than pushing a second copy of the same screen above the tabs
	// that the back button then unwinds to the dashboard. `at` makes the tab
	// open on the asked list even when it was already mounted on another one.
	const openOrders = (tab: "to_accept" | "to_ship") =>
		router.navigate({
			pathname: "/(seller-tabs)/sell/orders",
			params: { tab, at: String(Date.now()) },
		});
	const retail = shopProfileRules(active?.profile).retail;
	const canAdd = can(role, "catalogue.edit");

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
			onPress: () => openOrders("to_accept"),
		},
		toShip: {
			icon: "cube-outline",
			tint: c.primary,
			soft: c.primarySoft,
			label: (count) => t("sellerMode.taskToShip", { count }),
			onPress: () => openOrders("to_ship"),
		},
		unread: {
			icon: "chatbubble-ellipses-outline",
			tint: c.successText,
			soft: c.successSoft,
			label: (count) => t("sellerMode.taskUnread", { count }),
			onPress: () => router.navigate("/(seller-tabs)/sell/inbox"),
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
				router.navigate({
					pathname: "/(seller-tabs)/sell/catalogue",
					params: { filter: "low" },
				}),
		},
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: hubBg }]}
		>
			<SellerHubBar shop={shop} />
			<ScreenColumn width="wide">
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
					<View style={styles.intro}>
						<Text
							style={[styles.hello, { color: c.text }]}
							accessibilityRole="header"
						>
							{firstName
								? t("sellerMode.greeting", { name: firstName })
								: t("sellerMode.greetingNoName", { defaultValue: "Bonjour" })}
						</Text>
						{meta ? (
							<Text style={[styles.meta, { color: c.body }]}>{meta}</Text>
						) : (
							<Text
								style={[styles.meta, { color: c.warningText }]}
								accessibilityRole="alert"
							>
								{t("sellerMode.countsError", {
									defaultValue:
										"Impossible de vérifier vos commandes. Tirez pour actualiser.",
								})}
							</Text>
						)}
					</View>

					{/* The most frequent seller task, one tap from home: the sell
					    plaque, signage yellow with ink on it. */}
					{canAdd && stage !== "setup" ? (
						<Pressable
							onPress={() =>
								retail
									? router.push("/seller/product/new" as never)
									: router.push("/(tabs)/create")
							}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.addBtn,
								{
									backgroundColor: c.sell,
									opacity: pressed ? 0.9 : 1,
								},
							]}
						>
							<Ionicons
								name="add"
								size={20}
								color={Colors.light.sunForeground}
							/>
							<Text
								style={[
									styles.addBtnText,
									{ color: Colors.light.sunForeground },
								]}
							>
								{retail ? t("catalogue.addProduct") : t("create.newListing")}
							</Text>
						</Pressable>
					) : null}

					{countsFailed ? (
						<Pressable
							onPress={() => {
								if (readsOrders) void orders.refetch();
								if (readsPayments) void payments.refetch();
							}}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.panel,
								styles.task,
								{
									backgroundColor: pressed ? c.primarySoft : c.card,
									borderColor: c.border,
								},
							]}
						>
							<View
								style={[styles.taskIcon, { backgroundColor: c.warningSoft }]}
								importantForAccessibility="no-hide-descendants"
							>
								<Ionicons name="refresh" size={18} color={c.warningText} />
							</View>
							<Text
								style={[styles.taskLabel, { color: c.text }]}
								numberOfLines={2}
							>
								{t("common.retry")}
							</Text>
						</Pressable>
					) : null}

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
										accessibilityLabel={meta.label(task.count)}
										style={({ pressed }) => [
											styles.task,
											index > 0 && {
												borderTopWidth: StyleSheet.hairlineWidth,
												borderTopColor: c.border,
											},
											pressed && { backgroundColor: c.primarySoft },
										]}
									>
										<View
											style={[styles.taskIcon, { backgroundColor: meta.soft }]}
											importantForAccessibility="no-hide-descendants"
										>
											<Ionicons name={meta.icon} size={18} color={meta.tint} />
										</View>
										<Text
											style={[styles.taskLabel, { color: c.text }]}
											numberOfLines={2}
										>
											{meta.label(task.count)}
										</Text>
										<Ionicons
											name="chevron-forward"
											size={16}
											color={c.muted}
										/>
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
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	skeleton: { paddingTop: 16 },
	content: { padding: 16, gap: 14, paddingBottom: 40 },
	intro: { paddingTop: 4, paddingBottom: 2 },
	hello: { ...TextStyles.h2 },
	meta: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body, marginTop: 2 },
	panel: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	task: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	taskIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	taskLabel: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	addBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 20,
		// The sell plaque's darker foot, as on the tab bar and the publish button.
		borderBottomWidth: 3,
		borderBottomColor: "#9a6a00",
	},
	addBtnText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
