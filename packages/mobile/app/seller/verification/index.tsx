import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useReducer } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { LevelLadder } from "@/src/components/verification/LevelLadder";
import { LevelSection } from "@/src/components/verification/LevelSection";
import { VerificationStatusCard } from "@/src/components/verification/VerificationStatusCard";
import { useMyShop } from "@/src/hooks/useShops";
import { useShopVerification } from "@/src/hooks/useVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";

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

	const isLoading = myShop.isPending || (Boolean(shop?.id) && query.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && query.isError);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("verification.hub.title")} />

			{isLoading ? <HubSkeleton /> : null}

			{!isLoading && isError ? (
				<HubError
					message={resolveErrorMessage(myShop.error ?? query.error, t)}
					onRetry={() => {
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
				<ScrollView contentContainerStyle={styles.content}>
					{!query.data.enabled ? (
						<View
							accessibilityRole="alert"
							style={[styles.banner, { backgroundColor: c.warningSoft }]}
						>
							<Ionicons
								name="information-circle"
								size={18}
								color={c.warningText}
							/>
							<Text style={[styles.bannerText, { color: c.warningText }]}>
								{t("verification.hub.disabledBanner")}
							</Text>
						</View>
					) : null}

					<VerificationStatusCard view={query.data} />
					<LevelLadder capabilities={query.data.capabilities} />

					<LevelSection
						view={query.data}
						level={2}
						isOwner={role === "owner"}
						pendingLevel={state.pendingLevel}
						onStart={onStart}
					/>
					<LevelSection
						view={query.data}
						level={3}
						isOwner={role === "owner"}
						pendingLevel={state.pendingLevel}
						onStart={onStart}
					/>
				</ScrollView>
			) : null}
		</SafeAreaView>
	);
}

function HubSkeleton() {
	const c = useShopTheme();
	return (
		<View style={styles.content}>
			{[0, 1, 2].map((i) => (
				<View
					key={i}
					style={[styles.skeletonBlock, { backgroundColor: c.neutralSoft }]}
				/>
			))}
		</View>
	);
}

function HubError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View accessibilityRole="alert" style={styles.errorWrap}>
			<Ionicons name="cloud-offline-outline" size={28} color={c.muted} />
			<Text style={[styles.errorText, { color: c.text }]}>{message}</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("common.retry")}
				onPress={onRetry}
				style={[styles.retryBtn, { backgroundColor: c.primary }]}
			>
				<Text style={styles.retryLabel}>{t("common.retry")}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 40 },
	skeletonBlock: { height: 96, borderRadius: 16 },
	errorWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		padding: 32,
	},
	errorText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	retryBtn: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	retryLabel: {
		color: "#ffffff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		borderRadius: 12,
		padding: 12,
	},
	bannerText: { flex: 1, fontSize: 13, fontFamily: Fonts.body },
});
