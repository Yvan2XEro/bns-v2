import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useReducer } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import {
	DecisionButton,
	DetailSkeleton,
	FactRow,
	InlineNotice,
	LoadError,
	ModerationCard,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	type ModerationPalette,
	useModerationTheme,
} from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationDispute,
	useModerationDisputeAction,
	usePreviewDisputeOutcome,
} from "@/src/hooks/useModerationDisputes";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { canSubmitDisputeResolution } from "@/src/lib/moderationDisputeDecision";

const outcomes = [
	"resolved_buyer",
	"resolved_seller",
	"resolved_split",
] as const;
const liabilities = [
	"seller",
	"supplier",
	"reseller",
	"courier",
	"buyer",
	"none",
] as const;
const reasonCodes = [
	"seller_no_proof",
	"delivery_proven",
	"item_conforms",
	"item_not_conforming",
	"counterfeit_confirmed",
	"counterfeit_not_established",
	"damage_in_transit",
	"buyer_damage",
	"buyer_abuse",
	"review_extortion",
	"partial_fault",
	"agreement",
	"other",
] as const;

type FormState = {
	outcome: (typeof outcomes)[number];
	refund: string;
	returnRequired: boolean;
	returnShippingPaidBy: "seller" | "buyer";
	liableParty: (typeof liabilities)[number];
	reasonCode: (typeof reasonCodes)[number];
	statementFr: string;
	statementEn: string;
	note: string;
};

const initialState: FormState = {
	outcome: "resolved_split",
	refund: "",
	returnRequired: false,
	returnShippingPaidBy: "seller",
	liableParty: "seller",
	reasonCode: "other",
	statementFr: "",
	statementEn: "",
	note: "",
};

function reducer(state: FormState, patch: Partial<FormState>): FormState {
	return { ...state, ...patch };
}

