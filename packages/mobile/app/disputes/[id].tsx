import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { type ShopPalette, useShopTheme } from "@/src/components/shop/theme";
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
import {
	type DisputeTone,
	disputeDeadline,
	disputeTone,
	messageAuthor,
} from "@/src/lib/disputeThread";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";

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
	const c = useShopTheme();
	const view = useDispute(id);
	const action = useDisputeAction(id ?? "");
	const upload = useUploadDisputeEvidence(id ?? "");
	const form = useForm<MessageForm>({
		resolver: zodResolver(messageSchema),
		defaultValues: { body: "" },
	});

	if (view.isPending)
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<ActivityIndicator style={styles.loading} color={c.primary} />
			</SafeAreaView>
		);
	if (view.isError || !view.data)
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<Text style={[styles.error, { color: c.text }]}>
					{t("disputes.detailLoadError")}
				</Text>
				<Pressable onPress={() => void view.refetch()}>
					<Text style={{ color: c.primary, textAlign: "center" }}>
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
	const tone = toneColors(c, disputeTone(dispute.status));
	const deadline = disputeDeadline(dispute);
	const canMessage = dispute.allowedActions.includes("message");
	const canUpload = dispute.allowedActions.includes("upload_evidence");
	const time = (at: string) =>
		new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(at));
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
	const send = form.handleSubmit(async (values) => {
		await action.mutateAsync({ action: "message", body: values });
		form.reset();
	});
	const visibleButtons = buttons.filter((name) =>
		dispute.allowedActions.includes(name),
	);

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("disputes.threadTitle", { number: dispute.number })}
				subtitle={`${t(DISPUTE_REASON_LABELS[dispute.reason])} · ${t("disputes.order", { number: dispute.orderNumber })}`}
				onBack={() => router.back()}
			/>
			<KeyboardAvoidingView behavior="padding" style={styles.safe}>
				<ScrollView
					contentContainerStyle={styles.content}
					keyboardShouldPersistTaps="handled"
				>
					<View
						style={[
							styles.banner,
							{ backgroundColor: tone.soft, borderColor: tone.border },
						]}
					>
						<View style={styles.bannerRow}>
							<View
								style={[styles.bannerIcon, { backgroundColor: tone.strong }]}
							>
								<Ionicons name={tone.icon} size={20} color="#fff" />
							</View>
							<View style={styles.flex}>
								<Text style={[styles.bannerTitle, { color: tone.text }]}>
									{t(DISPUTE_STATUS_LABELS[dispute.status])}
								</Text>
								{deadline ? (
									<Text style={[styles.bannerBody, { color: tone.text }]}>
										{t("disputes.deadline", {
											date: formatOrderDate(deadline, locale),
										})}
									</Text>
								) : null}
								<Text style={[styles.bannerBody, { color: tone.text }]}>
									{t("disputes.amount", {
										amount: dispute.amountAtStake.toLocaleString(locale),
									})}
								</Text>
							</View>
						</View>
						{canUpload ? (
							<View style={styles.evidence}>
								<Pressable
									accessibilityRole="button"
									disabled={upload.isPending || dispute.evidence.length >= 10}
									onPress={() => void addEvidence()}
									style={[
										styles.chipButton,
										{ backgroundColor: c.card, borderColor: c.border },
									]}
								>
									{upload.isPending ? (
										<ActivityIndicator color={c.primary} />
									) : (
										<>
											<Ionicons name="attach" size={16} color={c.text} />
											<Text style={[styles.chipText, { color: c.text }]}>
												{t("disputes.addEvidence")}
											</Text>
										</>
									)}
								</Pressable>
								{dispute.viewerRole === dispute.openedByType ? (
									<Text style={[styles.evidenceText, { color: tone.text }]}>
										{evidenceStatus.remaining > 0
											? t("disputes.evidenceNeeded", {
													count: evidenceStatus.remaining,
												})
											: t("disputes.evidenceProgress", {
													count:
														evidenceStatus.required - evidenceStatus.remaining,
													required: evidenceStatus.required,
												})}
									</Text>
								) : null}
							</View>
						) : null}
					</View>

					{dispute.resolution ? (
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.resolution")}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{dispute.resolution.publicStatement[locale]}
							</Text>
							<Text style={[styles.amount, { color: c.text }]}>
								{t("disputes.refund", {
									amount:
										dispute.resolution.refundAmount.toLocaleString(locale),
								})}
							</Text>
						</View>
					) : null}

					{dispute.proposal?.status === "open" ? (
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.primary },
							]}
						>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.proposal")}
							</Text>
							<Text style={[styles.amount, { color: c.text }]}>
								{formatXaf(dispute.proposal.amount, locale)}
							</Text>
						</View>
					) : null}

					{dispute.messages.length ? (
						dispute.messages.map((message) => {
							const author = messageAuthor(
								message.authorType,
								dispute.viewerRole,
							);
							const text = message.redacted
								? t("disputes.redacted")
								: message.body;
							if (author === "self")
								return (
									<View key={message.id} style={styles.mineWrap}>
										<View
											style={[
												styles.bubble,
												styles.mine,
												{ backgroundColor: c.primary },
											]}
										>
											<Text style={[styles.body, { color: "#fff" }]}>
												{text}
											</Text>
										</View>
										<Text style={[styles.time, { color: c.muted }]}>
											{time(message.at)}
										</Text>
									</View>
								);
							const name =
								author === "shop"
									? dispute.shopName
									: author === "buyer"
										? t("disputes.authorBuyer")
										: t("disputes.authorStaff");
							return (
								<View key={message.id} style={styles.theirsRow}>
									{author === "staff" ? (
										<View
											style={[styles.avatar, { backgroundColor: c.primary }]}
										>
											<Ionicons
												name="shield-checkmark"
												size={16}
												color="#fff"
											/>
										</View>
									) : (
										<ShopAvatar name={name} size={32} radius={10} />
									)}
									<View style={styles.theirs}>
										<View style={styles.authorRow}>
											<Text style={[styles.author, { color: c.text }]}>
												{name}
											</Text>
											{author === "staff" ? (
												<View
													style={[
														styles.badge,
														{ backgroundColor: c.primarySoft },
													]}
												>
													<Text
														style={[styles.badgeText, { color: c.primary }]}
													>
														{t("disputes.staffBadge")}
													</Text>
												</View>
											) : null}
										</View>
										<View
											style={[
												styles.bubble,
												styles.theirBubble,
												author === "staff"
													? {
															backgroundColor: c.primarySoft,
															borderColor: c.primarySoft,
														}
													: { backgroundColor: c.card, borderColor: c.border },
											]}
										>
											<Text style={[styles.body, { color: c.text }]}>
												{text}
											</Text>
										</View>
										<Text style={[styles.time, { color: c.muted }]}>
											{time(message.at)}
										</Text>
									</View>
								</View>
							);
						})
					) : (
						<Text style={[styles.empty, { color: c.muted }]}>
							{t("disputes.noMessages")}
						</Text>
					)}

					{visibleButtons.length ? (
						<View style={styles.actions}>
							{visibleButtons.map((name) => {
								const primary = name === "submit" || name.endsWith("accept");
								const danger =
									name === "withdraw" || name === "proposal_reject";
								return (
									<Pressable
										key={name}
										accessibilityRole="button"
										disabled={
											action.isPending ||
											(name === "submit" && !evidenceStatus.canSubmit)
										}
										onPress={() => void perform(name)}
										style={[
											styles.actionButton,
											primary
												? { backgroundColor: c.primary, borderColor: c.primary }
												: {
														backgroundColor: c.card,
														borderColor: danger ? c.danger : c.border,
													},
											name === "submit" && !evidenceStatus.canSubmit
												? styles.disabled
												: null,
										]}
									>
										<Text
											style={[
												styles.actionText,
												{
													color: primary ? "#fff" : danger ? c.danger : c.text,
												},
											]}
										>
											{t(DISPUTE_ACTION_LABELS[name])}
										</Text>
									</Pressable>
								);
							})}
						</View>
					) : null}
					{action.isError || upload.isError ? (
						<Text accessibilityRole="alert" style={styles.error}>
							{t("disputes.actionError")}
						</Text>
					) : null}
				</ScrollView>

				{canMessage ? (
					<View
						style={[
							styles.composer,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{canUpload ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("disputes.addEvidence")}
								onPress={() => void addEvidence()}
								style={[styles.roundButton, { backgroundColor: c.neutralSoft }]}
							>
								<Ionicons name="attach" size={20} color={c.text} />
							</Pressable>
						) : null}
						<TextInput
							accessibilityLabel={t("disputes.messageLabel")}
							placeholder={t("disputes.messageLabel")}
							placeholderTextColor={c.muted}
							multiline
							maxLength={2000}
							value={form.watch("body")}
							onChangeText={(value) =>
								form.setValue("body", value, { shouldValidate: true })
							}
							style={[
								styles.input,
								{
									color: c.text,
									backgroundColor: c.input,
									borderColor: c.border,
								},
							]}
						/>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("disputes.sendMessage")}
							disabled={action.isPending}
							onPress={() => void send()}
							style={[styles.roundButton, { backgroundColor: c.primary }]}
						>
							{action.isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Ionicons name="send" size={18} color="#fff" />
							)}
						</Pressable>
					</View>
				) : null}
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

