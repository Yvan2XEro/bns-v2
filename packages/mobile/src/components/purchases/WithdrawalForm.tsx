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
import { inkOf } from "../checkout/fill";
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
				<Ionicons name={icon} size={20} color={inkOf(c)} />
			</Pressable>
		);
	};
	return (
		<View style={styles.stepper}>
			{step(-1, "remove", t("purchases.withdrawalLess", { title }))}
			<Text
				style={[styles.count, { color: c.text }]}
				accessibilityLiveRegion="polite"
			>
				{value}
			</Text>
			{step(1, "add", t("purchases.withdrawalMore", { title }))}
		</View>
	);
}

/**
 * One line of one unit is the whole order: it starts selected, so the
 * buyer does not have to find "+" before the button works.
 */
function startingValues(items: Pick<OrderView, "items">["items"]) {
	const values = withdrawalDefaults(items);
	if (values.items.length === 1 && values.items[0].max === 1) {
		values.items[0] = { ...values.items[0], quantity: 1 };
	}
	return values;
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
			defaultValues: startingValues(order.items),
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
						<View
							key={field.id}
							style={[
								styles.line,
								index > 0 && {
									borderTopWidth: StyleSheet.hairlineWidth,
									borderTopColor: c.border,
									paddingTop: 12,
								},
							]}
						>
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

			<Card title={t("purchases.withdrawalReasonOptional")}>
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
							accessibilityLabel={t("purchases.withdrawalReasonOptional")}
							placeholder={t("purchases.withdrawalReasonPlaceholder")}
							placeholderTextColor={c.muted}
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
		width: 48,
		height: 48,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	count: {
		minWidth: 28,
		textAlign: "center",
		fontSize: 18,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	input: {
		minHeight: 112,
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.body,
		textAlignVertical: "top",
	},
});
