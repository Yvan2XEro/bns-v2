import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, TextInput } from "react-native";
import { Fonts } from "@/constants/theme";
import { useContestDelivery } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { type ContestValues, contestSchema } from "@/src/lib/purchaseForms";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { FieldError, PurchaseButton, purchaseText, Sheet } from "./ui";

/** The window it states is `deadlines.contestBy`; the server owns whether it is still open. */
export function ContestSheet({
	order,
	visible,
	onClose,
}: {
	order: Pick<OrderView, "id" | "deadlines">;
	visible: boolean;
	onClose: () => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const contest = useContestDelivery(order.id);
	const { control, handleSubmit, formState, setError } = useForm<ContestValues>(
		{ resolver: zodResolver(contestSchema), defaultValues: { note: "" } },
	);
	const contestBy = order.deadlines.contestBy;

	const onSubmit = handleSubmit(async ({ note }) => {
		try {
			await contest.mutateAsync(note ? { note } : {});
			onClose();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	});

	return (
		<Sheet
			visible={visible}
			title={t("purchases.contestDelivery")}
			body={t("purchases.contestBody")}
			onClose={onClose}
			closeLabel={t("purchases.dismiss")}
		>
			{contestBy ? (
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.contestWindow", {
						date: formatOrderDate(contestBy, lang),
					})}
				</Text>
			) : null}
			<Controller
				control={control}
				name="note"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						multiline
						maxLength={500}
						accessibilityLabel={t("purchases.contestNote")}
						placeholder={t("purchases.contestNote")}
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
			<FieldError message={formState.errors.root?.message} />
			<PurchaseButton
				label={t("purchases.contestSubmit")}
				pending={contest.isPending}
				onPress={onSubmit}
			/>
		</Sheet>
	);
}

const styles = StyleSheet.create({
	input: {
		minHeight: 96,
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlignVertical: "top",
	},
});
