import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { PurchaseStatusPill } from "@/src/components/purchases/PurchaseRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import {
	uploadDisputeEvidence,
	useOpenDispute,
	useSubmitOpenedDispute,
} from "@/src/hooks/useDisputes";
import { usePurchase } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	DISPUTE_OUTCOME_LABELS,
	DISPUTE_REASON_LABELS,
} from "@/src/lib/caseStatus";
import {
	acceptPickedEvidence,
	DISPUTE_OPEN_EVIDENCE_MAX,
	evidenceKindFor,
	evidenceStillNeeded,
	failedUploads,
	nextSubmitStep,
	type PendingEvidence,
	uploadsToSend,
	withUploadStatus,
} from "@/src/lib/disputeOpenForm";
import { requestedDisputeAmount } from "@/src/lib/disputeReport";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import {
	BUYER_DISPUTE_OUTCOMES,
	BUYER_DISPUTE_REASONS,
	DISPUTE_DESCRIPTION_MAX,
	DISPUTE_DESCRIPTION_MIN,
} from "../../../../api/src/contracts/disputes";

const problemSchema = z.object({
	reason: z.enum(BUYER_DISPUTE_REASONS),
	description: z
		.string()
		.trim()
		.min(DISPUTE_DESCRIPTION_MIN)
		.max(DISPUTE_DESCRIPTION_MAX),
	requestedOutcome: z.enum(BUYER_DISPUTE_OUTCOMES),
	requestedAmount: z.string().optional(),
	items: z
		.array(
			z.object({
				orderItemId: z.string(),
				quantity: z.number().int().positive(),
			}),
		)
		.min(1),
});
type ProblemForm = z.infer<typeof problemSchema>;

