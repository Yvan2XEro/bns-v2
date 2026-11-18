import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { fillOf, inkOf } from "@/src/components/checkout/fill";
import { useShopTheme } from "@/src/components/shop/theme";
import type { SubmitPayoutAccountInput } from "@/src/hooks/useSellerPayments";
import { useTranslation } from "@/src/lib/i18n";
import { PAYOUT_METHODS, type PayoutMethod } from "@/src/lib/paymentStatus";

const METHODS: readonly PayoutMethod[] = ["mtn_momo", "orange_money", "bank"];

const schema = z.object({
	method: z.enum(["mtn_momo", "orange_money", "bank"]),
	accountName: z
		.string()
		.trim()
		.min(2, "payments.setup_fieldInvalid")
		.max(80, "payments.setup_fieldInvalid"),
	accountNumber: z
		.string()
		.trim()
		.min(1, "payments.setup_fieldInvalid")
		.max(40, "payments.setup_fieldInvalid"),
});
type FormValues = z.infer<typeof schema>;

/** The step-3 form: method, account name and number, behind `payout-accounts`'s
 * own zod bounds — the server stays the one source of truth for the business
 * rules (name match, cooldown, hold), this only catches an empty submit. */
export function PayoutAccountForm({
	onSubmit,
	pending,
}: {
	onSubmit: (input: SubmitPayoutAccountInput) => void;
	pending: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		mode: "onChange",
		defaultValues: { method: "mtn_momo", accountName: "", accountNumber: "" },
	});

	const submit = form.handleSubmit((values) => onSubmit(values));

	return (
		<View style={styles.form}>
			<Text style={[s.meta, { color: c.muted }]}>
				{t("payments.setup_payoutMethod")}
			</Text>
			<Controller
				control={form.control}
				name="method"
				render={({ field }) => (
					<View style={styles.methods}>
						{METHODS.map((method) => {
							const selected = field.value === method;
							return (
								<Pressable
									key={method}
									accessibilityRole="button"
									accessibilityState={{ selected }}
									onPress={() => field.onChange(method)}
									style={[
										styles.methodChip,
										{
											backgroundColor: selected ? c.primarySoft : "transparent",
											borderColor: selected ? c.primary : c.border,
										},
									]}
								>
									<Text
										style={[
											s.meta,
											{
												color: selected ? inkOf(c) : c.text,
												fontFamily: Fonts.bodySemibold,
											},
										]}
									>
										{t(PAYOUT_METHODS[method])}
									</Text>
								</Pressable>
							);
						})}
					</View>
				)}
			/>

			<Text style={[s.meta, { color: c.muted, marginTop: 10 }]}>
				{t("payments.setup_accountName")}
			</Text>
			<Controller
				control={form.control}
				name="accountName"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						accessibilityLabel={t("payments.setup_accountName")}
						selectionColor={c.primary}
						style={[
							styles.input,
							{
								backgroundColor: c.input,
								borderColor: c.border,
								color: c.text,
							},
						]}
					/>
				)}
			/>
			{form.formState.errors.accountName ? (
				<Text
					accessibilityRole="alert"
					style={[s.meta, { color: c.dangerText }]}
				>
					{t(form.formState.errors.accountName.message ?? "")}
				</Text>
			) : null}

			<Text style={[s.meta, { color: c.muted, marginTop: 10 }]}>
				{t("payments.setup_accountNumber")}
			</Text>
			<Controller
				control={form.control}
				name="accountNumber"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						keyboardType="phone-pad"
						accessibilityLabel={t("payments.setup_accountNumber")}
						selectionColor={c.primary}
						style={[
							styles.input,
							{
								backgroundColor: c.input,
								borderColor: c.border,
								color: c.text,
							},
						]}
					/>
				)}
			/>
			{form.formState.errors.accountNumber ? (
				<Text
					accessibilityRole="alert"
					style={[s.meta, { color: c.dangerText }]}
				>
					{t(form.formState.errors.accountNumber.message ?? "")}
				</Text>
			) : null}

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("payments.setup_save")}
				accessibilityState={{
					disabled: !form.formState.isValid || pending,
					busy: pending,
				}}
				onPress={submit}
				disabled={!form.formState.isValid || pending}
				style={[
					s.button,
					styles.save,
					{
						backgroundColor: fillOf(c).bg,
						opacity: form.formState.isValid && !pending ? 1 : 0.45,
					},
				]}
			>
				{pending ? (
					<ActivityIndicator color={fillOf(c).fg} />
				) : (
					<Text style={s.buttonText}>{t("payments.setup_save")}</Text>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	form: { gap: 4 },
	methods: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
	methodChip: {
		borderRadius: 999,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		paddingVertical: 9,
		minHeight: 44,
		justifyContent: "center",
	},
	input: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontFamily: Fonts.body,
		fontSize: 16,
		minHeight: 48,
	},
	save: { marginTop: 14 },
});
