import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { ChoiceChips } from "@/src/components/checkout/ChoiceChips";
import { FormError } from "@/src/components/checkout/FormError";
import { FormButton } from "@/src/components/settings/FormButton";
import { FormField } from "@/src/components/settings/FormField";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useAlert } from "@/src/contexts/AlertContext";
import { useCloseScreen } from "@/src/contexts/DetailPaneContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

const SUBJECT_KEYS = [
	"subjectGeneral",
	"subjectTechnical",
	"subjectAbuse",
	"subjectPartnership",
	"subjectOther",
] as const;

type SubjectKey = (typeof SUBJECT_KEYS)[number];

const isSubjectKey = (value: unknown): value is SubjectKey =>
	typeof value === "string" &&
	(SUBJECT_KEYS as readonly string[]).includes(value);

/** Loose on purpose: the server has the last word; this catches typos. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { user } = useAuth();
	const { showError } = useAlert();
	const close = useCloseScreen("/(tabs)/account");
	const { t } = useTranslation();

	const [name, setName] = useState(user?.name ?? "");
	const [email, setEmail] = useState(user?.email ?? "");
	// Opened from Safety's "report abuse", the subject is already chosen.
	const params = useLocalSearchParams<{ subject?: string }>();
	const [subject, setSubject] = useState<SubjectKey>(
		isSubjectKey(params.subject) ? params.subject : "subjectGeneral",
	);
	const [message, setMessage] = useState("");
	const [sent, setSent] = useState(false);
	// Empty fields are said on the form, not in a sheet.
	const [missing, setMissing] = useState(false);

	const { mutate: sendMessage, isPending } = useMutation({
		mutationFn: () =>
			api.post("/api/public/contact", {
				name,
				email,
				subject: t(`contact.${subject}`),
				message,
			}),
		onSuccess: () => setSent(true),
		onError: (err: any) =>
			showError(t("contact.errorTitle"), resolveErrorMessage(err, t)),
	});

	const emailInvalid = email.trim() !== "" && !EMAIL_SHAPE.test(email.trim());
	const required = t("common.required");
	const nameError = missing && !name.trim() ? required : null;
	const emailError = missing
		? !email.trim()
			? required
			: emailInvalid
				? t("contact.emailInvalid", {
						defaultValue:
							"Indiquez un e-mail valide, par exemple nom@exemple.com",
					})
				: null
		: null;
	const messageError = missing && !message.trim() ? required : null;

	const submit = () => {
		if (!name.trim() || !email.trim() || !message.trim() || emailInvalid) {
			setMissing(true);
			return;
		}
		setMissing(false);
		sendMessage();
	};

	if (sent) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.background }]}
			>
				<SettingsHeader title={t("contact.title")} />
				<View style={[styles.done, centeredContent]}>
					<View style={[styles.doneTile, { backgroundColor: c.successTint }]}>
						<Ionicons name="checkmark" size={30} color={c.successText} />
					</View>
					<Text
						accessibilityRole="header"
						style={[styles.doneTitle, { color: c.foreground }]}
					>
						{t("contact.successTitle")}
					</Text>
					<Text style={[styles.doneBody, { color: c.body }]}>
						{t("contact.successReplyTo", {
							email: email.trim(),
							defaultValue: "Nous vous répondrons par e-mail à {{email}}.",
						})}
					</Text>
					<FormButton label={t("contact.backBtn")} onPress={close} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("contact.title")} />
			<KeyboardAwareScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				<FormField
					label={t("contact.nameLabel")}
					value={name}
					onChangeText={setName}
					placeholder={t("contact.namePlaceholder")}
					autoCapitalize="words"
					autoComplete="name"
					error={nameError}
				/>
				<FormField
					label={t("contact.emailLabel")}
					value={email}
					onChangeText={setEmail}
					placeholder={t("contact.emailPlaceholder")}
					keyboardType="email-address"
					autoCapitalize="none"
					autoComplete="email"
					error={emailError}
				/>
				<ChoiceChips
					label={t("contact.subjectLabel")}
					options={SUBJECT_KEYS.map((key) => ({
						key,
						label: t(`contact.${key}`),
					}))}
					value={subject}
					onChange={(key) => setSubject(key as SubjectKey)}
				/>
				<FormField
					label={t("contact.messageLabel")}
					value={message}
					onChangeText={setMessage}
					placeholder={t("contact.messagePlaceholder")}
					multiline
					error={messageError}
				/>
				<FormError
					message={
						nameError || emailError || messageError
							? t("contact.fillAllFields")
							: null
					}
				/>
				<FormButton
					label={t("contact.send")}
					onPress={submit}
					loading={isPending}
				/>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { padding: 16, paddingTop: 20, gap: 20, paddingBottom: 48 },
	done: { flex: 1, justifyContent: "center", padding: 24 },
	doneTile: {
		width: 64,
		height: 64,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	doneTitle: {
		fontSize: 30,
		lineHeight: 38,
		letterSpacing: -0.6,
		fontFamily: Fonts.displayExtrabold,
		marginTop: 20,
	},
	doneBody: {
		fontSize: 16,
		lineHeight: 24,
		fontFamily: Fonts.body,
		marginTop: 10,
		marginBottom: 28,
	},
});