export default function ReportOrderProblemScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const lang = useAppLocale();
	const params = useLocalSearchParams<{ id: string }>();
	const id = Array.isArray(params.id) ? params.id[0] : params.id;
	const order = usePurchase(id);
	const config = useAppConfig();
	const open = useOpenDispute(id ?? "");
	const submitCase = useSubmitOpenedDispute();
	const [evidence, setEvidence] = useState<PendingEvidence[]>([]);
	const [caseId, setCaseId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [evidenceError, setEvidenceError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const keySeq = useRef(0);
	const form = useForm<ProblemForm>({
		resolver: zodResolver(problemSchema),
		defaultValues: {
			reason: "not_received",
			description: "",
			requestedOutcome: "full_refund",
			requestedAmount: "",
			items: [],
		},
	});

	const orderItems = order.data?.items;
	useEffect(() => {
		if (!orderItems?.length || form.getValues("items").length) return;
		form.setValue(
			"items",
			orderItems.map((item) => ({
				orderItemId: item.id,
				quantity: item.quantity,
			})),
		);
	}, [orderItems, form]);

	if (!config.disputesEnabled) {
		return (
			<EmptyState
				illustration="empty"
				title={t("disputes.disabledTitle")}
				subtitle={t("disputes.disabledBody")}
				ctaLabel={t("disputes.contactSupport")}
				onCta={() => router.replace("/contact")}
			/>
		);
	}
	if (order.isPending)
		return <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} />;
	if (order.isError || !order.data)
		return (
			<EmptyState
				illustration="notFound"
				title={t("purchases.loadError")}
				ctaLabel={t("common.retry")}
				onCta={() => void order.refetch()}
			/>
		);
	const data = order.data;
	const locked = caseId !== null;
	const reason = form.watch("reason");
	const outcome = form.watch("requestedOutcome");
	const needed = evidenceStillNeeded(reason, evidence.length);
	const failed = failedUploads(evidence);

	const pickEvidence = async () => {
		setEvidenceError(null);
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (permission.status !== "granted") return;
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images", "videos"],
			allowsMultipleSelection: true,
			selectionLimit: Math.max(1, DISPUTE_OPEN_EVIDENCE_MAX - evidence.length),
			quality: 0.85,
		});
		if (result.canceled) return;
		const { next, rejected } = acceptPickedEvidence(
			evidence,
			result.assets,
			() => `e${keySeq.current++}`,
		);
		setEvidence(next);
		if (rejected.length) {
			setEvidenceError(
				t(`disputes.evidenceRejected_${rejected[0]}`, {
					max: DISPUTE_OPEN_EVIDENCE_MAX,
				}),
			);
		}
	};

	const sendEvidence = async (disputeId: string, items: PendingEvidence[]) => {
		let current = items;
		for (const entry of uploadsToSend(items)) {
			current = withUploadStatus(current, entry.key, "uploading");
			setEvidence(current);
			try {
				await uploadDisputeEvidence(
					disputeId,
					{
						uri: entry.uri,
						fileName: entry.fileName,
						mimeType: entry.mimeType,
					},
					evidenceKindFor(entry.mimeType),
				);
				current = withUploadStatus(current, entry.key, "done");
			} catch (error) {
				const code =
					error && typeof error === "object" && "code" in error
						? String((error as { code: unknown }).code)
						: undefined;
				current = withUploadStatus(current, entry.key, "failed", code);
			}
			setEvidence(current);
		}
		return current;
	};

	const run = async (values: ProblemForm) => {
		setSubmitError(null);
		let disputeId = caseId;
		if (!disputeId) {
			const amount = requestedDisputeAmount(
				values.requestedOutcome,
				values.requestedAmount ?? "",
				data.amounts.total,
			);
			if (!amount.valid) {
				form.setError("requestedAmount", { message: amount.reason });
				return;
			}
			if (evidenceStillNeeded(values.reason, evidence.length) > 0) {
				setEvidenceError(
					t("disputes.evidenceNeeded", {
						count: evidenceStillNeeded(values.reason, evidence.length),
					}),
				);
				return;
			}
			const opened = await open.mutateAsync({
				reason: values.reason,
				subject: "goods",
				description: values.description,
				requestedOutcome: values.requestedOutcome,
				...(amount.amount !== undefined
					? { requestedAmount: amount.amount }
					: {}),
				items: values.items,
			});
			disputeId = opened.id;
			setCaseId(opened.id);
		}
		let items = evidence;
		if (nextSubmitStep({ caseId: disputeId, items }) === "upload") {
			items = await sendEvidence(disputeId, items);
		}
		if (nextSubmitStep({ caseId: disputeId, items }) !== "submit") return;
		const short = evidenceStillNeeded(values.reason, items.length);
		if (short > 0) {
			setEvidenceError(t("disputes.evidenceNeeded", { count: short }));
			return;
		}
		await submitCase.mutateAsync(disputeId);
		router.replace({ pathname: "/disputes/[id]", params: { id: disputeId } });
	};

	const onSend = () => {
		if (busy) return;
		setBusy(true);
		const finish = () => setBusy(false);
		const fail = (error: unknown) => {
			setSubmitError(resolveErrorMessage(error, t, t("disputes.openError")));
		};
		if (locked) {
			run(form.getValues()).catch(fail).finally(finish);
			return;
		}
		form.handleSubmit(run)().catch(fail).finally(finish);
	};

	const removeEvidence = (key: string) =>
		setEvidence((current) => current.filter((entry) => entry.key !== key));

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("disputes.reportTitle")}
				subtitle={t("purchases.orderNumber", { number: data.orderNumber })}
				onBack={() => router.back()}
			/>
			<ScreenColumn width="reading">
				<ScrollView
					contentContainerStyle={styles.content}
					keyboardShouldPersistTaps="handled"
				>
					<View
						style={[
							styles.orderCard,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<View
							style={[styles.orderIcon, { backgroundColor: c.primarySoft }]}
						>
							<Ionicons name="bag-handle-outline" size={20} color={c.primary} />
						</View>
						<View style={{ flex: 1, minWidth: 0 }}>
							<Text
								style={[styles.orderTitle, { color: c.text }]}
								numberOfLines={1}
							>
								{data.items[0]?.title ?? data.orderNumber}
							</Text>
							<Text
								style={[styles.orderMeta, { color: c.muted }]}
								numberOfLines={1}
							>
								{data.shop.name} · {formatPrice(data.amounts.total, lang)}
							</Text>
						</View>
						<PurchaseStatusPill status={data.status} />
					</View>

					{locked && failed.length > 0 ? (
						<View
							accessibilityRole="alert"
							style={[
								styles.card,
								{ backgroundColor: c.dangerSoft, borderColor: c.border },
							]}
						>
							<Text style={[styles.title, { color: c.dangerText }]}>
								{t("disputes.uploadFailedTitle")}
							</Text>
							<Text style={[styles.body, { color: c.text }]}>
								{t("disputes.uploadFailedBody", { count: failed.length })}
							</Text>
							{failed.map((entry, index) => (
								<Text key={entry.key} style={[styles.body, { color: c.text }]}>
									{`• ${entry.fileName ?? t("disputes.evidenceFileN", { n: index + 1 })}${
										entry.errorCode
											? ` — ${resolveErrorMessage({ code: entry.errorCode }, t)}`
											: ""
									}`}
								</Text>
							))}
							<Pressable
								accessibilityRole="link"
								onPress={() =>
									caseId &&
									router.replace({
										pathname: "/disputes/[id]",
										params: { id: caseId },
									})
								}
							>
								<Text style={[styles.link, { color: c.primary }]}>
									{t("disputes.openCase")}
								</Text>
							</Pressable>
						</View>
					) : null}

					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.title, { color: c.text }]}>
							{t("disputes.reportReason")}
						</Text>
						<Controller
							control={form.control}
							name="reason"
							render={({ field: { onChange, value } }) => (
								<View style={styles.grid}>
									{BUYER_DISPUTE_REASONS.map((option) => (
										<Choice
											key={option}
											selected={value === option}
											disabled={locked}
											label={t(DISPUTE_REASON_LABELS[option])}
											onPress={() => onChange(option)}
										/>
									))}
								</View>
							)}
						/>

						<Text style={[styles.title, { color: c.text }]}>
							{t("disputes.reportDetails")}
						</Text>
						<Controller
							control={form.control}
							name="description"
							render={({ field: { onBlur, onChange, value } }) => (
								<TextInput
									accessibilityLabel={t("disputes.reportDetails")}
									multiline
									editable={!locked}
									maxLength={DISPUTE_DESCRIPTION_MAX}
									value={value}
									onBlur={onBlur}
									onChangeText={onChange}
									style={[
										styles.input,
										styles.multiline,
										{
											color: c.text,
											borderColor: c.border,
											backgroundColor: c.input,
										},
									]}
								/>
							)}
						/>
						{form.formState.errors.description ? (
							<Text style={styles.error}>{t("disputes.descriptionError")}</Text>
						) : null}

						<View style={styles.rowBetween}>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.evidenceSection")}
							</Text>
							<Text style={[styles.counter, { color: c.muted }]}>
								{t("disputes.evidenceCount", {
									count: evidence.length,
									max: DISPUTE_OPEN_EVIDENCE_MAX,
								})}
							</Text>
						</View>
						<View style={styles.thumbs}>
							{evidence.map((entry) => (
								<EvidenceTile
									key={entry.key}
									entry={entry}
									removable={
										entry.status !== "done" && entry.status !== "uploading"
									}
									onRemove={() => removeEvidence(entry.key)}
								/>
							))}
							{evidence.length < DISPUTE_OPEN_EVIDENCE_MAX ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={t("disputes.addEvidenceMedia")}
									onPress={() => void pickEvidence().catch(() => undefined)}
									style={[
										styles.thumb,
										styles.addTile,
										{ borderColor: c.border },
									]}
								>
									<Ionicons name="add" size={22} color={c.muted} />
									<Text style={[styles.addText, { color: c.muted }]}>
										{t("disputes.addEvidenceMedia")}
									</Text>
								</Pressable>
							) : null}
						</View>
						{needed > 0 ? (
							<Text style={[styles.note, { color: c.muted }]}>
								{t("disputes.evidenceNeeded", { count: needed })}
							</Text>
						) : null}
						{evidenceError ? (
							<Text style={styles.error}>{evidenceError}</Text>
						) : null}
					</View>

					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.title, { color: c.text }]}>
							{t("disputes.reportOutcome")}
						</Text>
						<Controller
							control={form.control}
							name="requestedOutcome"
							render={({ field: { onChange, value } }) => (
								<View style={styles.choices}>
									{BUYER_DISPUTE_OUTCOMES.map((option) => (
										<Choice
											key={option}
											selected={value === option}
											disabled={locked}
											label={t(DISPUTE_OUTCOME_LABELS[option])}
											onPress={() => onChange(option)}
										/>
									))}
								</View>
							)}
						/>
						{outcome === "partial_refund" ? (
							<>
								<Text style={[styles.label, { color: c.text }]}>
									{t("disputes.requestedAmountOptional")}
								</Text>
								<Controller
									control={form.control}
									name="requestedAmount"
									render={({ field: { onBlur, onChange, value } }) => (
										<TextInput
											accessibilityLabel={t("disputes.requestedAmountOptional")}
											keyboardType="number-pad"
											editable={!locked}
											maxLength={12}
											value={value}
											onBlur={onBlur}
											onChangeText={onChange}
											style={[
												styles.input,
												{
													color: c.text,
													borderColor: c.border,
													backgroundColor: c.input,
												},
											]}
										/>
									)}
								/>
							</>
						) : null}
						{form.formState.errors.requestedAmount ? (
							<Text style={styles.error}>
								{t(
									`disputes.amountError.${form.formState.errors.requestedAmount.message}`,
								)}
							</Text>
						) : null}

						{data.items.length > 1 ? (
							<>
								<Text style={[styles.title, { color: c.text }]}>
									{t("disputes.reportItems")}
								</Text>
								<Controller
									control={form.control}
									name="items"
									render={({ field: { onChange, value } }) => (
										<View style={styles.choices}>
											{data.items.map((item) => {
												const selected = value.some(
													(row) => row.orderItemId === item.id,
												);
												return (
													<Choice
														key={item.id}
														selected={selected}
														disabled={locked}
														label={`${item.title} × ${item.quantity}`}
														role="checkbox"
														onPress={() =>
															onChange(
																selected
																	? value.filter(
																			(row) => row.orderItemId !== item.id,
																		)
																	: [
																			...value,
																			{
																				orderItemId: item.id,
																				quantity: item.quantity,
																			},
																		],
															)
														}
													/>
												);
											})}
										</View>
									)}
								/>
							</>
						) : null}
						{form.formState.errors.items ? (
							<Text style={styles.error}>{t("disputes.itemsRequired")}</Text>
						) : null}
					</View>

					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.title, { color: c.text }]}>
							{t("disputes.nextTitle")}
						</Text>
						{(
							[
								["time-outline", "disputes.nextShop"],
								["scale-outline", "disputes.nextMediation"],
								["cube-outline", "disputes.nextKeepItem"],
							] as const
						).map(([icon, key]) => (
							<View key={key} style={styles.nextRow}>
								<Ionicons name={icon} size={18} color={c.text} />
								<Text style={[styles.nextText, { color: c.text }]}>
									{t(key)}
								</Text>
							</View>
						))}
						<Text style={[styles.note, { color: c.muted }]}>
							{t("disputes.reviewTerms")}
						</Text>
					</View>
					{submitError ? (
						<Text accessibilityRole="alert" style={styles.error}>
							{submitError}
						</Text>
					) : null}
				</ScrollView>
			</ScreenColumn>
			<View
				style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ busy }}
					disabled={busy}
					onPress={onSend}
					style={[styles.button, { backgroundColor: c.primary }]}
				>
					{busy ? (
						<View style={styles.busyRow}>
							<ActivityIndicator color="#fff" />
							<Text style={styles.buttonText}>
								{caseId ? t("disputes.uploadingEvidence") : t("common.loading")}
							</Text>
						</View>
					) : (
						<Text style={styles.buttonText}>
							{locked && failed.length > 0
								? t("disputes.retryUploads")
								: t("disputes.submitReport")}
						</Text>
					)}
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

