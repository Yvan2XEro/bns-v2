import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const SUBJECTS = [
	"Question générale",
	"Problème technique",
	"Signaler un abus",
	"Demande de partenariat",
	"Autre",
];

export default function ContactScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const [name, setName] = useState(user?.name ?? "");
	const [email, setEmail] = useState(user?.email ?? "");
	const [subject, setSubject] = useState(SUBJECTS[0]);
	const [message, setMessage] = useState("");
	const [sent, setSent] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { mutate: sendMessage, isPending } = useMutation({
		mutationFn: () =>
			api.post("/api/public/contact", { name, email, subject, message }),
		onSuccess: () => setSent(true),
		onError: (err: any) => Alert.alert("Erreur", err.message),
	});

	if (sent) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
				<View style={styles.center}>
					<Text style={{ fontSize: 64 }}>✅</Text>
					<Text style={[styles.title, { color: textColor }]}>
						Message envoyé !
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						Nous vous répondrons dans les plus brefs délais.
					</Text>
					<Pressable
						onPress={() => router.back()}
						style={[styles.btn, { backgroundColor: primaryColor }]}
					>
						<Text style={styles.btnText}>Retour</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Nous contacter
				</Text>
				<View style={{ width: 40 }} />
			</View>
			<ScrollView contentContainerStyle={styles.scroll}>
				{[
					{
						label: "Nom",
						value: name,
						set: setName,
						placeholder: "Votre nom",
						type: "default",
					},
					{
						label: "Email",
						value: email,
						set: setEmail,
						placeholder: "votre@email.com",
						type: "email-address",
					},
				].map(({ label, value, set, placeholder, type }) => (
					<View key={label}>
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{label}
						</Text>
						<TextInput
							value={value}
							onChangeText={set}
							placeholder={placeholder}
							placeholderTextColor={mutedColor}
							style={[
								styles.field,
								{ backgroundColor: cardBg, borderColor, color: textColor },
							]}
							keyboardType={type as any}
							autoCapitalize={type === "email-address" ? "none" : "words"}
						/>
					</View>
				))}
				<Text style={[styles.fieldLabel, { color: mutedColor }]}>Sujet</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.subjectRow}
				>
					{SUBJECTS.map((s) => (
						<Pressable
							key={s}
							onPress={() => setSubject(s)}
							style={[
								styles.subjectPill,
								{
									backgroundColor: subject === s ? primaryColor : cardBg,
									borderColor: subject === s ? primaryColor : borderColor,
								},
							]}
						>
							<Text
								style={[
									styles.subjectText,
									{ color: subject === s ? "#fff" : mutedColor },
								]}
							>
								{s}
							</Text>
						</Pressable>
					))}
				</ScrollView>
				<Text style={[styles.fieldLabel, { color: mutedColor }]}>Message</Text>
				<TextInput
					value={message}
					onChangeText={setMessage}
					placeholder="Votre message..."
					placeholderTextColor={mutedColor}
					style={[
						styles.textarea,
						{ backgroundColor: cardBg, borderColor, color: textColor },
					]}
					multiline
					numberOfLines={6}
				/>
				<Pressable
					onPress={() =>
						!name || !email || !message
							? Alert.alert("Erreur", "Veuillez remplir tous les champs")
							: sendMessage()
					}
					disabled={isPending}
					style={[styles.btn, { backgroundColor: primaryColor }]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.btnText}>Envoyer le message</Text>
					)}
				</Pressable>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "700",
		textAlign: "center",
	},
	scroll: { padding: 20, gap: 12, paddingBottom: 40 },
	fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
	field: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
	},
	textarea: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		minHeight: 120,
		textAlignVertical: "top",
	},
	subjectRow: { gap: 8, paddingBottom: 4 },
	subjectPill: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	subjectText: { fontSize: 13, fontWeight: "500" },
	btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
	title: {
		fontSize: 22,
		fontWeight: "800",
		marginBottom: 8,
		textAlign: "center",
	},
	subtitle: { fontSize: 14, textAlign: "center", marginBottom: 24 },
});
