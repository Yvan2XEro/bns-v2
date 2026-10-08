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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useOpenDispute } from "@/src/hooks/useDisputes";
import { usePurchase } from "@/src/hooks/usePurchases";
import { requestedDisputeAmount } from "@/src/lib/disputeReport";
import { useTranslation } from "@/src/lib/i18n";
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
	const dark = useColorScheme() === "dark";
	const { t } = useTranslation();
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
	const c = {
		bg: dark ? "#0b1120" : "#f8fafc",
		card: dark ? "#111c2e" : "#fff",
		text: dark ? "#e2e8f0" : "#0f172a",
		muted: dark ? "#94a3b8" : "#64748b",
		border: dark ? "#1e3a5f" : "#e2e8f0",
		primary: dark ? "#60a5fa" : "#1e40af",
	};

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
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: c.border }]}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
					onPress={() =>
						step ? setStep((current) => current - 1) : router.back()
					}
					hitSlop={12}
				>
					<Ionicons name="arrow-back" size={22} color={c.text} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: c.text }]}>
					{t("disputes.reportTitle")}
				</Text>
				<Text style={[styles.step, { color: c.muted }]}>{step + 1}/5</Text>
			</View>
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				<Text style={[styles.subtitle, { color: c.muted }]}>
					{t("disputes.reportStep", { step: step + 1 })}
				</Text>
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
									<View style={styles.choices}>
										{BUYER_DISPUTE_REASONS.map((reason) => (
											<Choice
												key={reason}
												selected={value === reason}
												label={t(`disputes.reason.${reason}`)}
												color={c.text}
												border={c.border}
												primary={c.primary}
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
											{ color: c.text, borderColor: c.border },
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
												label={t(`disputes.outcome.${outcome}`)}
												color={c.text}
												border={c.border}
												primary={c.primary}
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
											{ color: c.text, borderColor: c.border },
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
													color={c.text}
													border={c.border}
													primary={c.primary}
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
								{t(`disputes.reason.${form.getValues("reason")}`)}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{form.getValues("description")}
							</Text>
							<Text style={[styles.body, { color: c.muted }]}>
								{t(`disputes.outcome.${form.getValues("requestedOutcome")}`)}
							</Text>
						</>
					) : null}
				</View>
				{open.isError ? (
					<Text accessibilityRole="alert" style={styles.error}>
						{t("disputes.openError")}
					</Text>
				) : null}
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
			</ScrollView>
		</SafeAreaView>
	);
}

function Choice({
	selected,
	label,
	color,
	border,
	primary,
	role = "radio",
	onPress,
}: {
	selected: boolean;
	label: string;
	color: string;
	border: string;
	primary: string;
	role?: "radio" | "checkbox";
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole={role}
			accessibilityState={{ selected }}
			onPress={onPress}
			style={[
				styles.choice,
				{
					borderColor: selected ? primary : border,
					backgroundColor: selected ? `${primary}18` : "transparent",
				},
			]}
		>
			<Text style={[styles.body, { color: selected ? primary : color }]}>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 14,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	headerTitle: { flex: 1, fontFamily: Fonts.displaySemibold, fontSize: 17 },
	step: { fontFamily: Fonts.bodySemibold },
	content: { padding: 16, paddingBottom: 32, gap: 14 },
	subtitle: { fontFamily: Fonts.body, fontSize: 14 },
	card: { borderRadius: 14, borderWidth: 1, gap: 13, padding: 16 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 17 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21 },
	choices: { gap: 8 },
	choice: {
		borderRadius: 10,
		borderWidth: 1,
		minHeight: 44,
		justifyContent: "center",
		padding: 11,
	},
	input: { borderRadius: 10, borderWidth: 1, minHeight: 44, padding: 11 },
	multiline: { minHeight: 150, textAlignVertical: "top" },
	error: { color: "#dc2626", fontFamily: Fonts.bodySemibold },
	button: {
		alignItems: "center",
		borderRadius: 10,
		justifyContent: "center",
		minHeight: 48,
		padding: 12,
	},
	buttonText: { color: "#fff", fontFamily: Fonts.bodySemibold },
});
