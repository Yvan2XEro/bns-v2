import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import {
	useModerationDispute,
	useModerationDisputeAction,
	usePreviewDisputeOutcome,
} from "@/src/hooks/useModerationDisputes";
import { useTranslation } from "@/src/lib/i18n";
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

export default function ModerationDisputeDetailScreen() {
	const c = useModerationTheme();
	const { t, i18n } = useTranslation();
	const params = useLocalSearchParams<{ id: string }>();
	const id = Array.isArray(params.id) ? params.id[0] : params.id;
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
					<EmptyState
						illustration="notFound"
						title={t("moderationDisputes.loadError")}
						ctaLabel={t("common.retry")}
						onCta={() => void detail.refetch()}
					/>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
				)}
			</ModerationScreen>
		);
	}

	const sheet = detail.data;
	const dispute = sheet.dispute;
	const locale = i18n.language === "en" ? "en" : "fr";
	const previewDecision = () => {
		if (!Number.isSafeInteger(refundAmount) || refundAmount < 0) return;
		preview.mutate(refundAmount);
	};
	const resolve = () => {
		if (!previewCurrent) return;
		action.mutate({
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
		});
	};
	const assign = () => action.mutate({ action: "assign" });

	return (
		<ModerationScreen
			title={t("moderationDisputes.detailTitle")}
			subtitle={dispute.number}
		>
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				{action.isError || preview.isError ? (
					<Text
						accessibilityRole="alert"
						style={[styles.error, { color: c.danger }]}
					>
						{t("moderationDisputes.actionError")}
					</Text>
				) : null}
				{action.isSuccess ? (
					<Text style={[styles.notice, { color: c.success }]}>
						{t("moderationDisputes.actionSaved")}
					</Text>
				) : null}
				<Card title={t("moderationDisputes.caseSummary")} c={c}>
					<Body
						text={`${t("disputes.order", { number: dispute.orderNumber })} · ${t(`disputes.reason.${dispute.reason}`)}`}
						color={c.text}
					/>
					<Body
						text={`${t(`disputes.status.${dispute.status}`)} · ${dispute.amountAtStake.toLocaleString(locale)} XAF`}
						color={c.muted}
					/>
					<Body
						text={`${t("moderationDisputes.buyerDisputes")}: ${sheet.partyHistory.buyerDisputes12m}`}
						color={c.muted}
					/>
					<Body
						text={`${t("moderationDisputes.buyerRefusals")}: ${sheet.partyHistory.buyerRefusalScore}`}
						color={c.muted}
					/>
					<Body
						text={`${t("moderationDisputes.shopLossRate")}: ${sheet.partyHistory.shopDisputeLossRate === null ? "—" : `${Math.round(sheet.partyHistory.shopDisputeLossRate * 100)}%`}`}
						color={c.muted}
					/>
					<Pressable
						accessibilityRole="button"
						style={[styles.outlineButton, { borderColor: c.border }]}
						onPress={() =>
							router.push({
								pathname: "/disputes/[id]",
								params: { id: dispute.id },
							})
						}
					>
						<Text style={[styles.buttonLabel, { color: c.primary }]}>
							{t("moderationDisputes.openThread")}
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						disabled={action.isPending}
						style={[styles.outlineButton, { borderColor: c.border }]}
						onPress={assign}
					>
						<Text style={[styles.buttonLabel, { color: c.primary }]}>
							{t("moderationDisputes.assignToMe")}
						</Text>
					</Pressable>
				</Card>
				<Card title={t("moderationDisputes.proofChecklist")} c={c}>
						{sheet.proofChecklist.map((row) => (
							<Body
								key={row.requirement}
								text={`${t(`moderationDisputes.proof.${row.requirement}`)}: ${row.established ? t("moderationDisputes.proven") : t("moderationDisputes.notProven")}${row.source ? ` · ${row.source}` : ""}`}
								color={row.established ? c.success : c.muted}
							/>
						))}
				</Card>
				{dispute.status === "under_review" ? (
					<Card title={t("moderationDisputes.resolveTitle")} c={c}>
						<Choice
							title={t("moderationDisputes.outcome")}
							values={outcomes}
							selected={form.outcome}
							label={(value) => t(`disputes.status.${value}`)}
							onSelect={(outcome) => patch({ outcome })}
							c={c}
						/>
						<Field
							label={t("moderationDisputes.refundAmount")}
							value={form.refund}
							keyboardType="number-pad"
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
							onPress={() => patch({ returnRequired: !form.returnRequired })}
							c={c}
						/>
						{form.returnRequired ? (
							<Choice
								title={t("moderationDisputes.returnShippingPayer")}
								values={["seller", "buyer"] as const}
								selected={form.returnShippingPaidBy}
								label={(value) => t(`moderationDisputes.liability.${value}`)}
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
						<Pressable
							accessibilityRole="button"
							disabled={
								preview.isPending ||
								!Number.isSafeInteger(refundAmount) ||
								refundAmount < 0
							}
							onPress={previewDecision}
							style={[styles.primaryButton, { backgroundColor: c.primary }]}
						>
							{preview.isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.primaryLabel}>
									{t("moderationDisputes.preview")}
								</Text>
							)}
						</Pressable>
						{preview.data ? (
							<View
								style={[
									styles.preview,
									{ backgroundColor: c.bg, borderColor: c.border },
								]}
							>
								<Body
									text={t("moderationDisputes.previewRefund", {
										amount: preview.data.refundAmount.toLocaleString(locale),
									})}
									color={c.text}
								/>
								<Body
									text={t("moderationDisputes.previewBreakdown", {
										goods: preview.data.breakdown.goods.toLocaleString(locale),
										delivery:
											preview.data.breakdown.outboundDelivery.toLocaleString(
												locale,
											),
										protection:
											preview.data.breakdown.buyerProtectionFee.toLocaleString(
												locale,
											),
									})}
									color={c.muted}
								/>
								<Pressable
									accessibilityRole="button"
									disabled={
										!previewCurrent ||
										action.isPending ||
										!form.note.trim() ||
										!form.statementFr.trim() ||
										!form.statementEn.trim()
									}
									onPress={resolve}
									style={[styles.primaryButton, { backgroundColor: c.danger }]}
								>
									{action.isPending ? (
										<ActivityIndicator color="#fff" />
									) : (
										<Text style={styles.primaryLabel}>
											{t("moderationDisputes.confirmResolve")}
										</Text>
									)}
								</Pressable>
							</View>
						) : null}
					</Card>
				) : null}
			</ScrollView>
		</ModerationScreen>
	);
}

