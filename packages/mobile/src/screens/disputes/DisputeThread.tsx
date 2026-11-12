import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
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
import { Colors, Fonts } from "@/constants/theme";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { FormError } from "@/src/components/checkout/FormError";
import { fillOf, inkOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
import {
	EvidenceStrip,
	EvidenceViewer,
	useOpenEvidenceFile,
} from "@/src/components/disputes/Evidence";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { PurchaseButton } from "@/src/components/purchases/ui";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { type ShopPalette, useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useDispute,
	useDisputeAction,
	useUploadDisputeEvidence,
} from "@/src/hooks/useDisputes";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	DISPUTE_ACTION_LABELS,
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import {
	disputeEvidenceStatus,
	type EvidenceAttachment,
	looseEvidence,
	messageAttachments,
	stageEvidence,
} from "@/src/lib/disputeEvidence";
import {
	type DisputeTone,
	disputeDeadline,
	disputeTone,
	messageAuthor,
} from "@/src/lib/disputeThread";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";

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
type DisputeButton = (typeof buttons)[number];

/** Decisions waiting on the viewer: pinned above the composer, not lost under the history. */
const DECISIONS = new Set<DisputeButton>([
	"respond_accept",
	"proposal_accept",
	"proposal_reject",
]);

/**
 * These settle money or close the case for good, so each asks first, in
 * its own words.
 */
const CONFIRMS: Partial<
	Record<DisputeButton, { title: string; body: string; destructive: boolean }>
> = {
	withdraw: {
		title: "disputes.confirmWithdrawTitle",
		body: "disputes.confirmWithdrawBody",
		destructive: true,
	},
	proposal_reject: {
		title: "disputes.confirmRejectTitle",
		body: "disputes.confirmRejectBody",
		destructive: true,
	},
	proposal_accept: {
		title: "disputes.confirmAcceptTitle",
		body: "disputes.confirmAcceptBody",
		destructive: false,
	},
	respond_accept: {
		title: "disputes.confirmResolutionTitle",
		body: "disputes.confirmResolutionBody",
		destructive: false,
	},
};

export function DisputeThread({ id }: { id: string }) {
	const { t, i18n } = useTranslation();
	const c = useShopTheme();
	const fill = fillOf(c);
	const view = useDispute(id);
	const action = useDisputeAction(id ?? "");
	const upload = useUploadDisputeEvidence(id ?? "");
	const form = useForm<MessageForm>({
		resolver: zodResolver(messageSchema),
		defaultValues: { body: "" },
	});
	const { showAlert, showError, confirm } = useAlert();
	const [viewing, setViewing] = useState<EvidenceAttachment | null>(null);
	const [staged, setStaged] = useState<string[]>([]);
	const [evidenceError, setEvidenceError] = useState<string | null>(null);
	const openFile = useOpenEvidenceFile(id ?? "");
	const scroll = useRef<ScrollView>(null);
	// A new message lands in view, not below the fold.
	const messageCount = view.data?.messages.length ?? 0;
	useEffect(() => {
		if (messageCount === 0) return;
		const timer = setTimeout(
			() => scroll.current?.scrollToEnd({ animated: true }),
			50,
		);
		return () => clearTimeout(timer);
	}, [messageCount]);

	if (view.isPending || view.isError || !view.data)
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("disputes.title")} />
				{view.isPending ? (
					<DetailSkeleton cards={2} />
				) : (
					<EmptyState
						illustration="notFound"
						title={t("disputes.detailLoadError")}
						ctaLabel={t("common.retry")}
						onCta={() => void view.refetch()}
					/>
				)}
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
	const visibleButtons = buttons.filter((name) =>
		dispute.allowedActions.includes(name),
	);
	const decisions = visibleButtons.filter((name) => DECISIONS.has(name));
	const otherButtons = visibleButtons.filter((name) => !DECISIONS.has(name));
	const askThenPerform = async (name: DisputeButton) => {
		const ask = CONFIRMS[name];
		if (ask) {
			const amount = dispute.proposal
				? formatPrice(dispute.proposal.amount, locale)
				: "";
			const ok = await confirm(
				t(ask.title, { amount }),
				t(ask.body, { amount }),
				{
					confirmText: t(DISPUTE_ACTION_LABELS[name]),
					destructive: ask.destructive,
				},
			);
			if (!ok) return;
		}
		await perform(name);
	};
	const perform = async (name: DisputeButton) => {
		const body =
			name === "respond_accept"
				? { action: "accept" }
				: name === "proposal_accept" || name === "proposal_reject"
					? { action: name === "proposal_accept" ? "accept" : "reject" }
					: undefined;
		await action.mutateAsync({ action: name, body });
	};
	const openEvidence = (attachment: EvidenceAttachment) => {
		if (attachment.kind === "image") return setViewing(attachment);
		openFile(attachment).catch((error: unknown) =>
			showError(
				t("disputes.evidenceUnavailable"),
				resolveErrorMessage(error, t),
			),
		);
	};
	const addEvidence = async (stage = false) => {
		setEvidenceError(null);
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (permission.status !== "granted") {
			// Said next to the button, rather than a tap that does nothing.
			setEvidenceError(t("errors.photoPermission"));
			return;
		}
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.85,
		});
		const asset = result.canceled ? null : result.assets[0];
		if (!asset) return;
		const uploaded = await upload.mutateAsync({
			uri: asset.uri,
			fileName: asset.fileName ?? null,
			mimeType: asset.mimeType ?? null,
		});
		if (stage) setStaged((current) => stageEvidence(current, uploaded.id));
	};
	const send = form.handleSubmit(async (values) => {
		await action.mutateAsync({
			action: "message",
			body: staged.length ? { ...values, evidenceIds: staged } : values,
		});
		form.reset();
		setStaged([]);
	});
	const toAttachment = (ids: readonly string[]) =>
		messageAttachments(ids, dispute.evidence);
	const loose = toAttachment(
		looseEvidence(dispute.evidence, dispute.messages)
			.map((item) => item.id)
			.filter((evidenceId) => !staged.includes(evidenceId)),
	);
	const openMenu = () =>
		showAlert(t("disputes.menu"), "", [
			...(canUpload
				? [
						{
							text: t("disputes.addEvidence"),
							onPress: () => void addEvidence().catch(() => undefined),
						},
					]
				: []),
			...visibleButtons
				.filter((name) => name !== "submit" || evidenceStatus.canSubmit)
				.map((name) => ({
					text: t(DISPUTE_ACTION_LABELS[name]),
					style:
						name === "withdraw" || name === "proposal_reject"
							? ("destructive" as const)
							: ("default" as const),
					onPress: () => void askThenPerform(name).catch(() => undefined),
				})),
			{ text: t("disputes.refresh"), onPress: () => void view.refetch() },
			{ text: t("common.cancel"), style: "cancel" as const },
		]);
	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("disputes.threadTitle", { number: dispute.number })}
				subtitle={`${t(DISPUTE_REASON_LABELS[dispute.reason])} · ${t("disputes.order", { number: dispute.orderNumber })}`}
				right={
					<Pressable
						onPress={openMenu}
						accessibilityRole="button"
						accessibilityLabel={t("disputes.menu")}
						hitSlop={8}
						style={styles.menuButton}
					>
						<Ionicons name="ellipsis-horizontal" size={22} color={c.text} />
					</Pressable>
				}
			/>
			<KeyboardAvoidingView behavior="padding" style={styles.safe}>
				<ScreenColumn width="reading">
					<ScrollView
						ref={scroll}
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
									<Ionicons name={tone.icon} size={20} color={fill.fg} />
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
										accessibilityLabel={t("disputes.addEvidence")}
										accessibilityState={{
											disabled:
												upload.isPending || dispute.evidence.length >= 10,
											busy: upload.isPending,
										}}
										disabled={upload.isPending || dispute.evidence.length >= 10}
										onPress={() => void addEvidence().catch(() => undefined)}
										style={({ pressed }) => [
											styles.chipButton,
											{
												backgroundColor: c.card,
												borderColor: c.border,
												opacity:
													dispute.evidence.length >= 10
														? 0.5
														: pressed
															? 0.85
															: 1,
											},
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
															evidenceStatus.required -
															evidenceStatus.remaining,
														required: evidenceStatus.required,
													})}
										</Text>
									) : null}
									<FormError message={evidenceError} />
								</View>
							) : null}
							{loose.length ? (
								<View style={styles.evidence}>
									<Text style={[styles.evidenceText, { color: tone.text }]}>
										{t("disputes.evidenceTitle")}
									</Text>
									<EvidenceStrip
										disputeId={dispute.id}
										attachments={loose}
										onOpen={openEvidence}
									/>
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
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
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

						{dispute.proposal?.status === "open" && decisions.length === 0 ? (
							<View
								style={[
									styles.card,
									{ backgroundColor: c.card, borderColor: c.primary },
								]}
							>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("disputes.proposal")}
								</Text>
								<TotalTag
									amount={formatPrice(dispute.proposal.amount, locale)}
								/>
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
													{ backgroundColor: OWN_BUBBLE },
												]}
											>
												<Text style={[styles.body, { color: ON_FILL }]}>
													{text}
												</Text>
												<EvidenceStrip
													disputeId={dispute.id}
													attachments={toAttachment(message.evidenceIds)}
													onOpen={openEvidence}
												/>
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
												style={[styles.avatar, { backgroundColor: fill.bg }]}
											>
												<Ionicons
													name="shield-checkmark"
													size={16}
													color={ON_FILL}
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
															style={[styles.badgeText, { color: inkOf(c) }]}
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
														: {
																backgroundColor: c.card,
																borderColor: c.border,
															},
												]}
											>
												<Text style={[styles.body, { color: c.text }]}>
													{text}
												</Text>
												<EvidenceStrip
													disputeId={dispute.id}
													attachments={toAttachment(message.evidenceIds)}
													onOpen={openEvidence}
												/>
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

						{otherButtons.length ? (
							<View style={styles.actions}>
								{otherButtons.map((name) => (
									<PurchaseButton
										key={name}
										label={t(DISPUTE_ACTION_LABELS[name])}
										tone={
											name === "submit" || name.endsWith("accept")
												? "primary"
												: name === "withdraw" || name === "proposal_reject"
													? "danger"
													: "outline"
										}
										disabled={
											action.isPending ||
											(name === "submit" && !evidenceStatus.canSubmit)
										}
										onPress={() =>
											void askThenPerform(name).catch(() => undefined)
										}
									/>
								))}
							</View>
						) : null}
					</ScrollView>
				</ScreenColumn>

				{action.isError || upload.isError ? (
					<View
						style={[styles.errorBar, { backgroundColor: c.dangerSoft }]}
						accessibilityRole="alert"
						accessibilityLiveRegion="polite"
					>
						<Ionicons name="alert-circle" size={18} color={c.dangerText} />
						<Text style={[styles.errorText, { color: c.dangerText }]}>
							{action.isError
								? resolveErrorMessage(
										action.error,
										t,
										t("disputes.actionError"),
									)
								: resolveErrorMessage(
										upload.error,
										t,
										t("disputes.uploadFailed"),
									)}
						</Text>
					</View>
				) : null}

				{decisions.length ? (
					<View
						style={[
							styles.decision,
							{ backgroundColor: c.card, borderColor: c.primary },
						]}
					>
						{dispute.proposal?.status === "open" ? (
							<View style={styles.decisionHead}>
								<Text
									style={[styles.title, styles.flex, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("disputes.proposal")}
								</Text>
								<TotalTag
									size="md"
									amount={formatPrice(dispute.proposal.amount, locale)}
								/>
							</View>
						) : null}
						<View style={styles.decisionRow}>
							{decisions.map((name) => (
								<View key={name} style={styles.flex}>
									<PurchaseButton
										label={t(DISPUTE_ACTION_LABELS[name])}
										tone={name === "proposal_reject" ? "outline" : "primary"}
										disabled={action.isPending}
										onPress={() =>
											void askThenPerform(name).catch(() => undefined)
										}
									/>
								</View>
							))}
						</View>
					</View>
				) : null}

				{canMessage && staged.length ? (
					<View
						style={[
							styles.staged,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.evidenceText, { color: c.muted }]}>
							{t("disputes.stagedEvidence")}
						</Text>
						<EvidenceStrip
							disputeId={dispute.id}
							attachments={toAttachment(staged)}
							onOpen={openEvidence}
						/>
					</View>
				) : null}
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
								disabled={upload.isPending}
								onPress={() => void addEvidence(true).catch(() => undefined)}
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
							accessibilityState={{
								disabled: action.isPending,
								busy: action.isPending,
							}}
							disabled={action.isPending}
							onPress={() => void send()}
							style={[styles.roundButton, { backgroundColor: fill.bg }]}
						>
							{action.isPending ? (
								<ActivityIndicator color={fill.fg} />
							) : (
								<Ionicons name="send" size={18} color={fill.fg} />
							)}
						</Pressable>
					</View>
				) : null}
			</KeyboardAvoidingView>
			<EvidenceViewer
				disputeId={dispute.id}
				attachment={viewing}
				onClose={() => setViewing(null)}
			/>
		</SafeAreaView>
	);
}

