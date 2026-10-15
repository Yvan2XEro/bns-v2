import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
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
import { PurchaseStatusPill } from "@/src/components/purchases/PurchaseRow";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { StepSegments } from "@/src/components/ui/StepSegments";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useOpenDispute } from "@/src/hooks/useDisputes";
import { usePurchase } from "@/src/hooks/usePurchases";
import {
	DISPUTE_OUTCOME_LABELS,
	DISPUTE_REASON_LABELS,
} from "@/src/lib/caseStatus";
import { requestedDisputeAmount } from "@/src/lib/disputeReport";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import {
	BUYER_DISPUTE_OUTCOMES,
	BUYER_DISPUTE_REASONS,
} from "../../../../api/src/contracts/disputes";

const problemSchema = z.object({
	reason: z.enum(BUYER_DISPUTE_REASONS),
	description: z.string().trim().min(20).max(2000),
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
	const [step, setStep] = useState(0);
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

	const submit = form.handleSubmit(async (values) => {
		const amount = requestedDisputeAmount(
			values.requestedOutcome,
			values.requestedAmount ?? "",
			order.data.amounts.total,
		);
		if (!amount.valid) {
			form.setError("requestedAmount", { message: amount.reason });
			setStep(2);
			return;
		}
		const result = await open.mutateAsync({
			reason: values.reason,
			subject: "goods",
			description: values.description,
			requestedOutcome: values.requestedOutcome,
			...(amount.amount !== undefined
				? { requestedAmount: amount.amount }
				: {}),
			items: values.items,
		});
		router.replace({ pathname: "/disputes/[id]", params: { id: result.id } });
	});
	const next = async () => {
		if (step === 0 && !form.getValues("reason")) return;
		if (step === 1 && !(await form.trigger("description"))) return;
		if (step === 2) {
			const amount = requestedDisputeAmount(
				form.getValues("requestedOutcome"),
				form.getValues("requestedAmount") ?? "",
				order.data.amounts.total,
			);
			if (!amount.valid) {
				form.setError("requestedAmount", { message: amount.reason });
				return;
			}
		}
		if (step === 3 && !(await form.trigger("items"))) return;
		setStep((current) => Math.min(4, current + 1));
	};

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("disputes.reportTitle")}
				subtitle={t("purchases.orderNumber", {
					number: order.data.orderNumber,
				})}
				onBack={() =>
					step ? setStep((current) => current - 1) : router.back()
				}
			/>
			<StepSegments count={5} current={step} />
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
					<View style={[styles.orderIcon, { backgroundColor: c.primarySoft }]}>
						<Ionicons name="bag-handle-outline" size={20} color={c.primary} />
					</View>
					<View style={{ flex: 1, minWidth: 0 }}>
						<Text
							style={[styles.orderTitle, { color: c.text }]}
							numberOfLines={1}
						>
							{order.data.items[0]?.title ?? order.data.orderNumber}
						</Text>
						<Text
							style={[styles.orderMeta, { color: c.muted }]}
							numberOfLines={1}
						>
							{order.data.shop.name} ·{" "}
							{formatXaf(order.data.amounts.total, lang)}
						</Text>
					</View>
					<PurchaseStatusPill status={order.data.status} />
				</View>
				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					{step === 0 ? (
						<>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.reportReason")}
							</Text>
							<Controller
								control={form.control}
								name="reason"
								render={({ field: { onChange, value } }) => (
									<View style={styles.grid}>
										{BUYER_DISPUTE_REASONS.map((reason) => (
											<Choice
												key={reason}
												selected={value === reason}
												label={t(DISPUTE_REASON_LABELS[reason])}
												onPress={() => onChange(reason)}
											/>
										))}
									</View>
								)}
							/>
						</>
					) : null}
					{step === 1 ? (
						<>
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
										maxLength={2000}
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
								<Text style={styles.error}>
									{t("disputes.descriptionError")}
								</Text>
							) : null}
						</>
					) : null}
					{step === 2 ? (
						<>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.reportOutcome")}
							</Text>
							<Controller
								control={form.control}
								name="requestedOutcome"
								render={({ field: { onChange, value } }) => (
									<View style={styles.choices}>
										{BUYER_DISPUTE_OUTCOMES.map((outcome) => (
											<Choice
												key={outcome}
												selected={value === outcome}
												label={t(DISPUTE_OUTCOME_LABELS[outcome])}
												onPress={() => onChange(outcome)}
											/>
										))}
									</View>
								)}
							/>
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
							{form.formState.errors.requestedAmount ? (
								<Text style={styles.error}>
									{t(
										`disputes.amountError.${form.formState.errors.requestedAmount.message}`,
									)}
								</Text>
							) : null}
						</>
					) : null}
					{step === 3 ? (
						<>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.reportItems")}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t("disputes.selectAffectedItems")}
							</Text>
							<Controller
								control={form.control}
								name="items"
								render={({ field: { onChange, value } }) => (
									<View style={styles.choices}>
										{order.data.items.map((item) => {
											const selected = value.some(
												(row) => row.orderItemId === item.id,
											);
											return (
												<Choice
													key={item.id}
													selected={selected}
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
							{form.formState.errors.items ? (
								<Text style={styles.error}>{t("disputes.itemsRequired")}</Text>
							) : null}
						</>
					) : null}
					{step === 4 ? (
						<>
							<Text style={[styles.title, { color: c.text }]}>
								{t("disputes.reportReview")}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t("purchases.orderNumber", { number: order.data.orderNumber })}
							</Text>
							<Text style={[styles.body, { color: c.text }]}>
								{t(DISPUTE_REASON_LABELS[form.getValues("reason")])}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{form.getValues("description")}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t(DISPUTE_OUTCOME_LABELS[form.getValues("requestedOutcome")])}
							</Text>
						</>
					) : null}
				</View>
				{step === 4 ? (
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
				) : null}
				{open.isError ? (
					<Text accessibilityRole="alert" style={styles.error}>
						{t("disputes.openError")}
					</Text>
				) : null}
			</ScrollView>
			<View
				style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Pressable
					accessibilityRole="button"
					disabled={open.isPending}
					onPress={step === 4 ? () => void submit() : () => void next()}
					style={[styles.button, { backgroundColor: c.primary }]}
				>
					<Text style={styles.buttonText}>
						{open.isPending
							? t("common.loading")
							: step === 4
								? t("disputes.submitReport")
								: t("common.continue")}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

function Choice({
	selected,
	label,
	role = "radio",
	onPress,
}: {
	selected: boolean;
	label: string;
	role?: "radio" | "checkbox";
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
			accessibilityState={{ checked: selected }}
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
	button: {
		alignItems: "center",
		borderRadius: 14,
		justifyContent: "center",
		minHeight: 52,
		padding: 12,
	},
	buttonText: { color: "#fff", fontFamily: Fonts.displayBold, fontSize: 16 },
});
