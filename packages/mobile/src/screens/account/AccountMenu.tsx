import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { NdopPattern } from "@/src/components/brand/NdopPattern";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { SuspensionBanner } from "@/src/components/moderation/SuspensionBanner";
import { ReviewStars } from "@/src/components/ReviewStars";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { switchAppMode } from "@/src/components/shop/SwitchModeButton";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useHasShopMembership, useStoredAppMode } from "@/src/hooks/useAppMode";
import {
	useIsModerator,
	useModerationSummary,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useCourierMembership } from "@/src/hooks/useRiderShipments";
import { useMyShop, useShopsEnabled } from "@/src/hooks/useShops";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { courierSpaceTarget } from "@/src/lib/riderShipment";
import type { AccountPane } from "./accountPanes";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface MenuItemProps {
	icon: IoniconsName;
	label: string;
	sublabel?: string;
	onPress: () => void;
	danger?: boolean;
	iconBg?: string;
	iconColor?: string;
	isDark: boolean;
	borderColor: string;
	rightElement?: React.ReactNode;
	/** Open in the pane beside the menu. */
	selected?: boolean;
}

function MenuItem({
	icon,
	label,
	sublabel,
	onPress,
	danger,
	iconBg,
	iconColor,
	isDark,
	borderColor,
	rightElement,
	selected,
}: MenuItemProps) {
	const selectedStyle = useSelectedRowStyle()(selected);
	const textColor = danger ? "#d23a2e" : isDark ? "#e1e3ee" : "#12163a";
	const resolvedIconColor = danger
		? "#d23a2e"
		: (iconColor ?? (isDark ? "#a3a7c8" : "#4a4f78"));
	const resolvedIconBg = danger
		? isDark
			? "#3a1310"
			: "#fbe3e0"
		: (iconBg ?? (isDark ? "#1a1f4a" : "#eceef5"));

	return (
		<AnimatedPressable
			onPress={onPress}
			scaleTo={0.98}
			accessibilityState={{ selected: Boolean(selected) }}
			style={[
				styles.menuItem,
				{ borderBottomColor: borderColor },
				selectedStyle,
			]}
		>
			<View style={[styles.iconBox, { backgroundColor: resolvedIconBg }]}>
				<Ionicons name={icon} size={17} color={resolvedIconColor} />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.menuLabel, { color: textColor }]}>{label}</Text>
				{sublabel && (
					<Text
						style={[
							styles.menuSublabel,
							{ color: isDark ? "#a3a7c8" : "#5b6088" },
						]}
					>
						{sublabel}
					</Text>
				)}
			</View>
			{rightElement}
			<Ionicons
				name="chevron-forward"
				size={16}
				color={isDark ? "#4a4f78" : "#c9cce0"}
			/>
		</AnimatedPressable>
	);
}

function NotificationsUnreadBadge() {
	const { counts } = useCounts({ filters: [{ read: false }] });
	const count = counts?.[0]?.count ?? 0;
	if (count === 0) return null;
	return (
		<View style={styles.notifBadge}>
			<Text style={styles.notifBadgeText}>{count > 9 ? "9+" : count}</Text>
		</View>
	);
}

/**
 * The account tab's menu. Its entries open beside it on a tablet in
 * landscape (`ACCOUNT_PANES`) and as their own screens otherwise; seller
 * mode, moderation and the courier space always take the whole screen.
 */
