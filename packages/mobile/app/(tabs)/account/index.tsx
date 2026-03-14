import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ReviewStars } from "@/src/components/ReviewStars";
import { useAuth } from "@/src/lib/auth";

interface MenuItemProps {
	icon: string;
	label: string;
	onPress: () => void;
	danger?: boolean;
	isDark: boolean;
}

function MenuItem({ icon, label, onPress, danger, isDark }: MenuItemProps) {
	const textColor = danger ? "#dc2626" : isDark ? "#e2e8f0" : "#0f172a";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.menuItem,
				{
					borderBottomColor: borderColor,
					backgroundColor: pressed
						? isDark
							? "#162032"
							: "#f8fafc"
						: "transparent",
				},
			]}
		>
			<Text style={styles.menuIcon}>{icon}</Text>
			<Text style={[styles.menuLabel, { color: textColor }]}>{label}</Text>
			<Ionicons name="chevron-forward" size={16} color={mutedColor} />
		</Pressable>
	);
}

export default function AccountScreen() {
	const isDark = useColorScheme() === "dark";
	const { user, logout } = useAuth();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	if (!user) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
				<View style={[styles.header, { borderBottomColor: borderColor }]}>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						Mon Compte
					</Text>
				</View>
				<EmptyState
					emoji="👤"
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
			</SafeAreaView>
		);
	}

	const handleLogout = () => {
		Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
			{ text: "Annuler", style: "cancel" },
			{ text: "Déconnecter", style: "destructive", onPress: logout },
		]);
	};

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Profile Header */}
				<View
					style={[
						styles.profileHeader,
						{ backgroundColor: cardBg, borderBottomColor: borderColor },
					]}
				>
					<View style={styles.avatarRow}>
						{user.avatar?.url ? (
							<Image
								source={{ uri: user.avatar.url }}
								style={styles.avatar}
								contentFit="cover"
							/>
						) : (
							<View
								style={[
									styles.avatarPlaceholder,
									{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
								]}
							>
								<Text style={[styles.avatarLetter, { color: primaryColor }]}>
									{user.name?.[0]?.toUpperCase() ?? "?"}
								</Text>
							</View>
						)}
						<View style={styles.profileInfo}>
							<View style={styles.nameRow}>
								<Text style={[styles.userName, { color: textColor }]}>
									{user.name}
								</Text>
								{user.isVerified && <Text style={styles.verified}>✓</Text>}
							</View>
							<ReviewStars
								rating={user.averageRating ?? 0}
								showCount
								count={user.reviewCount}
							/>
							<Text style={[styles.memberSince, { color: mutedColor }]}>
								Membre depuis{" "}
								{new Date(user.createdAt).toLocaleDateString("fr-FR", {
									month: "long",
									year: "numeric",
								})}
							</Text>
						</View>
					</View>
					<Pressable
						onPress={() => router.push("/account/edit-profile")}
						style={[styles.editBtn, { borderColor }]}
					>
						<Ionicons name="pencil" size={14} color={primaryColor} />
						<Text style={[styles.editBtnText, { color: primaryColor }]}>
							Modifier
						</Text>
					</Pressable>
				</View>

				{/* Menu — Activité */}
				<View
					style={[
						styles.section,
						{ backgroundColor: cardBg, borderColor, marginTop: 16 },
					]}
				>
					<Text style={[styles.sectionTitle, { color: mutedColor }]}>
						MON ACTIVITÉ
					</Text>
					<MenuItem
						icon="📦"
						label="Mes annonces"
						onPress={() => router.push("/account/listings")}
						isDark={isDark}
					/>
					<MenuItem
						icon="❤️"
						label="Favoris"
						onPress={() => router.push("/account/favorites")}
						isDark={isDark}
					/>
					<MenuItem
						icon="🔖"
						label="Recherches sauvegardées"
						onPress={() => router.push("/account/searches")}
						isDark={isDark}
					/>
					<MenuItem
						icon="🚀"
						label="Historique des boosts"
						onPress={() => router.push("/account/boosts")}
						isDark={isDark}
					/>
				</View>

				{/* Menu — Paramètres */}
				<View
					style={[
						styles.section,
						{ backgroundColor: cardBg, borderColor, marginTop: 8 },
					]}
				>
					<Text style={[styles.sectionTitle, { color: mutedColor }]}>
						PARAMÈTRES
					</Text>
					<MenuItem
						icon="⚙️"
						label="Paramètres"
						onPress={() => router.push("/settings")}
						isDark={isDark}
					/>
					<MenuItem
						icon="🔔"
						label="Notifications"
						onPress={() => {}}
						isDark={isDark}
					/>
				</View>

				{/* Menu — Assistance */}
				<View
					style={[
						styles.section,
						{ backgroundColor: cardBg, borderColor, marginTop: 8 },
					]}
				>
					<Text style={[styles.sectionTitle, { color: mutedColor }]}>
						ASSISTANCE
					</Text>
					<MenuItem
						icon="❓"
						label="Aide & FAQ"
						onPress={() => router.push("/help")}
						isDark={isDark}
					/>
					<MenuItem
						icon="🛡️"
						label="Conseils de sécurité"
						onPress={() => router.push("/safety")}
						isDark={isDark}
					/>
					<MenuItem
						icon="📩"
						label="Nous contacter"
						onPress={() => router.push("/contact")}
						isDark={isDark}
					/>
					<MenuItem
						icon="📄"
						label="Conditions d'utilisation"
						onPress={() => router.push("/terms")}
						isDark={isDark}
					/>
					<MenuItem
						icon="🔒"
						label="Politique de confidentialité"
						onPress={() => router.push("/privacy")}
						isDark={isDark}
					/>
				</View>

				{/* Logout */}
				<View
					style={[
						styles.section,
						{
							backgroundColor: cardBg,
							borderColor,
							marginTop: 8,
							marginBottom: 24,
						},
					]}
				>
					<MenuItem
						icon="🚪"
						label="Se déconnecter"
						onPress={handleLogout}
						danger
						isDark={isDark}
					/>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 16,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 22, fontWeight: "800" },
	profileHeader: { padding: 16, borderBottomWidth: 1 },
	avatarRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
	avatar: { width: 72, height: 72, borderRadius: 36, marginRight: 14 },
	avatarPlaceholder: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 14,
	},
	avatarLetter: { fontSize: 28, fontWeight: "700" },
	profileInfo: { flex: 1 },
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 4,
	},
	userName: { fontSize: 18, fontWeight: "700" },
	verified: {
		backgroundColor: "#3b82f6",
		color: "#fff",
		borderRadius: 10,
		paddingHorizontal: 6,
		paddingVertical: 2,
		fontSize: 11,
		fontWeight: "700",
		overflow: "hidden",
	},
	memberSince: { fontSize: 12, marginTop: 2 },
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	editBtnText: { fontSize: 13, fontWeight: "600" },
	section: {
		borderRadius: 12,
		marginHorizontal: 16,
		overflow: "hidden",
		borderWidth: 1,
	},
	sectionTitle: {
		fontSize: 11,
		fontWeight: "700",
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 4,
		letterSpacing: 0.5,
	},
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	menuIcon: { fontSize: 20, width: 28, marginRight: 12 },
	menuLabel: { flex: 1, fontSize: 15 },
	registerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	registerText: { fontSize: 14 },
	registerLink: { fontSize: 14, fontWeight: "700" },
});