function EvidenceTile({
	entry,
	removable,
	onRemove,
}: {
	entry: PendingEvidence;
	removable: boolean;
	onRemove: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const isVideo = entry.mimeType.startsWith("video/");
	return (
		<View
			style={[
				styles.thumb,
				{
					borderColor: entry.status === "failed" ? "#dc2626" : c.border,
					backgroundColor: c.input,
				},
			]}
		>
			{isVideo ? (
				<View style={styles.videoTile}>
					<Ionicons name="videocam" size={24} color={c.muted} />
				</View>
			) : (
				<Image
					source={{ uri: entry.uri }}
					style={styles.thumbImage}
					contentFit="cover"
				/>
			)}
			{entry.status === "uploading" ? (
				<View style={styles.thumbOverlay}>
					<ActivityIndicator color="#fff" />
				</View>
			) : entry.status === "failed" ? (
				<View style={[styles.thumbOverlay, styles.thumbFailed]}>
					<Ionicons name="alert-circle" size={22} color="#fff" />
				</View>
			) : entry.status === "done" ? (
				<View style={styles.thumbDone}>
					<Ionicons name="checkmark-circle" size={18} color="#16a34a" />
				</View>
			) : null}
			{removable ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("disputes.removeEvidence")}
					onPress={onRemove}
					hitSlop={8}
					style={styles.thumbRemove}
				>
					<Ionicons name="close" size={14} color="#fff" />
				</Pressable>
			) : null}
		</View>
	);
}