function Card({
	title,
	c,
	children,
}: {
	title: string;
	c: ReturnType<typeof useModerationTheme>;
	children: React.ReactNode;
}) {
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>{title}</Text>
			{children}
		</View>
	);
}

function Body({ text, color }: { text: string; color: string }) {
	return <Text style={[styles.body, { color }]}>{text}</Text>;
}

function Field({
	label,
	value,
	onChangeText,
	keyboardType,
}: {
	label: string;
	value: string;
	onChangeText: (value: string) => void;
	keyboardType?: "number-pad";
}): React.JSX.Element {
	const c = useModerationTheme();
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.text }]}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				multiline={keyboardType === undefined}
				keyboardType={keyboardType}
				value={value}
				onChangeText={onChangeText}
				style={[styles.input, { color: c.text, borderColor: c.border }]}
			/>
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
	c: ReturnType<typeof useModerationTheme>;
}) {
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.text }]}>{title}</Text>
			<View style={styles.choices}>
				{values.map((value) => (
					<Pressable
						key={value}
						accessibilityRole="button"
						accessibilityState={{ selected: value === selected }}
						onPress={() => onSelect(value)}
						style={[
							styles.choice,
							{
								borderColor: value === selected ? c.primary : c.border,
								backgroundColor: value === selected ? c.primary : c.bg,
							},
						]}
					>
						<Text
							style={[
								styles.choiceLabel,
								{ color: value === selected ? "#fff" : c.text },
							]}
						>
							{label(value)}
						</Text>
					</Pressable>
				))}
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
	c: ReturnType<typeof useModerationTheme>;
}) {
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityState={{ checked: enabled }}
			onPress={onPress}
			style={[styles.outlineButton, { borderColor: c.border }]}
		>
			<Ionicons
				name={enabled ? "checkbox" : "square-outline"}
				size={19}
				color={c.primary}
			/>
			<Text style={[styles.buttonLabel, { color: c.text }]}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, paddingBottom: 36, gap: 14 },
	card: { borderRadius: 14, borderWidth: 1, padding: 15, gap: 12 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 17 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
	error: { fontFamily: Fonts.bodySemibold },
	notice: { fontFamily: Fonts.bodySemibold },
	field: { gap: 6 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	input: {
		borderWidth: 1,
		borderRadius: 10,
		minHeight: 44,
		padding: 10,
		textAlignVertical: "top",
	},
	choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
	choice: {
		borderWidth: 1,
		borderRadius: 18,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	choiceLabel: { fontFamily: Fonts.body, fontSize: 12 },
	outlineButton: {
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 10,
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		minHeight: 44,
		padding: 10,
	},
	buttonLabel: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	primaryButton: {
		alignItems: "center",
		borderRadius: 10,
		justifyContent: "center",
		minHeight: 46,
		padding: 12,
	},
	primaryLabel: { color: "#fff", fontFamily: Fonts.bodySemibold },
	preview: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 },
});
