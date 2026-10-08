import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";
import { useReturnAction } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { REFUND_METHOD_LABELS } from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import {
	RETURN_REFUND_METHODS,
	type ReturnRefundProofFormInput,
	type ReturnRefundProofInput,
	returnRefundProofFormSchema,
} from "../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../api/src/contracts/returns";
import { useShopTheme } from "../shop/theme";
import { ReturnEvidenceUpload } from "./ReturnEvidenceUpload";

export function ReturnRefundProofForm({ view }: { view: ReturnCaseView }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const submit = useReturnAction(view.id);
	const form = useForm<
		ReturnRefundProofFormInput,
		undefined,
		ReturnRefundProofInput
	>({
		resolver: zodResolver(returnRefundProofFormSchema),
		defaultValues: {
			amount: String(view.refund.amount),
			method: "cash",
			transactionId: "",
			evidenceIds: [],
		},
	});
	const send = form.handleSubmit(async (body) => {
		if (body.amount < view.refund.amount) {
			form.setError("amount", {
				message: t("returns.refundTooLow", { amount: view.refund.amount }),
			});
			return;
		}
		try {
			await submit.mutateAsync({ action: "refund_proof", body });
		} catch (error) {
			form.setError("root", { message: resolveErrorMessage(error, t) });
		}
	});
	return (
		<View style={{ gap: 12 }}>
			<Text style={{ color: c.text }}>{t("returns.refundProof")}</Text>
			<Text style={{ color: c.body }}>
				{t("returns.refundProofInstructions")}
			</Text>
			<Controller
				control={form.control}
				name="method"
				render={({ field }) => (
					<View style={{ gap: 6 }}>
						{RETURN_REFUND_METHODS.map((method) => (
							<Pressable
								key={method}
								accessibilityRole="radio"
								accessibilityState={{
									checked: field.value === method,
									disabled: submit.isPending,
								}}
								accessibilityLabel={t(REFUND_METHOD_LABELS[method])}
								disabled={submit.isPending}
								onPress={() => field.onChange(method)}
								style={{
									minHeight: 44,
									justifyContent: "center",
									padding: 10,
									borderWidth: 1,
									borderColor: field.value === method ? c.primary : c.border,
									borderRadius: 8,
								}}
							>
								<Text style={{ color: c.text }}>
									{t(REFUND_METHOD_LABELS[method])}
								</Text>
							</Pressable>
						))}
					</View>
				)}
			/>
			<Controller
				control={form.control}
				name="amount"
				render={({ field }) => (
					<TextInput
						accessibilityLabel={t("returns.refundAmountLabel")}
						placeholder={t("returns.refundAmountLabel")}
						placeholderTextColor={c.muted}
						value={field.value}
						onBlur={field.onBlur}
						onChangeText={field.onChange}
						editable={!submit.isPending}
						keyboardType="number-pad"
						style={{
							minHeight: 44,
							padding: 10,
							borderWidth: 1,
							borderColor: c.border,
							borderRadius: 8,
							color: c.text,
						}}
					/>
				)}
			/>
			<Controller
				control={form.control}
				name="transactionId"
				render={({ field }) => (
					<TextInput
						accessibilityLabel={t("returns.transactionId")}
						placeholder={t("returns.transactionId")}
						placeholderTextColor={c.muted}
						value={field.value}
						onBlur={field.onBlur}
						onChangeText={field.onChange}
						editable={!submit.isPending}
						maxLength={200}
						style={{
							minHeight: 44,
							padding: 10,
							borderWidth: 1,
							borderColor: c.border,
							borderRadius: 8,
							color: c.text,
						}}
					/>
				)}
			/>
			<Controller
				control={form.control}
				name="evidenceIds"
				render={({ field }) => (
					<ReturnEvidenceUpload
						caseId={view.id}
						kind="payment_proof"
						evidenceIds={field.value}
						onChange={field.onChange}
					/>
				)}
			/>
			{form.formState.errors.amount ||
			form.formState.errors.method ||
			form.formState.errors.transactionId ||
			form.formState.errors.evidenceIds ? (
				<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
					{form.formState.errors.amount?.message ??
						t("returns.refundProofValidation")}
				</Text>
			) : null}
			{form.formState.errors.root ? (
				<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
					{form.formState.errors.root.message}
				</Text>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("returns.action.refund_proof")}
				disabled={submit.isPending}
				onPress={() => void send()}
				style={{
					minHeight: 44,
					justifyContent: "center",
					alignItems: "center",
					backgroundColor: c.primary,
					borderRadius: 10,
				}}
			>
				<Text style={{ color: "#fff" }}>
					{t("returns.action.refund_proof")}
				</Text>
			</Pressable>
		</View>
	);
}
