import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useRequestWithdrawal } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	type WithdrawalValues,
	withdrawalDefaults,
	withdrawalPayload,
	withdrawalSchema,
} from "@/src/lib/purchaseForms";
import type { OrderView, WithdrawalResponse } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { Card, FieldError, PurchaseButton, purchaseText } from "./ui";

function Stepper({
	value,
	max,
	title,
	onChange,
}: {
	value: number;
	max: number;
	title: string;
	onChange: (next: number) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const step = (delta: -1 | 1, icon: "remove" | "add", label: string) => {
		const off = delta < 0 ? value <= 0 : value >= max;
		return (
			<Pressable
				onPress={() => onChange(value + delta)}
				disabled={off}
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ disabled: off }}
				style={[styles.step, { borderColor: c.border, opacity: off ? 0.4 : 1 }]}
			>
				<Ionicons name={icon} size={20} color={c.primary} />
			</Pressable>
		);
	};
	return (
		<View style={styles.stepper}>
			{step(-1, "remove", t("purchases.withdrawalLess", { title }))}
			<Text style={[styles.count, { color: c.text }]}>{value}</Text>
			{step(1, "add", t("purchases.withdrawalMore", { title }))}
		</View>
	);
}

/** The item picker, the method in words and the reason, over one zod schema. */
export function WithdrawalForm({
	order,
	onSent,
}: {
	order: Pick<OrderView, "id" | "items">;
	onSent: (response: WithdrawalResponse) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const withdrawal = useRequestWithdrawal(order.id);
	const { control, formState, handleSubmit, setError } =
		useForm<WithdrawalValues>({
			resolver: zodResolver(withdrawalSchema),
			defaultValues: withdrawalDefaults(order.items),
		});
	const { fields } = useFieldArray({ control, name: "items" });

	const onSubmit = handleSubmit(async (values) => {
		try {
			onSent(await withdrawal.mutateAsync(withdrawalPayload(values)));
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	});

	const itemsError =
		formState.errors.items?.root?.message ?? formState.errors.items?.message;

	return (
		<>
			<Card title={t("purchases.withdrawalItems")}>
				{fields.map((field, index) => {
					const item = order.items[index];
					const title = item
						? [item.title, item.variantLabel].filter(Boolean).join(" — ")
						: "";
					return (
						<View key={field.id} style={styles.line}>
							<View style={styles.lineMain}>
								<Text style={[purchaseText.strong, { color: c.text }]}>
									{title}
								</Text>
								<Text style={[purchaseText.muted, { color: c.muted }]}>
									{t("purchases.withdrawalQuantity", { max: field.max })}
								</Text>
							</View>
							<Controller
								control={control}
								name={`items.${index}.quantity`}
								render={({ field: quantity }) => (
									<Stepper
										value={quantity.value}
										max={field.max}
										title={title}
										onChange={quantity.onChange}
									/>
								)}
							/>
						</View>
					);
				})}
				<FieldError message={itemsError ? t(itemsError) : null} />
			</Card>

			<Card title={t("purchases.withdrawalMethod")}>
				<Text style={[purchaseText.body, { color: c.body }]}>
					{t("purchases.withdrawalMethodBody")}
				</Text>
			</Card>

			<Card title={t("purchases.withdrawalReason")}>
				<Controller
					control={control}
					name="reasonText"
					render={({ field }) => (
						<TextInput
							value={field.value}
							onChangeText={field.onChange}
							onBlur={field.onBlur}
							multiline
							maxLength={2000}
							accessibilityLabel={t("purchases.withdrawalReason")}
							style={[
								styles.input,
								{
									color: c.text,
									backgroundColor: c.input,
									borderColor: c.border,
								},
							]}
						/>
					)}
				/>
			</Card>

			<FieldError message={formState.errors.root?.message} />
			<PurchaseButton
				label={t("purchases.withdrawalSubmit")}
				pending={withdrawal.isPending}
				onPress={onSubmit}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	line: { flexDirection: "row", alignItems: "center", gap: 12 },
	lineMain: { flex: 1, minWidth: 0, gap: 2 },
	stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
	step: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	count: {
		minWidth: 24,
		textAlign: "center",
		fontSize: 16,
		fontFamily: Fonts.bodyBold,
	},
	input: {
		minHeight: 80,
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlignVertical: "top",
	},
});
