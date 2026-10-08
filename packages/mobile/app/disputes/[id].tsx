import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlashList } from "@shopify/flash-list";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useForm } from "react-hook-form";
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
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
	useDispute,
	useDisputeAction,
	useUploadDisputeEvidence,
} from "@/src/hooks/useDisputes";
import {
	DISPUTE_ACTION_LABELS,
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { disputeEvidenceStatus } from "@/src/lib/disputeEvidence";
import { useTranslation } from "@/src/lib/i18n";

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
type MessageForm = z.infer<typeof messageSchema>;
const buttons = [
	"submit",
	"withdraw",
	"escalate",
	"respond_accept",
	"proposal_accept",
	"proposal_reject",
] as const;

export default function DisputeThreadScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { t, i18n } = useTranslation();
	const dark = useColorScheme() === "dark";
	const view = useDispute(id);
	const action = useDisputeAction(id ?? "");
	const upload = useUploadDisputeEvidence(id ?? "");
	const form = useForm<MessageForm>({
		resolver: zodResolver(messageSchema),
		defaultValues: { body: "" },
	});
	const colors = {
		bg: dark ? "#0b1120" : "#f8fafc",
		card: dark ? "#111c2e" : "#fff",
		text: dark ? "#e2e8f0" : "#0f172a",
		muted: dark ? "#94a3b8" : "#64748b",
		border: dark ? "#1e3a5f" : "#e2e8f0",
		primary: dark ? "#a78bfa" : "#6d28d9",
	};

	if (view.isPending)
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
				<ActivityIndicator style={styles.loading} color={colors.primary} />
			</SafeAreaView>
		);
	if (view.isError || !view.data)
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
				<Text style={[styles.error, { color: colors.text }]}>
					{t("disputes.detailLoadError")}
				</Text>
				<Pressable onPress={() => void view.refetch()}>
					<Text style={{ color: colors.primary, textAlign: "center" }}>
						{t("common.retry")}
					</Text>
				</Pressable>
			</SafeAreaView>
		);
	const dispute = view.data;
	const evidenceStatus = disputeEvidenceStatus(
		dispute.reason,
		dispute.evidence.filter(
			(item) => item.uploadedByType === dispute.openedByType,
		).length,
	);
	const locale = i18n.language === "en" ? "en" : "fr";
	const perform = async (name: (typeof buttons)[number]) => {
		const body =
			name === "respond_accept"
				? { action: "accept" }
				: name === "proposal_accept" || name === "proposal_reject"
					? { action: name === "proposal_accept" ? "accept" : "reject" }
					: undefined;
		await action.mutateAsync({ action: name, body });
	};
	const addEvidence = async () => {
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (permission.status !== "granted") return;
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.85,
		});
		const asset = result.canceled ? null : result.assets[0];
		if (!asset) return;
		await upload.mutateAsync({
			uri: asset.uri,
			fileName: asset.fileName ?? null,
			mimeType: asset.mimeType ?? null,
		});
	};
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: colors.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: colors.border }]}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
					onPress={() => router.back()}
					hitSlop={12}
				>
					<Ionicons name="arrow-back" size={22} color={colors.text} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: colors.text }]}>
					{dispute.number}
				</Text>
				<View style={styles.iconSpace} />
			</View>
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				<View
					style={[
						styles.card,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
				>
					<Text style={[styles.title, { color: colors.text }]}>
						{t(DISPUTE_STATUS_LABELS[dispute.status])}
					</Text>
					<Text style={[styles.body, { color: colors.muted }]}>
						{t("disputes.order", { number: dispute.orderNumber })} ·{" "}
						{t(DISPUTE_REASON_LABELS[dispute.reason])}
					</Text>
					<Text style={[styles.amount, { color: colors.text }]}>
						{t("disputes.amount", {
							amount: dispute.amountAtStake.toLocaleString(locale),
						})}
					</Text>
				</View>
				{dispute.resolution ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("disputes.resolution")}
						</Text>
						<Text style={[styles.body, { color: colors.muted }]}>
							{dispute.resolution.publicStatement[locale]}
						</Text>
						<Text style={[styles.amount, { color: colors.text }]}>
							{t("disputes.refund", {
								amount: dispute.resolution.refundAmount.toLocaleString(locale),
							})}
						</Text>
					</View>
				) : null}
				{dispute.allowedActions.includes("upload_evidence") ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("disputes.evidenceTitle")}
						</Text>
						<Text style={[styles.body, { color: colors.muted }]}>
							{t("disputes.evidenceProgress", {
								count: evidenceStatus.required - evidenceStatus.remaining,
								required: evidenceStatus.required,
							})}
						</Text>
						{dispute.evidence.map((item) => (
							<Text
								key={item.id}
								style={[styles.body, { color: colors.muted }]}
							>
								{t("disputes.evidenceFile", {
									kind: item.kind,
									size: Math.ceil(item.size / 1024),
								})}
							</Text>
						))}
						<Pressable
							accessibilityRole="button"
							disabled={upload.isPending || dispute.evidence.length >= 10}
							onPress={() => void addEvidence()}
							style={[styles.button, { borderColor: colors.border }]}
						>
							<Text style={[styles.actionText, { color: colors.primary }]}>
								{upload.isPending
									? t("common.loading")
									: t("disputes.addEvidence")}
							</Text>
						</Pressable>
						{evidenceStatus.remaining > 0 ? (
							<Text style={[styles.body, { color: colors.muted }]}>
								{t("disputes.evidenceNeeded", {
									count: evidenceStatus.remaining,
								})}
							</Text>
						) : null}
					</View>
				) : null}
				<View
					style={[
						styles.card,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
				>
					<Text style={[styles.title, { color: colors.text }]}>
						{t("disputes.messages")}
					</Text>
					{dispute.messages.length ? (
						<FlashList
							data={dispute.messages}
							keyExtractor={(message) => message.id}
							scrollEnabled={false}
							renderItem={({ item }) => (
								<View style={[styles.message, { backgroundColor: colors.bg }]}>
									<Text style={[styles.body, { color: colors.text }]}>
										{item.redacted ? t("disputes.redacted") : item.body}
									</Text>
									<Text style={[styles.date, { color: colors.muted }]}>
										{new Date(item.at).toLocaleString(locale)}
									</Text>
								</View>
							)}
						/>
					) : (
						<Text style={[styles.body, { color: colors.muted }]}>
							{t("disputes.noMessages")}
						</Text>
					)}
					{dispute.allowedActions.includes("message") ? (
						<View style={styles.form}>
							<Text style={[styles.label, { color: colors.text }]}>
								{t("disputes.messageLabel")}
							</Text>
							<TextInput
								accessibilityLabel={t("disputes.messageLabel")}
								multiline
								maxLength={2000}
								value={form.watch("body")}
								onChangeText={(value) =>
									form.setValue("body", value, { shouldValidate: true })
								}
								style={[
									styles.input,
									{ color: colors.text, borderColor: colors.border },
								]}
							/>
							<Pressable
								accessibilityRole="button"
								disabled={action.isPending}
								onPress={form.handleSubmit(async (values) => {
									await action.mutateAsync({ action: "message", body: values });
									form.reset();
								})}
								style={[styles.button, { backgroundColor: colors.primary }]}
							>
								<Text style={styles.buttonText}>
									{t("disputes.sendMessage")}
								</Text>
							</Pressable>
						</View>
					) : null}
				</View>
				{dispute.proposal?.status === "open" ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("disputes.proposal")}
						</Text>
						<Text style={[styles.body, { color: colors.muted }]}>
							{t("disputes.refund", {
								amount: dispute.proposal.amount.toLocaleString(locale),
							})}
						</Text>
					</View>
				) : null}
				{buttons.some((name) => dispute.allowedActions.includes(name)) ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("disputes.actions")}
						</Text>
						{buttons
							.filter((name) => dispute.allowedActions.includes(name))
							.map((name) => (
								<Pressable
									key={name}
									accessibilityRole="button"
									disabled={
										action.isPending ||
										(name === "submit" && !evidenceStatus.canSubmit)
									}
									onPress={() => void perform(name)}
									style={[styles.button, { borderColor: colors.border }]}
								>
									<Text style={[styles.actionText, { color: colors.primary }]}>
										{t(DISPUTE_ACTION_LABELS[name])}
									</Text>
								</Pressable>
							))}
					</View>
				) : null}
				{action.isError ? (
					<Text accessibilityRole="alert" style={styles.error}>
						{t("disputes.actionError")}
					</Text>
				) : null}
				{upload.isError ? (
					<Text accessibilityRole="alert" style={styles.error}>
						{t("disputes.actionError")}
					</Text>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	loading: { marginTop: 48 },
	header: {
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 16,
		paddingHorizontal: 18,
		paddingVertical: 14,
	},
	headerTitle: { flex: 1, fontFamily: Fonts.displaySemibold, fontSize: 19 },
	iconSpace: { width: 22 },
	content: { gap: 14, padding: 16 },
	card: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 17 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21 },
	amount: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	message: { borderRadius: 12, gap: 6, marginTop: 10, padding: 12 },
	date: { fontFamily: Fonts.body, fontSize: 11 },
	form: { gap: 9, marginTop: 14 },
	label: { fontFamily: Fonts.bodyMedium, fontSize: 13 },
	input: {
		borderRadius: 10,
		borderWidth: 1,
		minHeight: 92,
		padding: 12,
		textAlignVertical: "top",
	},
	button: {
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1,
		justifyContent: "center",
		marginTop: 8,
		minHeight: 46,
		paddingHorizontal: 14,
	},
	buttonText: { color: "#fff", fontFamily: Fonts.bodySemibold, fontSize: 14 },
	actionText: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	error: {
		color: "#dc2626",
		fontFamily: Fonts.bodyMedium,
		margin: 16,
		textAlign: "center",
	},
});
