import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

const SECTIONS = [
	{
		title: "1. Données collectées",
		body: "Nous collectons les informations que vous nous fournissez lors de votre inscription (nom, email, mot de passe haché), les annonces que vous publiez, vos messages, vos favoris et les données d'utilisation de l'application.",
	},
	{
		title: "2. Utilisation des données",
		body: "Vos données sont utilisées pour faire fonctionner le service, personnaliser votre expérience, vous envoyer des notifications pertinentes (nouvelles annonces, messages) et améliorer la plateforme.",
	},
	{
		title: "3. Partage des données",
		body: "Nous ne vendons jamais vos données personnelles. Certaines informations (nom, photo de profil, annonces, avis) sont visibles par les autres utilisateurs dans le cadre normal du service.",
	},
	{
		title: "4. Sécurité",
		body: "Nous utilisons des mesures de sécurité standard (HTTPS, chiffrement des mots de passe, tokens JWT) pour protéger vos données. Les tokens sont stockés dans un stockage sécurisé sur votre appareil.",
	},
	{
		title: "5. Vos droits",
		body: "Vous avez le droit d'accéder à vos données, de les corriger ou de les supprimer. Pour exercer ces droits, rendez-vous dans Paramètres ou contactez-nous via la section « Nous contacter ».",
	},
	{
		title: "6. Cookies et stockage local",
		body: "L'application mobile utilise un stockage local sécurisé (SecureStore) pour maintenir votre session. Aucun cookie tiers n'est utilisé à des fins publicitaires.",
	},
	{
		title: "7. Notifications push",
		body: "Si vous autorisez les notifications, votre token d'appareil est transmis à nos serveurs pour vous envoyer des alertes pertinentes. Vous pouvez désactiver ces notifications à tout moment dans les paramètres.",
	},
	{
		title: "8. Modifications de la politique",
		body: "Nous pouvons mettre à jour cette politique de confidentialité. Vous serez notifié des changements significatifs via l'application. L'utilisation continue du service vaut acceptation des modifications.",
	},
];

export default function PrivacyScreen() {
	const isDark = useColorScheme() === "dark";

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>
					Politique de confidentialité
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.scroll}>
				<Text style={[styles.updated, { color: mutedColor }]}>
					Dernière mise à jour : janvier 2025
				</Text>

				{SECTIONS.map((section, i) => (
					<View key={i} style={styles.section}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							{section.title}
						</Text>
						<Text style={[styles.paragraph, { color: mutedColor }]}>
							{section.body}
						</Text>
					</View>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	title: { fontSize: 15, fontWeight: "700" },
	scroll: { padding: 20, paddingBottom: 40 },
	updated: { fontSize: 12, marginBottom: 20, textAlign: "center" },
	section: { marginBottom: 20 },
	sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
	paragraph: { fontSize: 14, lineHeight: 22 },
});
