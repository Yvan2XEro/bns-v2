import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const FAQS = [
	{
		q: "Comment publier une annonce ?",
		a: "Appuyez sur le bouton « Vendre » en bas de l'écran, remplissez le formulaire en 5 étapes et publiez votre annonce. Elle sera visible après validation par notre équipe (sous 24h).",
	},
	{
		q: "Comment contacter un vendeur ?",
		a: "Depuis la page de l'annonce, appuyez sur « Contacter le vendeur » pour envoyer un message directement.",
	},
	{
		q: "Comment fonctionne le boost ?",
		a: "Le boost met votre annonce en avant dans les résultats de recherche et sur la page d'accueil. Choisissez une durée (1 sem, 2 sem, 1 mois) et payez via NotchPay.",
	},
	{
		q: "Mon annonce n'est pas visible, pourquoi ?",
		a: "Les annonces doivent être validées par notre équipe avant d'être publiées. Cela peut prendre jusqu'à 24h. Vérifiez votre statut dans « Mes annonces ».",
	},
	{
		q: "Comment signaler une annonce suspecte ?",
		a: "Depuis la page de l'annonce, faites défiler jusqu'en bas et appuyez sur « Signaler cette annonce ». Choisissez une raison et confirmez.",
	},
	{
		q: "Comment sauvegarder une recherche ?",
		a: "Sur la page Recherche, appuyez sur le bouton « Sauvegarder » en bas de l'écran pour enregistrer vos critères et recevoir des alertes.",
	},
	{
		q: "Comment supprimer mon compte ?",
		a: "Allez dans Compte → Paramètres → Zone dangereuse → Supprimer mon compte. Cette action est irréversible.",
	},
];

export default function HelpScreen() {
	const isDark = useColorScheme() === "dark";
	const [expanded, setExpanded] = useState<number | null>(null);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
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
				<Text style={[styles.title, { color: textColor }]}>Aide & FAQ</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Hero icon */}
				<View
					style={[
						styles.heroWrap,
						{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9", borderColor },
					]}
				>
					<Ionicons name="help-circle-outline" size={48} color={primaryColor} />
				</View>
				<Text style={[styles.heading, { color: textColor }]}>
					Questions fréquentes
				</Text>

				{FAQS.map((faq, i) => (
					<Pressable
						key={i}
						onPress={() => setExpanded(expanded === i ? null : i)}
						style={[styles.faqItem, { backgroundColor: cardBg, borderColor }]}
					>
						<View style={styles.faqHeader}>
							<Text style={[styles.faqQ, { color: textColor }]}>{faq.q}</Text>
							<Ionicons
								name={expanded === i ? "chevron-up" : "chevron-down"}
								size={18}
								color={mutedColor}
							/>
						</View>
						{expanded === i && (
							<Text style={[styles.faqA, { color: mutedColor }]}>{faq.a}</Text>
						)}
					</Pressable>
				))}

				<Pressable
					onPress={() => router.push("/contact")}
					style={[
						styles.contactBtn,
						{
							backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
							borderColor: primaryColor,
						},
					]}
				>
					<Ionicons
						name="chatbubble-ellipses-outline"
						size={18}
						color={primaryColor}
					/>
					<Text style={[styles.contactText, { color: primaryColor }]}>
						Contacter le support
					</Text>
				</Pressable>
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
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	scroll: { padding: 20, gap: 10, paddingBottom: 40 },
	heroWrap: {
		width: 80,
		height: 80,
		borderRadius: 40,
		alignSelf: "center",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 12,
		borderWidth: 1,
	},
	heading: {
		fontSize: 20,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginBottom: 8,
	},
	faqItem: { borderRadius: 12, borderWidth: 1, padding: 14 },
	faqHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 10,
	},
	faqQ: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 20,
	},
	faqA: { fontSize: 13, lineHeight: 20, marginTop: 10, fontFamily: Fonts.body },
	contactBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingVertical: 14,
		marginTop: 8,
	},
	contactText: { fontSize: 15, fontFamily: Fonts.displayBold },
});
