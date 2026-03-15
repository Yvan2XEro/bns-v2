import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

const SECTIONS = [
	{
		title: "1. Acceptation des conditions",
		body: "En utilisant Buy'N'Sellem, vous acceptez les présentes conditions d'utilisation dans leur intégralité. Si vous n'acceptez pas ces conditions, veuillez cesser d'utiliser notre application.",
	},
	{
		title: "2. Description du service",
		body: "Buy'N'Sellem est une plateforme de petites annonces permettant aux utilisateurs d'acheter et vendre des articles entre particuliers au Cameroun et dans la sous-région.",
	},
	{
		title: "3. Contenu interdit",
		body: "Il est strictement interdit de publier des annonces pour des articles illégaux, des armes, des drogues, des articles contrefaits, du contenu offensant, trompeur ou à caractère sexuel.",
	},
	{
		title: "4. Responsabilité des utilisateurs",
		body: "Les utilisateurs sont entièrement responsables du contenu qu'ils publient et des transactions qu'ils effectuent. Buy'N'Sellem n'est pas partie prenante des échanges entre acheteurs et vendeurs.",
	},
	{
		title: "5. Modération des annonces",
		body: "Toute annonce est soumise à validation par notre équipe avant publication. Nous nous réservons le droit de refuser ou supprimer tout contenu non conforme à nos règles.",
	},
	{
		title: "6. Propriété intellectuelle",
		body: "Les photos et contenus publiés sur la plateforme restent la propriété de leurs auteurs. En les publiant, vous accordez à Buy'N'Sellem une licence d'affichage non exclusive.",
	},
	{
		title: "7. Protection des données",
		body: "Vos données personnelles sont traitées conformément à notre Politique de confidentialité. Nous ne vendons jamais vos données à des tiers.",
	},
	{
		title: "8. Suspension de compte",
		body: "Nous nous réservons le droit de suspendre ou supprimer définitivement tout compte qui viole les présentes conditions ou qui adopte un comportement frauduleux.",
	},
	{
		title: "9. Modification des conditions",
		body: "Buy'N'Sellem se réserve le droit de modifier ces conditions à tout moment. Les utilisateurs seront notifiés des changements importants via l'application.",
	},
];

export default function TermsScreen() {
	const isDark = useColorScheme() === "dark";

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const _cardBg = isDark ? "#1e293b" : "#ffffff";
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
					Conditions d'utilisation
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
	title: { fontSize: 17, fontWeight: "700" },
	scroll: { padding: 20, paddingBottom: 40 },
	updated: { fontSize: 12, marginBottom: 20, textAlign: "center" },
	section: { marginBottom: 20 },
	sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
	paragraph: { fontSize: 14, lineHeight: 22 },
});
