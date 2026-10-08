import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";
import { useReturnAction } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	createReturnInspectionFormSchema,
	RETURN_INSPECTION_OUTCOMES,
	type ReturnInspectionFormInput,
	type ReturnInspectionFormOutput,
} from "../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../api/src/contracts/returns";
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
			<Text style={{ color: c.text }}>{t("returns.action.inspect")}</Text>
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
					<Text style={{ color: c.text }}>
						{item.title} × {item.quantity}
					</Text>
					<Text style={{ color: c.body }}>
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
										accessibilityLabel={t(`returns.inspection.${outcome}`)}
										disabled={submit.isPending}
										onPress={() => field.onChange(outcome)}
										style={{
											minHeight: 44,
											justifyContent: "center",
											padding: 10,
											borderRadius: 8,
											borderWidth: 1,
											borderColor:
												field.value === outcome ? c.primary : c.border,
										}}
									>
										<Text style={{ color: c.text }}>
											{t(`returns.inspection.${outcome}`)}
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
								accessibilityLabel={t("returns.deductionAmount")}
								placeholder={t("returns.deductionAmount")}
								placeholderTextColor={c.muted}
								keyboardType="number-pad"
								value={field.value}
								onBlur={field.onBlur}
								onChangeText={field.onChange}
								editable={view.basis !== "non_conformity" && !submit.isPending}
								style={{
									minHeight: 44,
									color: c.text,
									borderColor: c.border,
									borderWidth: 1,
									padding: 10,
									borderRadius: 8,
								}}
							/>
						)}
					/>
					{view.basis === "non_conformity" ? (
						<Text style={{ color: c.muted }}>
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
								style={{
									minHeight: 80,
									color: c.text,
									borderColor: c.border,
									borderWidth: 1,
									padding: 10,
									borderRadius: 8,
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
						<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
							{t("returns.inspectionValidation")}
						</Text>
					) : null}
				</View>
			))}
			{form.formState.errors.root ? (
				<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
					{form.formState.errors.root.message}
				</Text>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("returns.action.inspect")}
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
				<Text style={{ color: "#fff" }}>{t("returns.action.inspect")}</Text>
			</Pressable>
		</View>
	);
}
