import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

export default function ContactScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user } = useAuth();
	const { showError } = useAlert();
	const { t } = useTranslation();

	const SUBJECTS = [
		t("contact.subjectGeneral"),
		t("contact.subjectTechnical"),
		t("contact.subjectAbuse"),
		t("contact.subjectPartnership"),
		t("contact.subjectOther"),
	];

	const [name, setName] = useState(user?.name ?? "");
	const [email, setEmail] = useState(user?.email ?? "");
	const [subject, setSubject] = useState(() => SUBJECTS[0]);
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
		onError: (err: any) =>
			showError(t("contact.errorTitle"), resolveErrorMessage(err, t)),
	});

	if (sent) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={styles.center}>
					<Ionicons
						name="checkmark-circle"
						size={64}
						color="#16a34a"
						style={{ marginBottom: 16 }}
					/>
					<Text style={[styles.title, { color: textColor }]}>
						{t("contact.successTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						{t("contact.successMessage")}
					</Text>
					<Pressable
						onPress={() => router.back()}
						style={[styles.btn, { backgroundColor: primaryColor }]}
					>
						<Text style={styles.btnText}>{t("contact.backBtn")}</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("contact.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>
			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				{[
					{
						label: t("contact.nameLabel"),
						value: name,
						set: setName,
						placeholder: t("contact.namePlaceholder"),
						type: "default",
					},
					{
						label: t("contact.emailLabel"),
						value: email,
						set: setEmail,
						placeholder: t("contact.emailPlaceholder"),
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
				<Text style={[styles.fieldLabel, { color: mutedColor }]}>
					{t("contact.subjectLabel")}
				</Text>
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
				<Text style={[styles.fieldLabel, { color: mutedColor }]}>
					{t("contact.messageLabel")}
				</Text>
				<TextInput
					value={message}
					onChangeText={setMessage}
					placeholder={t("contact.messagePlaceholder")}
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
							? showError(t("contact.errorTitle"), t("contact.fillAllFields"))
							: sendMessage()
					}
					disabled={isPending}
					style={[styles.btn, { backgroundColor: primaryColor }]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.btnText}>{t("contact.send")}</Text>
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