export function ModerationDisputeDetail({ id }: { id: string }) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t, i18n } = useTranslation();
	const { showConfirm, showSuccess } = useAlert();
	const detail = useModerationDispute(id);
	const action = useModerationDisputeAction(id ?? "");
	const preview = usePreviewDisputeOutcome(id ?? "");
	const [form, patch] = useReducer(reducer, initialState);
	const refundAmount = Number.parseInt(form.refund, 10);
	const previewCurrent = canSubmitDisputeResolution(
		preview.data?.refundAmount ?? null,
		refundAmount,
	);

	if (detail.isPending || !detail.data) {
		return (
			<ModerationScreen title={t("moderationDisputes.detailTitle")}>
				{detail.isError ? (
					<LoadError
						title={t("moderationDisputes.loadError")}
						message={resolveErrorMessage(detail.error, t)}
						onRetry={() => void detail.refetch()}
					/>
				) : (
					<DetailSkeleton />
				)}
			</ModerationScreen>
		);
	}

	const sheet = detail.data;
	const dispute = sheet.dispute;
	const locale = i18n.language === "en" ? "en" : "fr";
	const sun = c.isDark ? Colors.dark.sun : Colors.light.sun;
	const refundValid = Number.isSafeInteger(refundAmount) && refundAmount >= 0;
	const formComplete =
		Boolean(form.note.trim()) &&
		Boolean(form.statementFr.trim()) &&
		Boolean(form.statementEn.trim());
	const onSaved = () => showSuccess(t("moderationDisputes.actionSaved"));
	const previewDecision = () => {
		if (!Number.isSafeInteger(refundAmount) || refundAmount < 0) return;
		preview.mutate(refundAmount);
	};
	const resolve = () => {
		if (!previewCurrent) return;
		action.mutate(
			{
				action: "resolve",
				outcome: form.outcome,
				refundAmount,
				returnRequired: form.returnRequired,
				returnShippingPaidBy: form.returnRequired
					? form.returnShippingPaidBy
					: null,
				liableParty: form.liableParty,
				reasonCode: form.reasonCode,
				publicStatement: {
					fr: form.statementFr.trim(),
					en: form.statementEn.trim(),
				},
				note: form.note.trim(),
			},
			{ onSuccess: onSaved },
		);
	};
	// The ruling moves money and is published to both parties: it is read
	// back, with the refund the preview computed, before it leaves.
	const confirmResolve = () => {
		if (!previewCurrent || !preview.data) return;
		showConfirm(
			t("moderationDisputes.confirmResolve"),
			`${t(DISPUTE_STATUS_LABELS[form.outcome])} · ${t(
				"moderationDisputes.previewRefund",
				{ amount: formatPrice(preview.data.refundAmount, locale) },
			)}`,
			resolve,
		);
	};
	const assign = () =>
		action.mutate({ action: "assign" }, { onSuccess: onSaved });

	return (
		<ModerationScreen
			title={t("moderationDisputes.detailTitle")}
			subtitle={dispute.number}
		>
			<ScreenColumn width="reading">
				<ScrollView
					contentContainerStyle={styles.content}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
				>
					{action.isError || preview.isError ? (
						<InlineNotice text={t("moderationDisputes.actionError")} />
					) : null}

					<ModerationCard
						title={t("moderationDisputes.caseSummary")}
						right={
							// The amount at stake is a price: ink on the yellow tag.
							<View style={[styles.priceTag, { backgroundColor: sun }]}>
								<Text style={styles.priceText}>
									{formatPrice(dispute.amountAtStake, locale)}
								</Text>
							</View>
						}
					>
						<Text style={[styles.lead, { color: c.text }]}>
							{t(DISPUTE_REASON_LABELS[dispute.reason])}
						</Text>
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("disputes.order", { number: dispute.orderNumber })} ·{" "}
							{t(DISPUTE_STATUS_LABELS[dispute.status])}
						</Text>
						<View style={[styles.rule, { backgroundColor: c.border }]} />
						<FactRow
							label={t("moderationDisputes.buyerDisputes")}
							value={String(sheet.partyHistory.buyerDisputes12m)}
						/>
						<FactRow
							label={t("moderationDisputes.buyerRefusals")}
							value={String(sheet.partyHistory.buyerRefusalScore)}
						/>
						<FactRow
							label={t("moderationDisputes.shopLossRate")}
							value={
								sheet.partyHistory.shopDisputeLossRate === null
									? "—"
									: `${Math.round(sheet.partyHistory.shopDisputeLossRate * 100)}%`
							}
						/>
						<View style={styles.buttons}>
							<DecisionButton
								variant="secondary"
								icon="chatbubbles-outline"
								label={t("moderationDisputes.openThread")}
								onPress={() =>
									router.push({
										pathname: "/disputes/[id]",
										params: { id: dispute.id },
									})
								}
								grow={0}
							/>
							<DecisionButton
								variant="secondary"
								icon="person-add-outline"
								label={t("moderationDisputes.assignToMe")}
								onPress={assign}
								disabled={action.isPending}
								grow={0}
							/>
						</View>
					</ModerationCard>

					<ModerationCard title={t("moderationDisputes.proofChecklist")}>
						{sheet.proofChecklist.map((row) => {
							const label = t(`moderationDisputes.proof.${row.requirement}`);
							const state = row.established
								? t("moderationDisputes.proven")
								: t("moderationDisputes.notProven");
							return (
								<View
									key={row.requirement}
									style={styles.proofRow}
									accessible
									accessibilityLabel={`${label}: ${state}`}
								>
									<Ionicons
										name={
											row.established ? "checkmark-circle" : "ellipse-outline"
										}
										size={20}
										color={row.established ? k.successText : c.muted}
									/>
									<View style={styles.flex}>
										<Text style={[styles.body, { color: c.text }]}>
											{label}
										</Text>
										<Text
											style={[
												styles.meta,
												{ color: row.established ? k.successText : c.muted },
											]}
										>
											{state}
											{row.source ? ` · ${row.source}` : ""}
										</Text>
									</View>
								</View>
							);
						})}
					</ModerationCard>

					{dispute.status === "under_review" ? (
						<ModerationCard title={t("moderationDisputes.resolveTitle")}>
							<View style={styles.form}>
								<Choice
									title={t("moderationDisputes.outcome")}
									values={outcomes}
									selected={form.outcome}
									label={(value) => t(DISPUTE_STATUS_LABELS[value])}
									onSelect={(outcome) => patch({ outcome })}
									c={c}
								/>
								<Field
									label={t("moderationDisputes.refundAmount")}
									value={form.refund}
									keyboardType="number-pad"
									suffix="FCFA"
									onChangeText={(refund) => {
										patch({ refund });
										preview.reset();
									}}
								/>
								<Choice
									title={t("moderationDisputes.liableParty")}
									values={liabilities}
									selected={form.liableParty}
									label={(value) => t(`moderationDisputes.liability.${value}`)}
									onSelect={(liableParty) => patch({ liableParty })}
									c={c}
								/>
								<Choice
									title={t("moderationDisputes.reasonCodeLabel")}
									values={reasonCodes}
									selected={form.reasonCode}
									label={(value) => t(`moderationDisputes.reasonCode.${value}`)}
									onSelect={(reasonCode) => patch({ reasonCode })}
									c={c}
								/>
								<Toggle
									label={t("moderationDisputes.returnRequired")}
									enabled={form.returnRequired}
									onPress={() =>
										patch({ returnRequired: !form.returnRequired })
									}
									c={c}
								/>
								{form.returnRequired ? (
									<Choice
										title={t("moderationDisputes.returnShippingPayer")}
										values={["seller", "buyer"] as const}
										selected={form.returnShippingPaidBy}
										label={(value) =>
											t(`moderationDisputes.liability.${value}`)
										}
										onSelect={(returnShippingPaidBy) =>
											patch({ returnShippingPaidBy })
										}
										c={c}
									/>
								) : null}
								<Field
									label={t("moderationDisputes.statementFr")}
									value={form.statementFr}
									onChangeText={(statementFr) => patch({ statementFr })}
								/>
								<Field
									label={t("moderationDisputes.statementEn")}
									value={form.statementEn}
									onChangeText={(statementEn) => patch({ statementEn })}
								/>
								<Field
									label={t("moderationDisputes.internalNote")}
									value={form.note}
									onChangeText={(note) => patch({ note })}
								/>

								{/* Two steps, in order: compute the allocation, then rule
								    on it. Changing the refund clears the preview. */}
								<DecisionButton
									variant={preview.data ? "secondary" : "primary"}
									icon="calculator-outline"
									label={t("moderationDisputes.preview")}
									onPress={previewDecision}
									pending={preview.isPending}
									disabled={!refundValid}
									grow={0}
								/>
								{preview.data ? (
									<View
										style={[
											styles.preview,
											{ backgroundColor: c.bg, borderColor: c.border },
										]}
									>
										<Text style={[styles.previewTotal, { color: c.text }]}>
											{t("moderationDisputes.previewRefund", {
												amount: formatPrice(preview.data.refundAmount, locale),
											})}
										</Text>
										<Text style={[styles.meta, { color: c.muted }]}>
											{t("moderationDisputes.previewBreakdown", {
												goods: formatPrice(
													preview.data.breakdown.goods,
													locale,
												),
												delivery: formatPrice(
													preview.data.breakdown.outboundDelivery,
													locale,
												),
												protection: formatPrice(
													preview.data.breakdown.buyerProtectionFee,
													locale,
												),
											})}
										</Text>
										<DecisionButton
											variant="primary"
											icon="checkmark-done"
											label={t("moderationDisputes.confirmResolve")}
											onPress={confirmResolve}
											pending={action.isPending}
											disabled={!previewCurrent || !formComplete}
											grow={0}
										/>
									</View>
								) : null}
							</View>
						</ModerationCard>
					) : null}
				</ScrollView>
			</ScreenColumn>
		</ModerationScreen>
	);
}

