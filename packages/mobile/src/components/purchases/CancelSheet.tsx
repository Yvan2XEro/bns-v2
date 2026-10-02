import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text } from "react-native";
import { useCancelOrder } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	BUYER_CANCEL_REASONS,
	type CancelValues,
	cancelSchema,
} from "@/src/lib/purchaseForms";
import { useShopTheme } from "../shop/theme";
import { FieldError, PurchaseButton, purchaseText, Sheet } from "./ui";

/** Exactly the two reasons the API stores; the route refuses any other, or none. */
export function CancelSheet({
	orderId,
	visible,
	onClose,
}: {
	orderId: string;
	visible: boolean;
	onClose: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const cancel = useCancelOrder(orderId);
	const { control, formState, handleSubmit, setError } = useForm<CancelValues>({
		resolver: zodResolver(cancelSchema),
	});

	const onSubmit = handleSubmit(async (values) => {
		try {
			await cancel.mutateAsync(values);
			onClose();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	});

	const reasonError = formState.errors.reason?.message;

	return (
		<Sheet
			visible={visible}
			title={t("purchases.cancelConfirm")}
			onClose={onClose}
			closeLabel={t("purchases.dismiss")}
		>
			<Text style={[purchaseText.label, { color: c.text }]}>
				{t("purchases.cancelReason")}
			</Text>
			<Controller
				control={control}
				name="reason"
				render={({ field }) => (
					<>
						{BUYER_CANCEL_REASONS.map((reason) => {
							const selected = field.value === reason.value;
							return (
								<Pressable
									key={reason.value}
									onPress={() => field.onChange(reason.value)}
									accessibilityRole="radio"
									accessibilityState={{ checked: selected }}
									accessibilityLabel={t(reason.labelKey)}
									style={[
										styles.option,
										{
											borderColor: selected ? c.primary : c.border,
											backgroundColor: selected ? c.primarySoft : "transparent",
										},
									]}
								>
									<Ionicons
										name={selected ? "radio-button-on" : "radio-button-off"}
										size={20}
										color={selected ? c.primary : c.muted}
									/>
									<Text style={[purchaseText.body, { color: c.text }]}>
										{t(reason.labelKey)}
									</Text>
								</Pressable>
							);
						})}
					</>
				)}
			/>
			<FieldError message={reasonError ? t(reasonError) : null} />
			<FieldError message={formState.errors.root?.message} />
			<PurchaseButton
				label={t("purchases.cancelSubmit")}
				tone="danger"
				pending={cancel.isPending}
				onPress={onSubmit}
			/>
		</Sheet>
	);
}

const styles = StyleSheet.create({
	option: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
});
