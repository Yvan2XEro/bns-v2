import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useSaveBusiness } from "@/src/hooks/useVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	BUSINESS_TYPES,
	type BusinessFormValues,
	businessSchema,
	normalizeBusinessValues,
} from "@/src/lib/verificationBusiness";

export interface BusinessFormProps {
	shopId: string;
	requestId: string;
	defaultValues: BusinessFormValues;
	onSaved: () => void;
}

/** The business-details half of `/seller/verification/business`. Saving (not
 * submitting for review) is what this form does — the review submit button
 * lives above the document slots, gated on `canSubmit`. */
export function BusinessForm({
	shopId,
	requestId,
	defaultValues,
	onSaved,
}: BusinessFormProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const saveBusiness = useSaveBusiness(shopId, requestId);
	const {
		control,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<BusinessFormValues>({
		resolver: zodResolver(businessSchema),
		defaultValues,
	});
	const businessType = useWatch({ control, name: "businessType" });
	const isEntreprenant = businessType === "entreprenant";
	const inputStyle = [
		styles.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	const onValid = async (values: BusinessFormValues) => {
		const normalized = normalizeBusinessValues(values);
		try {
			await saveBusiness.mutateAsync({
				...normalized,
				tradeName: normalized.tradeName || null,
				rccmNumber: normalized.rccmNumber || null,
				entreprenantDeclarationNumber:
					normalized.entreprenantDeclarationNumber || null,
			});
			onSaved();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	};

	const field = (
		name: keyof Omit<
			BusinessFormValues,
			"businessType" | "legalRepresentativeIsOwner"
		>,
		label: string,
		options?: { multiline?: boolean },
	) => (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.body }]}>{label}</Text>
			<Controller
				control={control}
				name={name}
				render={({ field: rhf }) => (
					<TextInput
						value={rhf.value}
						onChangeText={rhf.onChange}
						onBlur={rhf.onBlur}
						multiline={options?.multiline}
						placeholderTextColor={c.muted}
						accessibilityLabel={label}
						style={inputStyle}
					/>
				)}
			/>
			{errors[name] ? (
				<Text style={[styles.hint, { color: c.danger }]}>
					{errors[name]?.message}
				</Text>
			) : null}
		</View>
	);

	return (
		<KeyboardAwareScrollView
			contentContainerStyle={styles.scroll}
			keyboardShouldPersistTaps="handled"
		>
			{errors.root?.message ? (
				<Text
					role="alert"
					style={[
						styles.rootError,
						{ backgroundColor: c.dangerSoft, color: c.dangerText },
					]}
				>
					{errors.root.message}
				</Text>
			) : null}

			<View style={styles.field}>
				<Text style={[styles.label, { color: c.body }]}>
					{t("verification.business.businessType")}
				</Text>
				<Controller
					control={control}
					name="businessType"
					render={({ field: rhf }) => (
						<View style={styles.chips}>
							{BUSINESS_TYPES.map((value) => {
								const active = rhf.value === value;
								return (
									<Pressable
										key={value}
										onPress={() => rhf.onChange(value)}
										style={[
											styles.chip,
											{
												borderColor: active ? c.primary : c.border,
												backgroundColor: active ? c.primarySoft : c.card,
											},
										]}
										accessibilityRole="radio"
										accessibilityLabel={t(
											`verification.business.businessTypeOption.${value}`,
										)}
										accessibilityState={{ selected: active }}
									>
										<Text
											style={[
												styles.chipText,
												{ color: active ? c.primary : c.body },
											]}
										>
											{t(`verification.business.businessTypeOption.${value}`)}
										</Text>
									</Pressable>
								);
							})}
						</View>
					)}
				/>
			</View>

			{field("legalName", t("verification.business.legalName"))}
			{field("tradeName", t("verification.business.tradeName"))}
			{isEntreprenant
				? field(
						"entreprenantDeclarationNumber",
						t("verification.business.entreprenantDeclarationNumber"),
					)
				: field("rccmNumber", t("verification.business.rccmNumber"))}
			{field("niu", t("verification.business.niu"))}
			{field("registeredAddress", t("verification.business.registeredAddress"))}
			{field("city", t("verification.business.city"))}
			{field(
				"legalRepresentativeName",
				t("verification.business.legalRepresentativeName"),
			)}

			<Controller
				control={control}
				name="legalRepresentativeIsOwner"
				render={({ field: rhf }) => (
					<View
						style={[
							styles.switchRow,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.label, { color: c.body, flex: 1 }]}>
							{t("verification.business.legalRepresentativeIsOwner")}
						</Text>
						<Switch
							value={rhf.value}
							onValueChange={rhf.onChange}
							trackColor={{ true: c.primary, false: c.border }}
							accessibilityRole="switch"
							accessibilityLabel={t(
								"verification.business.legalRepresentativeIsOwner",
							)}
							accessibilityState={{ checked: rhf.value }}
						/>
					</View>
				)}
			/>

			<Pressable
				onPress={handleSubmit(onValid)}
				disabled={isSubmitting || saveBusiness.isPending}
				accessibilityRole="button"
				accessibilityLabel={t("verification.business.save")}
				style={[
					styles.submit,
					{ backgroundColor: c.primary, opacity: isSubmitting ? 0.6 : 1 },
				]}
			>
				{saveBusiness.isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.submitText}>
						{t("verification.business.save")}
					</Text>
				)}
			</Pressable>
		</KeyboardAwareScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: { padding: 16, gap: 14, paddingBottom: 40 },
	field: { gap: 6 },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	input: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	hint: { fontSize: 12, fontFamily: Fonts.body },
	rootError: {
		borderRadius: 10,
		padding: 10,
		fontSize: 13,
		fontFamily: Fonts.body,
	},
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 8,
		minHeight: 44,
		justifyContent: "center",
	},
	chipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	switchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		minHeight: 44,
	},
	submit: {
		height: 54,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