function Field({
	label,
	value,
	onChangeText,
	keyboardType,
	suffix,
}: {
	label: string;
	value: string;
	onChangeText: (value: string) => void;
	keyboardType?: "number-pad";
	suffix?: string;
}): React.JSX.Element {
	const c = useModerationTheme();
	const multiline = keyboardType === undefined;
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.text }]}>{label}</Text>
			<View
				style={[
					styles.inputWrap,
					{ backgroundColor: c.bg, borderColor: c.border },
				]}
			>
				<TextInput
					accessibilityLabel={label}
					multiline={multiline}
					keyboardType={keyboardType}
					value={value}
					onChangeText={onChangeText}
					style={[
						styles.input,
						multiline && styles.inputMultiline,
						{ color: c.text },
					]}
				/>
				{suffix ? (
					<Text style={[styles.suffix, { color: c.muted }]}>{suffix}</Text>
				) : null}
			</View>
		</View>
	);
}

function Choice<T extends string>({
	title,
	values,
	selected,
	label,
	onSelect,
	c,
}: {
	title: string;
	values: readonly T[];
	selected: T;
	label: (value: T) => string;
	onSelect: (value: T) => void;
	c: ModerationPalette;
}) {
	const k = tonesOf(c);
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.text }]}>{title}</Text>
			<View style={styles.choices} accessibilityRole="radiogroup">
				{values.map((value) => {
					const on = value === selected;
					return (
						<Pressable
							key={value}
							accessibilityRole="radio"
							accessibilityState={{ checked: on }}
							onPress={() => onSelect(value)}
							style={[
								styles.choice,
								{
									borderColor: on ? k.linkText : c.border,
									backgroundColor: on ? k.selectedSoft : c.card,
								},
							]}
						>
							{on ? (
								<Ionicons name="checkmark" size={16} color={k.linkText} />
							) : null}
							<Text
								style={[
									styles.choiceLabel,
									{
										color: on ? k.linkText : c.text,
										fontFamily: on ? Fonts.bodySemibold : Fonts.body,
									},
								]}
							>
								{label(value)}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function Toggle({
	label,
	enabled,
	onPress,
	c,
}: {
	label: string;
	enabled: boolean;
	onPress: () => void;
	c: ModerationPalette;
}) {
	const k = tonesOf(c);
	return (
		<Pressable
			accessibilityRole="switch"
			accessibilityState={{ checked: enabled }}
			accessibilityLabel={label}
			onPress={onPress}
			style={[styles.toggle, { borderColor: c.border }]}
		>
			<Text style={[styles.toggleLabel, { color: c.text }]}>{label}</Text>
			<View
				importantForAccessibility="no-hide-descendants"
				accessibilityElementsHidden
			>
				<Switch
					value={enabled}
					onValueChange={onPress}
					trackColor={{
						false: k.strongBorder,
						true: k.primaryFill,
					}}
					thumbColor={k.onFill}
					ios_backgroundColor={k.strongBorder}
				/>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: { padding: 16, paddingBottom: 40, gap: 14 },
	priceTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
	priceText: {
		color: Colors.light.sunForeground,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 15,
		lineHeight: 19,
	},
	lead: { fontFamily: Fonts.bodySemibold, fontSize: 16, lineHeight: 22 },
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 21 },
	meta: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
	buttons: { gap: 8, marginTop: 4 },
	proofRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
	form: { gap: 18 },
	field: { gap: 8 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 20 },
	inputWrap: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1.5,
		borderRadius: 12,
		minHeight: 48,
		paddingHorizontal: 14,
	},
	input: {
		flex: 1,
		fontFamily: Fonts.body,
		fontSize: 16,
		lineHeight: 22,
		paddingVertical: 12,
	},
	inputMultiline: { minHeight: 72, textAlignVertical: "top" },
	suffix: { fontFamily: Fonts.bodySemibold, fontSize: 14, marginLeft: 8 },
	choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	choice: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	choiceLabel: { fontSize: 14, lineHeight: 19 },
	toggle: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 56,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderBottomWidth: StyleSheet.hairlineWidth,
		paddingVertical: 6,
	},
	toggleLabel: {
		flex: 1,
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 20,
	},
	preview: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
	previewTotal: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 23 },
});