function toneColors(c: ShopPalette, tone: DisputeTone) {
	switch (tone) {
		case "warning":
			return {
				soft: c.warningSoft,
				border: c.isDark ? c.warningSoft : "#fde68a",
				strong: "#d97706",
				text: c.warningText,
				icon: "hourglass-outline" as const,
			};
		case "primary":
			return {
				soft: c.primarySoft,
				border: c.primarySoft,
				strong: c.primary,
				text: c.isDark ? "#93c5fd" : c.primary,
				icon: "scale-outline" as const,
			};
		case "success":
			return {
				soft: c.successSoft,
				border: c.successSoft,
				strong: c.success,
				text: c.successText,
				icon: "checkmark-circle-outline" as const,
			};
		default:
			return {
				soft: c.neutralSoft,
				border: c.border,
				strong: c.neutralText,
				text: c.neutralText,
				icon: "archive-outline" as const,
			};
	}
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	flex: { flex: 1 },
	loading: { marginTop: 48 },
	content: { gap: 14, padding: 16, paddingBottom: 24 },
	banner: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
	bannerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	bannerIcon: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	bannerTitle: { fontFamily: Fonts.displayBold, fontSize: 16 },
	bannerBody: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	evidence: { gap: 6 },
	chipButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	chipText: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	evidenceText: { fontFamily: Fonts.body, fontSize: 12 },
	card: { borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
	title: { fontFamily: Fonts.displayBold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
	amount: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	empty: { fontFamily: Fonts.body, fontSize: 14, textAlign: "center" },
	mineWrap: { alignItems: "flex-end", gap: 4, paddingLeft: 48 },
	bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
	mine: { borderBottomRightRadius: 4 },
	theirsRow: {
		flexDirection: "row",
		gap: 8,
		alignItems: "flex-end",
		paddingRight: 32,
	},
	theirs: { flex: 1, gap: 4, alignItems: "flex-start" },
	theirBubble: { borderWidth: 1, borderBottomLeftRadius: 4 },
	authorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	author: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	avatar: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
	badgeText: { fontFamily: Fonts.bodySemibold, fontSize: 11 },
	time: { fontFamily: Fonts.body, fontSize: 11 },
	actions: { gap: 10, marginTop: 6 },
	actionButton: {
		alignItems: "center",
		justifyContent: "center",
		minHeight: 48,
		borderRadius: 14,
		borderWidth: 1,
	},
	actionText: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	disabled: { opacity: 0.5 },
	composer: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	roundButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		flex: 1,
		minHeight: 44,
		maxHeight: 120,
		borderRadius: 22,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingTop: 11,
		paddingBottom: 11,
		fontFamily: Fonts.body,
		fontSize: 15,
	},
	error: {
		color: "#dc2626",
		fontFamily: Fonts.bodyMedium,
		margin: 16,
		textAlign: "center",
	},
});