function Choice({
	selected,
	label,
	role = "radio",
	disabled = false,
	onPress,
}: {
	selected: boolean;
	label: string;
	role?: "radio" | "checkbox";
	disabled?: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const mark =
		role === "radio"
			? selected
				? "radio-button-on"
				: "radio-button-off"
			: selected
				? "checkbox"
				: "square-outline";
	return (
		<Pressable
			accessibilityRole={role}
			accessibilityState={{ checked: selected, disabled }}
			disabled={disabled}
			onPress={onPress}
			style={[
				styles.choice,
				{
					borderColor: selected ? c.primary : c.border,
					borderWidth: selected ? 1.5 : 1,
					backgroundColor: selected ? c.primarySoft : c.card,
				},
			]}
		>
			<Ionicons name={mark} size={20} color={selected ? c.primary : c.muted} />
			<Text
				style={[styles.choiceText, { color: selected ? c.primary : c.text }]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, paddingBottom: 32, gap: 14 },
	orderCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: 1,
		padding: 12,
	},
	orderIcon: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	orderTitle: { fontFamily: Fonts.displayBold, fontSize: 15 },
	orderMeta: { fontFamily: Fonts.body, fontSize: 12, marginTop: 2 },
	card: { borderRadius: 16, borderWidth: 1, gap: 13, padding: 16 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 17 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21 },
	choices: { gap: 8 },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	choice: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 12,
		minHeight: 48,
		paddingHorizontal: 12,
		paddingVertical: 10,
		flexGrow: 1,
		flexBasis: "45%",
	},
	choiceText: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 14 },
	nextRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	nextText: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 14 },
	note: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
	bar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
	input: {
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 46,
		padding: 12,
		fontFamily: Fonts.body,
		fontSize: 15,
	},
	multiline: { minHeight: 150, textAlignVertical: "top" },
	error: { color: "#dc2626", fontFamily: Fonts.bodySemibold },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	counter: { fontFamily: Fonts.bodySemibold, fontSize: 12 },
	link: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	thumb: {
		width: 76,
		height: 76,
		borderRadius: 12,
		borderWidth: 1,
		overflow: "hidden",
	},
	thumbImage: { width: "100%", height: "100%" },
	videoTile: { flex: 1, alignItems: "center", justifyContent: "center" },
	thumbOverlay: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(15,23,42,0.45)",
	},
	thumbFailed: { backgroundColor: "rgba(220,38,38,0.55)" },
	thumbDone: {
		position: "absolute",
		bottom: 4,
		right: 4,
		backgroundColor: "#fff",
		borderRadius: 999,
	},
	thumbRemove: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(15,23,42,0.7)",
	},
	addTile: {
		alignItems: "center",
		justifyContent: "center",
		borderStyle: "dashed",
		borderWidth: 1.5,
		gap: 2,
	},
	addText: { fontFamily: Fonts.bodySemibold, fontSize: 11 },
	busyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	button: {
		alignItems: "center",
		borderRadius: 14,
		justifyContent: "center",
		minHeight: 52,
		padding: 12,
	},
	buttonText: { color: "#fff", fontFamily: Fonts.displayBold, fontSize: 16 },
});
