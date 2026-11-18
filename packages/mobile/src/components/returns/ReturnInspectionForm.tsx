import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";
import { useReturnAction } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { INSPECTION_OUTCOME_LABELS } from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { currencyCode } from "@/src/lib/market";
import {
	createReturnInspectionFormSchema,
	RETURN_INSPECTION_OUTCOMES,
	type ReturnInspectionFormInput,
	type ReturnInspectionFormOutput,
} from "../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../api/src/contracts/returns";
import { caseForm } from "../checkout/caseForm";
import { fillOf } from "../checkout/fill";
import { useShopTheme } from "../shop/theme";
import { ReturnEvidenceUpload } from "./ReturnEvidenceUpload";

export function ReturnInspectionForm({ view }: { view: ReturnCaseView }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const submit = useReturnAction(view.id);
	const form = useForm<
		ReturnInspectionFormInput,
		undefined,
		ReturnInspectionFormOutput
	>({
		resolver: zodResolver(
			createReturnInspectionFormSchema(view.basis, view.items),
		),
		defaultValues: {
			items: view.items.map((item) => ({
				orderItemId: item.orderItemId,
				outcome: "",
				deductionAmount: "0",
				note: "",
				evidenceIds: [],
			})),
		},
	});
	const send = form.handleSubmit(async (body) => {
		try {
			await submit.mutateAsync({ action: "inspect", body });
		} catch (error) {
			form.setError("root", { message: resolveErrorMessage(error, t) });
		}
	});
	return (
		<View style={{ gap: 16 }}>
			<Text
				style={[caseForm.heading, { color: c.text }]}
				accessibilityRole="header"
			>
				{t("returns.action.inspect")}
			</Text>
			{view.items.map((item, index) => (
				<View
					key={item.orderItemId}
					style={{
						gap: 10,
						padding: 12,
						borderColor: c.border,
						borderWidth: 1,
						borderRadius: 12,
					}}
				>
					<Text style={[caseForm.body, { color: c.text }]}>
						{item.title} × {item.quantity}
					</Text>
					<Text style={[caseForm.label, { color: c.body }]}>
						{t("returns.inspectionOutcome")}
					</Text>
					<Controller
						control={form.control}
						name={`items.${index}.outcome`}
						render={({ field }) => (
							<View style={{ gap: 6 }}>
								{RETURN_INSPECTION_OUTCOMES.map((outcome) => (
									<Pressable
										key={outcome}
										accessibilityRole="radio"
										accessibilityState={{
											checked: field.value === outcome,
											disabled: submit.isPending,
										}}
										accessibilityLabel={t(INSPECTION_OUTCOME_LABELS[outcome])}
										disabled={submit.isPending}
										onPress={() => field.onChange(outcome)}
										style={{
											minHeight: 48,
											justifyContent: "center",
											padding: 10,
											borderRadius: 12,
											borderWidth: 1.5,
											borderColor:
												field.value === outcome ? c.primary : c.border,
											backgroundColor:
												field.value === outcome ? c.primarySoft : c.card,
										}}
									>
										<Text style={[caseForm.body, { color: c.text }]}>
											{t(INSPECTION_OUTCOME_LABELS[outcome])}
										</Text>
									</Pressable>
								))}
							</View>
						)}
					/>
					<Controller
						control={form.control}
						name={`items.${index}.deductionAmount`}
						render={({ field }) => (
							<TextInput
								accessibilityLabel={t("returns.deductionAmount", {
									currency: currencyCode(),
								})}
								placeholder={t("returns.deductionAmount", {
									currency: currencyCode(),
								})}
								placeholderTextColor={c.muted}
								keyboardType="number-pad"
								value={field.value}
								onBlur={field.onBlur}
								onChangeText={field.onChange}
								editable={view.basis !== "non_conformity" && !submit.isPending}
								style={{
									minHeight: 48,
									color: c.text,
									...caseForm.input,
									backgroundColor: c.input,
									borderColor: c.border,
									borderWidth: 1,
									padding: 10,
									borderRadius: 12,
								}}
							/>
						)}
					/>
					{view.basis === "non_conformity" ? (
						<Text style={[caseForm.meta, { color: c.muted }]}>
							{t("returns.deductionUnavailable")}
						</Text>
					) : null}
					<Controller
						control={form.control}
						name={`items.${index}.note`}
						render={({ field }) => (
							<TextInput
								accessibilityLabel={t("returns.inspectionNote")}
								placeholder={t("returns.inspectionNote")}
								placeholderTextColor={c.muted}
								value={field.value}
								onBlur={field.onBlur}
								onChangeText={field.onChange}
								editable={!submit.isPending}
								multiline
								maxLength={1000}
								textAlignVertical="top"
								style={{
									minHeight: 80,
									color: c.text,
									...caseForm.input,
									backgroundColor: c.input,
									borderColor: c.border,
									borderWidth: 1,
									padding: 10,
									borderRadius: 12,
								}}
							/>
						)}
					/>
					<Controller
						control={form.control}
						name={`items.${index}.evidenceIds`}
						render={({ field }) => (
							<ReturnEvidenceUpload
								caseId={view.id}
								kind="photo"
								evidenceIds={field.value}
								onChange={field.onChange}
							/>
						)}
					/>
					{form.formState.errors.items?.[index] ? (
						<Text
							accessibilityRole="alert"
							style={[caseForm.error, { color: c.dangerText }]}
						>
							{t("returns.inspectionValidation")}
						</Text>
					) : null}
				</View>
			))}
			{form.formState.errors.root ? (
				<Text
					accessibilityRole="alert"
					style={[caseForm.error, { color: c.dangerText }]}
				>
					{form.formState.errors.root.message}
				</Text>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("returns.action.inspect")}
				disabled={submit.isPending}
				onPress={() => void send()}
				style={{
					minHeight: 52,
					justifyContent: "center",
					alignItems: "center",
					opacity: submit.isPending ? 0.5 : 1,
					backgroundColor: fillOf(c).bg,
					borderRadius: 12,
				}}
			>
				<Text style={[caseForm.buttonText, { color: fillOf(c).fg }]}>
					{t("returns.action.inspect")}
				</Text>
			</Pressable>
		</View>
	);
}