function toneColors(c: ShopPalette, tone: DisputeTone) {
	switch (tone) {
		case "warning":
			return {
				soft: c.warningSoft,
				border: c.warningSoft,
				// The warning fill under a white glyph, the same in both themes.
				strong: Colors.light.warning,
				text: c.warningText,
				icon: "hourglass-outline" as const,
			};
		case "primary":
			return {
				soft: c.primarySoft,
				border: c.primarySoft,
				strong: fillOf(c).bg,
				text: inkOf(c),
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
	content: { gap: 14, padding: 16, paddingBottom: 24 },
	banner: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 12,
	},
	bannerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	bannerIcon: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	bannerTitle: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 23 },
	bannerBody: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	evidence: { gap: 6 },
	chipButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
	},
	chipText: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	evidenceText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		gap: 10,
		padding: 16,
	},
	title: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 23 },
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	amount: { fontFamily: Fonts.displayBold, fontSize: 17, lineHeight: 22 },
	empty: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		textAlign: "center",
		paddingVertical: 16,
	},
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
	badgeText: { fontFamily: Fonts.bodySemibold, fontSize: 12 },
	time: { fontFamily: Fonts.body, fontSize: 12 },
	actions: { gap: 10, marginTop: 6 },
	errorBar: {
		flexDirection: "row",
		gap: 8,
		alignItems: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	errorText: {
		flex: 1,
		fontSize: 14,
		lineHeight: 20,
		fontFamily: Fonts.bodyMedium,
	},
	decision: {
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderTopWidth: 1.5,
	},
	decisionHead: { flexDirection: "row", alignItems: "center", gap: 12 },
	decisionRow: { flexDirection: "row", gap: 10 },
	menuButton: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	staged: {
		gap: 6,
		paddingHorizontal: 12,
		paddingTop: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	composer: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	roundButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		flex: 1,
		minHeight: 48,
		maxHeight: 120,
		borderRadius: 24,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingTop: 11,
		paddingBottom: 11,
		fontFamily: Fonts.body,
		fontSize: 16,
	},
});

/** DESIGN.md: own bubbles are one deep blue in both themes, so white stays legible. */
const OWN_BUBBLE = Colors.light.ownBubble;
/** White on `OWN_BUBBLE` and on the staff fill: 4.5:1 or better on both. */
const ON_FILL = Colors.light.primaryForeground;
