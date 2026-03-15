import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { EmptyState } from "@/src/components/EmptyState";
import { ReviewStars } from "@/src/components/ReviewStars";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAuth } from "@/src/lib/auth";

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
}: MenuItemProps) {
	const textColor = danger ? "#dc2626" : isDark ? "#e2e8f0" : "#0f172a";
	const resolvedIconColor = danger
		? "#dc2626"
		: (iconColor ?? (isDark ? "#94a3b8" : "#64748b"));
	const resolvedIconBg = danger
		? isDark
			? "#3b1111"
			: "#fee2e2"
		: (iconBg ?? (isDark ? "#1e293b" : "#f1f5f9"));

	return (
		<AnimatedPressable
			onPress={onPress}
			scaleTo={0.98}
			style={[styles.menuItem, { borderBottomColor: borderColor }]}
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
							{ color: isDark ? "#64748b" : "#94a3b8" },
						]}
					>
						{sublabel}
					</Text>
				)}
			</View>
			<Ionicons
				name="chevron-forward"
				size={16}
				color={isDark ? "#334155" : "#cbd5e1"}
			/>
		</AnimatedPressable>
	);
}

export default function AccountScreen() {
	const isDark = useColorScheme() === "dark";
	const { user, logout } = useAuth();
	const { showConfirm } = useAlert();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e293b" : "#f1f5f9";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.accountIconWrap,
							{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
						]}
					>
						<Ionicons name="person" size={22} color={primaryColor} />
					</View>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						Mon Compte
					</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<EmptyState
						icon="person-outline"
						title="Connectez-vous"
						subtitle="Accédez à votre compte, vos annonces et messages"
						ctaLabel="Se connecter"
						onCta={() => router.push("/auth/login")}
					/>
					<View style={styles.registerRow}>
						<Text style={[styles.registerText, { color: mutedColor }]}>
							Pas de compte ?{" "}
						</Text>
						<Pressable onPress={() => router.push("/auth/register")}>
							<Text style={[styles.registerLink, { color: primaryColor }]}>
								Créer un compte
							</Text>
						</Pressable>
					</View>
				</View>
			</SafeAreaView>
		);
	}

	const handleLogout = () => {
		showConfirm(
			"Déconnexion",
			"Êtes-vous sûr de vouloir vous déconnecter ?",
			logout,
		);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			<ScrollView showsVerticalScrollIndicator={false}>
				{/* ── Header (accent bg) ── */}
				<View style={[styles.profileHeader, { backgroundColor: accentBg }]}>
					<View style={styles.profileTopRow}>
						{/* Avatar */}
						<View style={styles.avatarWrap}>
							{user.avatar?.url ? (
								<Image
									source={{ uri: user.avatar?.url }}
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
							{user.verified && (
								<View style={styles.verifiedBadge}>
									<Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
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
							<ReviewStars
								rating={user.rating ?? 0}
								showCount
								count={user.totalReviews}
							/>
							<Text style={[styles.memberSince, { color: mutedColor }]}>
								Membre depuis{" "}
								{new Date(user.createdAt).toLocaleDateString("fr-FR", {
									month: "long",
									year: "numeric",
								})}
							</Text>
						</View>

						<AnimatedPressable
							onPress={() => router.push("/account/edit-profile")}
							scaleTo={0.95}
							style={[styles.editBtn, { backgroundColor: cardBg }]}
						>
							<Ionicons name="pencil" size={14} color={primaryColor} />
							<Text style={[styles.editBtnText, { color: primaryColor }]}>
								Modifier
							</Text>
						</AnimatedPressable>
					</View>
				</View>

				{/* ── Content (main bg, rounded top) ── */}
				<View style={[styles.content, { backgroundColor: bg }]}>
					{/* Mon activité */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							MON ACTIVITÉ
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="cube-outline"
								label="Mes annonces"
								sublabel="Vos annonces publiées"
								onPress={() => router.push("/account/listings")}
								iconBg={isDark ? "#1e3a5f" : "#dbeafe"}
								iconColor={isDark ? "#60a5fa" : "#2563eb"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="heart-outline"
								label="Favoris"
								sublabel="Annonces sauvegardées"
								onPress={() => router.push("/account/favorites")}
								iconBg={isDark ? "#4a1942" : "#fce7f3"}
								iconColor={isDark ? "#f9a8d4" : "#db2777"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="bookmark-outline"
								label="Recherches sauvegardées"
								onPress={() => router.push("/account/searches")}
								iconBg={isDark ? "#3b1f6e" : "#ede9fe"}
								iconColor={isDark ? "#c4b5fd" : "#7c3aed"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="rocket-outline"
								label="Historique des boosts"
								onPress={() => router.push("/account/boosts")}
								iconBg={isDark ? "#422006" : "#fef3c7"}
								iconColor={isDark ? "#fde68a" : "#d97706"}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Paramètres */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							PARAMÈTRES
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="settings-outline"
								label="Paramètres"
								onPress={() => router.push("/settings")}
								iconBg={isDark ? "#1e293b" : "#f1f5f9"}
								iconColor={isDark ? "#94a3b8" : "#475569"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="notifications-outline"
								label="Notifications"
								onPress={() => {}}
								iconBg={isDark ? "#082f49" : "#e0f2fe"}
								iconColor={isDark ? "#7dd3fc" : "#0284c7"}
								isDark={isDark}
								borderColor="transparent"
							/>
						</View>
					</View>

					{/* Assistance */}
					<View style={styles.section}>
						<Text style={[styles.sectionLabel, { color: mutedColor }]}>
							ASSISTANCE
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: cardBg,
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="help-circle-outline"
								label="Aide & FAQ"
								onPress={() => router.push("/help")}
								iconBg={isDark ? "#14532d" : "#dcfce7"}
								iconColor={isDark ? "#86efac" : "#15803d"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="shield-checkmark-outline"
								label="Conseils de sécurité"
								onPress={() => router.push("/safety")}
								iconBg={isDark ? "#1e3a5f" : "#dbeafe"}
								iconColor={isDark ? "#60a5fa" : "#1d4ed8"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="mail-outline"
								label="Nous contacter"
								onPress={() => router.push("/contact")}
								iconBg={isDark ? "#3b1f6e" : "#ede9fe"}
								iconColor={isDark ? "#c4b5fd" : "#7c3aed"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="document-text-outline"
								label="Conditions d'utilisation"
								onPress={() => router.push("/terms")}
								iconBg={isDark ? "#1e293b" : "#f1f5f9"}
								iconColor={isDark ? "#94a3b8" : "#475569"}
								isDark={isDark}
								borderColor={borderColor}
							/>
							<MenuItem
								icon="lock-closed-outline"
								label="Politique de confidentialité"
								onPress={() => router.push("/privacy")}
								iconBg={isDark ? "#1e293b" : "#f1f5f9"}
								iconColor={isDark ? "#94a3b8" : "#475569"}
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
									borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
								},
							]}
						>
							<MenuItem
								icon="log-out-outline"
								label="Se déconnecter"
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
	userName: { fontSize: 18, fontFamily: Fonts.displayBold, marginBottom: 3 },
	memberSince: { fontSize: 12, marginTop: 3, fontFamily: Fonts.body },
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 7,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 2,
	},
	editBtnText: { fontSize: 12, fontFamily: Fonts.bodySemibold },

	/* ── Content ── */
	content: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingTop: 20,
		minHeight: 500,
	},
	section: { paddingHorizontal: 16, marginBottom: 12 },
	sectionLabel: {
		fontSize: 11,
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
		paddingVertical: 13,
		borderBottomWidth: 1,
		gap: 12,
	},
	iconBox: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	menuLabel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	menuSublabel: { fontSize: 11, fontFamily: Fonts.body, marginTop: 1 },

	/* ── Register row ── */
	registerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	registerText: { fontSize: 14, fontFamily: Fonts.body },
	registerLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
