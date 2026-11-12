import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { fillOf } from "@/src/components/shop/ink";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { LevelLadder } from "@/src/components/verification/LevelLadder";
import { LevelSection } from "@/src/components/verification/LevelSection";
import { VerificationStatusCard } from "@/src/components/verification/VerificationStatusCard";
import { useMyShop } from "@/src/hooks/useShops";
import { useShopVerification } from "@/src/hooks/useVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	type FooterAction,
	footerAction,
	showsLevelSection,
} from "@/src/lib/verification";

// `as never`: expo-router's generated route types lag behind these two
// screens, which land from sibling tasks in this same wave (see the other
// `as never` casts already in `seller/index.tsx` and the `shop/create` link
// for the same reason). This is the one place this file accepts a cast that
// bypasses a type check rather than fixing a real mismatch.
const CONTINUE_HREF: Record<2 | 3, never> = {
	2: "/seller/verification/identity" as never,
	3: "/seller/verification/business" as never,
};

interface HubState {
	/** Set right before navigating away, cleared on refocus — guards against
	 * a second tap re-firing the same navigation while the transition plays. */
	pendingLevel: 2 | 3 | null;
}

const initialState: HubState = { pendingLevel: null };

function reducer(state: HubState, patch: Partial<HubState>): HubState {
	return { ...state, ...patch };
}

/**
 * `query.data.enabled` gates only the actions that would *start* something —
 * the badge, the ladder and any in-flight request render exactly the same
 * whether the feature is on or off, so a seller mid-review never sees an
 * empty page just because the flag was paused.
 */
export default function VerificationHubScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const role = myShop.data?.role;
	const query = useShopVerification(shop?.id);
	const [state, patch] = useReducer(reducer, initialState);

	useFocusEffect(
		useCallback(() => {
			return () => patch({ pendingLevel: null });
		}, []),
	);

	const onStart = useCallback((level: 2 | 3) => {
		patch({ pendingLevel: level });
		router.push(CONTINUE_HREF[level]);
	}, []);

	const footer = query.data ? footerAction(query.data, role === "owner") : null;

	const isLoading = myShop.isPending || (Boolean(shop?.id) && query.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && query.isError);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("verification.hub.title")} />

			{isLoading ? <DetailSkeleton cards={3} /> : null}

			{!isLoading && isError ? (
				<EmptyState
					illustration="notFound"
					title={t("verification.loadError")}
					subtitle={resolveErrorMessage(myShop.error ?? query.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => {
						void myShop.refetch();
						void query.refetch();
					}}
				/>
			) : null}

			{!isLoading && !isError && myShop.data && !shop ? (
				<EmptyState
					illustration="sell"
					title={t("seller.noShopTitle")}
					subtitle={t("seller.noShopSubtitle")}
					ctaLabel={t("account.openShop")}
					onCta={() => router.replace("/shop/create" as never)}
				/>
			) : null}

			{!isLoading && !isError && query.data ? (
				<ScreenColumn width="reading">
					<ScrollView
						contentContainerStyle={[
							styles.content,
							footer ? styles.contentWithFooter : null,
						]}
						// A request under review: pull down to see the decision.
						refreshControl={
							<RefreshControl
								refreshing={query.isRefetching}
								onRefresh={() => void query.refetch()}
								tintColor={c.primary}
								colors={[c.primary]}
								progressBackgroundColor={c.card}
							/>
						}
					>
						{!query.data.enabled ? (
							<View
								accessibilityRole="alert"
								style={[styles.banner, { backgroundColor: c.warningSoft }]}
							>
								<Ionicons
									name="information-circle"
									size={20}
									color={c.warningText}
								/>
								<Text style={[styles.bannerText, { color: c.warningText }]}>
									{t("verification.hub.disabledBanner")}
								</Text>
							</View>
						) : null}

						<VerificationStatusCard view={query.data} />
						<LevelLadder
							capabilities={query.data.capabilities}
							requirements={query.data.nextLevel?.requirements}
						/>

						{showsLevelSection(query.data, 2) ? (
							<LevelSection
								view={query.data}
								level={2}
								isOwner={role === "owner"}
								pendingLevel={state.pendingLevel}
								onStart={onStart}
								actionInFooter={footer?.level === 2}
							/>
						) : null}
						{showsLevelSection(query.data, 3) ? (
							<LevelSection
								view={query.data}
								level={3}
								isOwner={role === "owner"}
								pendingLevel={state.pendingLevel}
								onStart={onStart}
								actionInFooter={footer?.level === 3}
							/>
						) : null}
					</ScrollView>
				</ScreenColumn>
			) : null}

			{!isLoading && !isError && footer ? (
				<HubFooter
					action={footer}
					pending={state.pendingLevel === footer.level}
					onPress={() => onStart(footer.level)}
				/>
			) : null}
		</SafeAreaView>
	);
}

function HubFooter({
	action,
	pending,
	onPress,
}: {
	action: FooterAction;
	pending: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const label =
		action.kind === "continue"
			? t("verification.footer.continue")
			: t(`verification.footer.start.${action.level}`);
	return (
		<View
			style={[
				styles.footer,
				{
					backgroundColor: c.card,
					borderTopColor: c.border,
					paddingBottom: Math.max(insets.bottom, 12),
				},
			]}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ disabled: pending, busy: pending }}
				disabled={pending}
				onPress={onPress}
				style={({ pressed }) => [
					styles.footerBtn,
					{
						backgroundColor: fillOf(c),
						opacity: pending ? 0.6 : pressed ? 0.85 : 1,
					},
				]}
			>
				{pending ? (
					<ActivityIndicator color="#ffffff" size="small" />
				) : (
					<Text style={styles.footerLabel}>{label}</Text>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 16, paddingBottom: 40 },
	contentWithFooter: { paddingBottom: 110 },
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	footerBtn: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
	},
	footerLabel: {
		color: "#ffffff",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		padding: 14,
	},
	bannerText: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
});