export function AccountMenu({ selectedId, onOpen }: SplitListProps) {
	const entry = (pane: AccountPane) => ({
		onPress: () => onOpen(pane),
		selected: selectedId === pane,
	});
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user, logout } = useAuth();
	const isModerator = useIsModerator();
	const { data: moderationSummary } = useModerationSummary();
	const pendingCount = moderationSummary?.total ?? 0;
	// The flag gates opening a NEW shop only; an owner keeps their shop entry
	// regardless of it, which is why `ownShop` — not `shopsEnabled` — decides
	// whether the row below shows a shop or the "open a shop" invite.
	const shopsEnabled = useShopsEnabled();
	const { ordersEnabled } = useAppConfig();
	const courierSpace = courierSpaceTarget(useCourierMembership().data ?? []);
	const { data: myShop } = useMyShop();
	const ownShop = myShop?.shop ?? null;
	// Staff of someone else's shop get seller mode too, not only owners.
	const isShopMember = useHasShopMembership().shopCount > 0;
	// Opened from the seller Boutique tab, the row offers the way back instead.
	const inSellerMode = useStoredAppMode().mode === "seller";
	const { showConfirm } = useAlert();
	const { t, i18n } = useTranslation();
	const pathname = usePathname();

	const notificationReady = useNotificationReady();

	const bg = isDark ? "#0c1030" : "#f4f5f9";
	const cardBg = isDark ? "#1a1f4a" : "#ffffff";
	const textColor = isDark ? "#e1e3ee" : "#12163a";
	const mutedColor = isDark ? "#a3a7c8" : "#5b6088";
	const primaryColor = isDark ? "#6878ea" : "#23338f";
	const borderColor = isDark ? "#1a1f4a" : "#eceef5";
	const accentBg = isDark ? "#12163a" : "#e9ecfa";

	if (!user) {
		const goLogin = () =>
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
		const goRegister = () =>
			router.push({
				pathname: "/auth/register",
				params: getAuthModalParams(pathname),
			});
		const cardStyle = [
			styles.sectionCard,
			{ backgroundColor: cardBg, borderColor: isDark ? "#2a3170" : "#e1e3ee" },
		];
		const language =
			i18n.language?.slice(0, 2) === "en" ? "English" : "Français";
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.accountIconWrap,
							{ backgroundColor: isDark ? "#2a3170" : "#e3e7f8" },
						]}
					>
						<Ionicons name="person" size={22} color={primaryColor} />
					</View>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						{t("account.myAccount")}
					</Text>
				</View>
				<ScrollView
					style={[styles.contentWrap, { backgroundColor: bg }]}
					contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
					showsVerticalScrollIndicator={false}
				>
					{/* The invitation: what an account unlocks, then the two ways in. */}
					<View style={styles.section}>
						<View
							style={[
								styles.guestCard,
								{
									backgroundColor: isDark ? "#1d2568" : "#1d2a7a",
								},
							]}
						>
							<NdopPattern />
							<Text style={styles.guestTitle}>{t("account.guestTitle")}</Text>
							<Text style={styles.guestPrompt}>
								{t("account.signInPrompt")}
							</Text>
							{(
								[
									["heart-outline", t("account.guestPerkFavorites")],
									["chatbubbles-outline", t("account.guestPerkMessages")],
									["cube-outline", t("account.guestPerkOrders")],
								] as const
							).map(([icon, label]) => (
								<View key={icon} style={styles.guestPerk}>
									<Ionicons name={icon} size={16} color="#c5ccf0" />
									<Text style={styles.guestPerkText}>{label}</Text>
								</View>
							))}
							<View style={styles.guestActions}>
								<Pressable
									onPress={goLogin}
									accessibilityRole="button"
									style={[styles.guestPrimary, { backgroundColor: "#ffb81c" }]}
								>
									<Text style={styles.guestPrimaryText}>
										{t("account.signIn")}
									</Text>
								</Pressable>
								<Pressable
									onPress={goRegister}
									accessibilityRole="button"
									style={styles.guestSecondary}
								>
									<Text style={styles.guestSecondaryText}>
										{t("account.createAccount")}
									</Text>
								</Pressable>
							</View>
						</View>
					</View>

					{/* Everything below works without an account. */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionPreferences")}
						</Text>
						<View style={cardStyle}>
							<MenuItem
								icon="language-outline"
								label={t("settings.language")}
								sublabel={language}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="contrast-outline"
								label={t("settings.theme")}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="settings-outline"
								label={t("account.settings")}
								{...entry("settings")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSupport")}
						</Text>
						<View style={cardStyle}>
							<MenuItem
								icon="help-circle-outline"
								label={t("account.help")}
								{...entry("help")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.safety")}
								{...entry("safety")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="mail-outline"
								label={t("account.contact")}
								{...entry("contact")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="document-text-outline"
								label={t("account.terms")}
								{...entry("terms")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="lock-closed-outline"
								label={t("account.privacy")}
								{...entry("privacy")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>
				</ScrollView>
			</SafeAreaView>
		);
	}

	const handleLogout = () => {
		showConfirm(t("account.logoutTitle"), t("account.logoutMessage"), logout);
	};

	// null when createdAt is missing/malformed — the row is skipped rather than
	// showing "Membre depuis Invalid Date" at the top of the Account tab.
	const memberSince = formatDate(user.createdAt, {
		month: "long",
		year: "numeric",
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={centeredContent}
			>
				{/* ── Header (accent bg) ── */}
				<View style={[styles.profileHeader, { backgroundColor: accentBg }]}>
					<View style={styles.profileTopRow}>
						{/* Avatar */}
						<View style={styles.avatarWrap}>
							{user.avatar?.url ? (
								<Image
									source={{
										uri:
											resolveListingImageUrl(user.avatar, "thumbnail") ??
											user.avatar?.url,
									}}
									style={styles.avatar}
									contentFit="cover"
								/>
							) : (
								<View
									style={[
										styles.avatarPlaceholder,
										{ backgroundColor: primaryColor },
									]}
								>
									<Text style={styles.avatarLetter}>
										{user.name?.[0]?.toUpperCase() ?? "?"}
									</Text>
								</View>
							)}
						</View>

						{/* Info */}
						<View style={{ flex: 1 }}>
							<Text
								style={[styles.userName, { color: textColor }]}
								numberOfLines={1}
							>
								{user.name}
							</Text>
							{(user.totalReviews ?? 0) > 0 && (
								<ReviewStars
									rating={user.rating ?? 0}
									showCount
									count={user.totalReviews}
								/>
							)}
							{memberSince && (
								<Text style={[styles.memberSince, { color: mutedColor }]}>
									{t("account.memberSince")} {memberSince}
								</Text>
							)}
						</View>

						<AnimatedPressable
							{...entry("editProfile")}
							scaleTo={0.95}
							style={[
								styles.editBtn,
								{ backgroundColor: cardBg, borderColor, borderWidth: 1 },
							]}
						>
							<Ionicons name="pencil" size={14} color={primaryColor} />
							<Text style={[styles.editBtnText, { color: primaryColor }]}>
								{t("account.edit")}
							</Text>
						</AnimatedPressable>
					</View>
				</View>

				{/* ── Content (main bg, rounded top) ── */}
				<View style={[styles.content, { backgroundColor: bg }]}>
					<SuspensionBanner />

					{isModerator && (
						<View style={styles.section}>
							<Text style={[styles.sectionLabel, { color: mutedColor }]}>
								{t("account.sectionModeration")}
							</Text>
							<View
								style={[
									styles.sectionCard,
									{
										backgroundColor: cardBg,
										borderColor: isDark ? "#2a3170" : "#e1e3ee",
									},
								]}
							>
								<MenuItem
									icon="shield-half-outline"
									label={t("account.moderation")}
									sublabel={
										pendingCount > 0
											? t("account.moderationPending", { count: pendingCount })
											: t("account.moderationIdle")
									}
									iconBg={isDark ? "#3a2a00" : "#fff1c7"}
									iconColor="#9a6a00"
									rightElement={
										pendingCount > 0 ? (
											<View style={styles.notifBadge}>
												<Text style={styles.notifBadgeText}>
													{pendingCount > 9 ? "9+" : pendingCount}
												</Text>
											</View>
										) : undefined
									}
									onPress={() => router.push("/moderation")}
									isDark={isDark}
									borderColor={borderColor}
								/>
							</View>
						</View>
					)}

					{(shopsEnabled || ownShop || isShopMember) && (
						<View style={styles.section}>
							<Text style={[styles.sectionLabel, { color: mutedColor }]}>
								{t("account.sectionShop")}
							</Text>
							<View
								style={[
									styles.sectionCard,
									{
										backgroundColor: cardBg,
										borderColor: isDark ? "#2a3170" : "#e1e3ee",
									},
								]}
							>
								{ownShop ? (
									<MenuItem
										icon="storefront-outline"
										label={ownShop.name}
										sublabel={
											ownShop.status === "suspended"
												? t("account.shopSuspended")
												: t("account.myShop")
										}
										iconBg={isDark ? "#1d2568" : "#e3e7f8"}
										iconColor={primaryColor}
										rightElement={
											<LevelBadge badge={ownShop.badge} size="sm" />
										}
										onPress={() => router.push("/seller")}
										isDark={isDark}
										borderColor={borderColor}
									/>
								) : shopsEnabled ? (
									<MenuItem
										icon="storefront-outline"
										label={t("account.openShop")}
										sublabel={t("account.openShopSublabel")}
										iconBg={isDark ? "#3a2a00" : "#fff1c7"}
										iconColor="#9a6a00"
										onPress={() => router.push("/shop/create")}
										isDark={isDark}
										borderColor={borderColor}
									/>
								) : null}
								{isShopMember ? (
									<MenuItem
										icon="swap-horizontal"
										label={
											inSellerMode
												? t("sellerMode.switchToBuyer")
												: t("sellerMode.switchToSeller")
										}
										sublabel={
											inSellerMode
												? t("sellerMode.switchToBuyerSub")
												: t("sellerMode.switchToSellerSub")
										}
										iconBg={isDark ? "#1d2568" : "#e3e7f8"}
										iconColor={primaryColor}
										onPress={() =>
											switchAppMode(inSellerMode ? "buyer" : "seller")
										}
										isDark={isDark}
										borderColor={borderColor}
									/>
								) : null}
							</View>
						</View>
					)}

					{/* Mon activité */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionPurchases")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#2a3170" : "#e1e3ee",
								},
							]}
						>
							{ordersEnabled ? (
								<>
									<MenuItem
										icon="bag-handle-outline"
										label={t("account.myPurchases")}
										sublabel={t("account.myPurchasesSublabel")}
										{...entry("purchases")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="chatbubble-ellipses-outline"
										label={t("disputes.title")}
										sublabel={t("disputes.subtitle")}
										{...entry("disputes")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="return-down-back-outline"
										label={t("returns.title")}
										sublabel={t("returns.subtitle")}
										{...entry("returns")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="location-outline"
										label={t("addresses.title")}
										sublabel={t("addresses.menuSublabel")}
										{...entry("addresses")}
										isDark={isDark}
										borderColor={borderColor}
									/>
									<MenuItem
										icon="cart-outline"
										label={t("account.cart")}
										{...entry("cart")}
										isDark={isDark}
										borderColor={borderColor}
									/>
								</>
							) : null}
							{courierSpace ? (
								<MenuItem
									icon="bicycle-outline"
									label={t("shipmentPanel.courierSpace")}
									sublabel={t("shipmentPanel.courierSpaceSublabel")}
									onPress={() => router.push(courierSpace)}
									isDark={isDark}
									borderColor={borderColor}
								/>
							) : null}
							<MenuItem
								icon="heart-outline"
								label={t("account.favorites")}
								sublabel={t("account.favoritesSublabel")}
								{...entry("favorites")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="bookmark-outline"
								label={t("account.savedSearches")}
								{...entry("searches")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Mes annonces */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionListings")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#2a3170" : "#e1e3ee",
								},
							]}
						>
							<MenuItem
								icon="cube-outline"
								label={t("account.myListings")}
								sublabel={t("account.myListingsSublabel")}
								{...entry("listings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="rocket-outline"
								label={t("account.boostHistory")}
								{...entry("boosts")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Paramètres */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSettings")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#2a3170" : "#e1e3ee",
								},
							]}
						>
							<MenuItem
								icon="settings-outline"
								label={t("account.settings")}
								{...entry("settings")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.security")}
								{...entry("security")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="notifications-outline"
								label={t("account.notifications")}
								{...entry("notifications")}
								isDark={isDark}
								borderColor="transparent"
								rightElement={
									notificationReady ? <NotificationsUnreadBadge /> : undefined
								}
							/>
						</View>
					</View>

					{/* Assistance */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							{t("account.sectionSupport")}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#2a3170" : "#e1e3ee",
								},
							]}
						>
							<MenuItem
								icon="help-circle-outline"
								label={t("account.help")}
								{...entry("help")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label={t("account.safety")}
								{...entry("safety")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="mail-outline"
								label={t("account.contact")}
								{...entry("contact")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="document-text-outline"
								label={t("account.terms")}
								{...entry("terms")}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="lock-closed-outline"
								label={t("account.privacy")}
								{...entry("privacy")}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Déconnexion */}
					<View style={[styles.section, { marginBottom: 32 }]}>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#2a3170" : "#e1e3ee",
								},
							]}
						>
							<MenuItem
								icon="log-out-outline"
								label={t("account.logout")}
								onPress={handleLogout}
								danger
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	guestCard: { borderRadius: 22, padding: 20, gap: 10, overflow: "hidden" },
	guestTitle: {
		color: "#ffffff",
		fontFamily: Fonts.displayExtrabold,
		fontSize: 24,
		letterSpacing: -0.5,
	},
	guestPrompt: {
		color: "#e3e7f8",
		fontFamily: Fonts.body,
		fontSize: 14,
		lineHeight: 20,
		marginBottom: 4,
	},
	guestPerk: { flexDirection: "row", alignItems: "center", gap: 10 },
	guestPerkText: { color: "#eff1fb", fontFamily: Fonts.body, fontSize: 14 },
	guestActions: { flexDirection: "row", gap: 10, marginTop: 10 },
	guestPrimary: {
		flex: 1,
		height: 50,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	guestPrimaryText: {
		color: "#12163a",
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
	},
	guestSecondary: {
		flex: 1,
		height: 50,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.35)",
	},
	guestSecondaryText: {
		color: "#ffffff",
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
	},
	safe: { flex: 1 },

	/* ── No-user header ── */
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},
	accountIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	headerTitle: { fontSize: 24, fontFamily: Fonts.displayExtrabold },

	/* ── Profile header ── */
	profileHeader: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 24,
	},
	profileTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
	},
	avatarWrap: { position: "relative" },
	avatar: { width: 72, height: 72, borderRadius: 22 },
	avatarPlaceholder: {
		width: 72,
		height: 72,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: {
		fontSize: 28,
		fontFamily: Fonts.displayBold,
		color: "#fff",
	},
	verifiedBadge: {
		position: "absolute",
		bottom: -2,
		right: -2,
		backgroundColor: "#fff",
		borderRadius: 10,
	},
	userName: {
		fontSize: 22,
		lineHeight: 27,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		marginBottom: 3,
	},
	memberSince: { fontSize: 13, marginTop: 3, fontFamily: Fonts.body },
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 10,
		paddingHorizontal: 12,
		minHeight: 36,
	},
	editBtnText: { fontSize: 13, fontFamily: Fonts.bodySemibold },

	/* ── Content ── */
	content: {
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		paddingTop: 24,
		minHeight: 500,
	},
	section: { paddingHorizontal: 16, marginBottom: 20 },
	sectionLabel: {
		fontSize: 12,
		textTransform: "uppercase",
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 1,
		marginBottom: 8,
		marginLeft: 4,
	},
	sectionCard: {
		borderRadius: 14,
		overflow: "hidden",
		borderWidth: 1,
	},

	/* ── Menu item ── */
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 12,
		minHeight: 56,
		borderBottomWidth: StyleSheet.hairlineWidth,
		gap: 12,
	},
	iconBox: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	menuLabel: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	menuSublabel: { fontSize: 12, fontFamily: Fonts.body, marginTop: 2 },

	/* ── Register row ── */
	registerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	registerText: { fontSize: 14, fontFamily: Fonts.body },
	registerLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	notifBadge: {
		backgroundColor: "#d23a2e",
		borderRadius: 10,
		minWidth: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 5,
		marginRight: 4,
	},
	notifBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.displayExtrabold,
	},
});
