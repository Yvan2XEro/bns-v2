import { zodResolver } from "@hookform/resolvers/zod";
import type { ComponentProps } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useUpdateOrderSettings } from "@/src/hooks/useOrderSettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import {
	MAX_ETA_TEXT,
	MAX_SALES_TERMS,
	type OrderSettingsFormValues,
	orderSettingsSchema,
	settingsIssueKey,
	toFormValues,
	toOrderSettingsInput,
} from "@/src/lib/orderSettingsForm";
import type { OrderSettingsView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import {
	SettingsField,
	SettingsSection,
	SettingsToggle,
} from "./SettingsControls";
import { useLocaleKey } from "./useLocaleKey";

type TextFieldName = Exclude<
	FieldPath<OrderSettingsFormValues>,
	"codEnabled" | "sellerDeliveryEnabled" | "pickupEnabled"
>;
type ToggleName = "codEnabled" | "sellerDeliveryEnabled" | "pickupEnabled";

export function OrderSettingsForm({
	shopId,
	view,
	canEdit,
}: {
	shopId: string;
	view: OrderSettingsView;
	canEdit: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const { showError, showSuccess } = useAlert();
	const save = useUpdateOrderSettings(shopId);
	const { control, formState, handleSubmit, reset, watch } =
		useForm<OrderSettingsFormValues>({
			resolver: zodResolver(orderSettingsSchema),
			mode: "onChange",
			defaultValues: toFormValues(view),
		});
	const editable = canEdit && !save.isPending;

	const errorText = (name: TextFieldName) => {
		const issue = settingsIssueKey(name, formState.errors[name]?.message);
		return issue ? t(issue.key, { max: issue.max }) : null;
	};

	const toggle = (name: ToggleName, label: string) => (
		<Controller
			control={control}
			name={name}
			render={({ field }) => (
				<SettingsToggle
					label={label}
					value={field.value}
					disabled={!editable}
					onChange={field.onChange}
				/>
			)}
		/>
	);

	const field = (
		name: TextFieldName,
		label: string,
		extra: Partial<ComponentProps<typeof SettingsField>> = {},
	) => (
		<Controller
			control={control}
			name={name}
			render={({ field: f }) => (
				<SettingsField
					label={label}
					value={f.value}
					onChange={f.onChange}
					onBlur={f.onBlur}
					editable={editable}
					error={errorText(name)}
					{...extra}
				/>
			)}
		/>
	);

	const onSubmit = handleSubmit((values) =>
		save.mutate(toOrderSettingsInput(values), {
			onSuccess: (fresh) => {
				reset(toFormValues(fresh));
				showSuccess(t("billing.saved"));
			},
			onError: (error) =>
				showError(t("billing.saveFailed"), resolveErrorMessage(error, t)),
		}),
	);

	const defaultFee =
		view.cityDefaultFee === null
			? null
			: formatXaf(view.cityDefaultFee, locale);

	return (
		<View style={{ gap: 12 }}>
			<SettingsSection title={t("billing.paymentSection")}>
				{toggle("codEnabled", t("billing.codEnabled"))}
			</SettingsSection>

			<SettingsSection title={t("billing.deliverySection")}>
				{toggle("sellerDeliveryEnabled", t("billing.sellerDelivery"))}
				{watch("sellerDeliveryEnabled") ? (
					<>
						{field("deliveryFee", t("billing.deliveryFee"), {
							numeric: true,
							placeholder: defaultFee ?? undefined,
							hint:
								defaultFee === null
									? t("billing.deliveryFeeHintNoCity")
									: t("billing.deliveryFeeHint", { fee: defaultFee }),
						})}
						{field("deliveryEtaText", t("billing.etaText"), {
							maxLength: MAX_ETA_TEXT,
							placeholder: t("billing.etaTextPlaceholder"),
						})}
					</>
				) : null}
			</SettingsSection>

			<SettingsSection title={t("billing.pickupSection")}>
				{toggle("pickupEnabled", t("billing.pickupEnabled"))}
				{watch("pickupEnabled") ? (
					<>
						{field("pickupAddress", t("billing.pickupAddress"))}
						{field("pickupLandmark", t("billing.pickupLandmark"))}
						{field("pickupHours", t("billing.pickupHours"))}
					</>
				) : null}
			</SettingsSection>

			<SettingsSection title={t("billing.termsSection")}>
				{field("salesTermsExtra", t("billing.salesTermsExtra"), {
					multiline: true,
					maxLength: MAX_SALES_TERMS,
					hint: t("billing.salesTermsHint"),
				})}
			</SettingsSection>

			{canEdit ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("billing.save")}
					accessibilityState={{
						disabled: !formState.isDirty || save.isPending,
						busy: save.isPending,
					}}
					onPress={onSubmit}
					disabled={!formState.isDirty || save.isPending}
					style={[
						s.button,
						{
							backgroundColor: c.primary,
							opacity: !formState.isDirty || save.isPending ? 0.5 : 1,
						},
					]}
				>
					{save.isPending ? <ActivityIndicator color="#fff" /> : null}
					<Text style={s.buttonText}>{t("billing.save")}</Text>
				</Pressable>
			) : null}
		</View>
	);
}
