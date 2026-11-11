import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useSheetPresentation } from "@/src/components/layout/sheetPresentation";
import {
	buildDecisionSchema,
	type DecisionFormValues,
	decisionSheetDefaults,
} from "@/src/lib/decisionSheetForm";
import { useTranslation } from "@/src/lib/i18n";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

export interface DecisionChoice {
	value: string;
	label: string;
}

export interface DecisionDuration {
	/** `null` is an indefinite sanction. */
	value: number | null;
	label: string;
}

export interface DecisionResult {
	choice: string | null;
	durationDays: number | null;
	text: string;
}

interface DecisionSheetProps {
	visible: boolean;
	title: string;
	subtitle?: string;
	choices?: DecisionChoice[];
	choicesLabel?: string;
	durations?: DecisionDuration[];
	durationsLabel?: string;
	textLabel?: string;
	textPlaceholder?: string;
	/** When true the confirm button stays disabled until the field is filled. */
	textRequired?: boolean;
	confirmLabel: string;
	destructive?: boolean;
	pending?: boolean;
	onConfirm: (result: DecisionResult) => void;
	onClose: () => void;
}

/**
 * One sheet behind every moderation decision — rejecting a listing, suspending
 * an account, closing a report. Each of those needs some mix of a reason, a
 * duration and a free-text note, and going through the same component is what
 * keeps a moderator from meeting three different confirmation flows.
 *
 * The confirm button stays grey until the form is complete, and turns red
 * only for a sanction: the colour of the button is the last thing a
 * moderator reads before the decision leaves.
 */
export function DecisionSheet({
	visible,
	title,
	subtitle,
	choices,
	choicesLabel,
	durations,
	durationsLabel,
	textLabel,
	textPlaceholder,
	textRequired,
	confirmLabel,
	destructive,
	pending,
	onConfirm,
	onClose,
}: DecisionSheetProps) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const sheet = useSheetPresentation();
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();

	const needsChoice = Boolean(choices?.length);
	const needsDuration = Boolean(durations?.length);
	const singleDuration = durations?.length === 1;
	const singleDurationValue = singleDuration
		? (durations?.[0]?.value ?? null)
		: null;

	const schema = useMemo(
		() =>
			buildDecisionSchema({
				needsChoice,
				needsDuration,
				singleDuration,
				textRequired: Boolean(textRequired),
			}),
		[needsChoice, needsDuration, singleDuration, textRequired],
	);

	const form = useForm<DecisionFormValues>({
		resolver: zodResolver(schema),
		mode: "onChange",
		defaultValues: decisionSheetDefaults(singleDuration, singleDurationValue),
	});

	// Reopening must not inherit the previous decision: a moderator who
	// rejected one listing for fraud should not find "fraud" preselected on the
	// next one and confirm it without looking.
	useEffect(() => {
		if (visible) {
			form.reset(decisionSheetDefaults(singleDuration, singleDurationValue));
		}
	}, [visible, singleDuration, singleDurationValue, form.reset]);

	const ready = form.formState.isValid;
	const errors = form.formState.errors;

	const submit = form.handleSubmit((values) => {
		onConfirm({
			choice: values.choice,
			durationDays: values.duration,
			text: values.text.trim(),
		});
	});

	const accent = destructive ? k.dangerText : k.linkText;
	const selectedFill = destructive ? k.dangerFill : k.primaryFill;
	const confirmFill = !ready ? k.disabledFill : selectedFill;

	return (
		<Modal
			visible={visible}
			transparent
			animationType={sheet.animationType}
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<Pressable
				style={[styles.backdrop, { backgroundColor: c.overlay }]}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={sheet.wrap}
				pointerEvents="box-none"
			>
				<View
					accessibilityViewIsModal
					style={[
						styles.sheet,
						{
							backgroundColor: c.card,
							borderColor: c.border,
							paddingBottom: sheet.panel ? 20 : Math.max(insets.bottom, 12) + 8,
						},
						sheet.panel,
					]}
				>
					{sheet.panel ? null : (
						<View style={styles.grabber}>
							<View
								style={[styles.grabberBar, { backgroundColor: c.border }]}
							/>
						</View>
					)}

					<View style={styles.header}>
						<View style={styles.flex}>
							<Text
								accessibilityRole="header"
								style={[styles.title, { color: c.text }]}
							>
								{title}
							</Text>
							{subtitle ? (
								<Text style={[styles.subtitle, { color: c.muted }]}>
									{subtitle}
								</Text>
							) : null}
						</View>
						<Pressable
							onPress={onClose}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t("common.close")}
							style={styles.closeBtn}
						>
							<Ionicons name="close" size={24} color={c.muted} />
						</Pressable>
					</View>

					<ScrollView
						style={styles.body}
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={styles.bodyContent}
					>
						{needsChoice ? (
							<View style={styles.field}>
								{choicesLabel ? (
									<Text style={[styles.fieldLabel, { color: c.text }]}>
										{choicesLabel}
									</Text>
								) : null}
								<Controller
									control={form.control}
									name="choice"
									render={({ field }) => (
										<View style={styles.choices} accessibilityRole="radiogroup">
											{choices?.map((option) => {
												const selected = field.value === option.value;
												return (
													<Pressable
														key={option.value}
														accessibilityRole="radio"
														accessibilityState={{ checked: selected }}
														accessibilityLabel={option.label}
														onPress={() => field.onChange(option.value)}
														style={[
															styles.choice,
															{
																backgroundColor: selected
																	? destructive
																		? c.dangerSoft
																		: k.selectedSoft
																	: c.card,
																borderColor: selected ? accent : c.border,
																borderWidth: selected ? 2 : 1,
															},
														]}
													>
														<Text
															style={[
																styles.choiceText,
																{
																	color: c.text,
																	fontFamily: selected
																		? Fonts.bodySemibold
																		: Fonts.body,
																},
															]}
														>
															{option.label}
														</Text>
														<Ionicons
															name={
																selected
																	? "radio-button-on"
																	: "radio-button-off"
															}
															size={20}
															color={selected ? accent : c.muted}
														/>
													</Pressable>
												);
											})}
										</View>
									)}
								/>
								{errors.choice ? (
									<Text style={[styles.errorText, { color: k.dangerText }]}>
										{t(errors.choice.message ?? "")}
									</Text>
								) : null}
							</View>
						) : null}

						{needsDuration ? (
							<View style={styles.field}>
								<Text style={[styles.fieldLabel, { color: c.text }]}>
									{durationsLabel}
								</Text>
								<Controller
									control={form.control}
									name="duration"
									render={({ field }) => (
										<View
											style={styles.durations}
											accessibilityRole="radiogroup"
										>
											{durations?.map((option) => {
												const selected = field.value === option.value;
												return (
													<Pressable
														key={String(option.value)}
														accessibilityRole="radio"
														accessibilityState={{ checked: selected }}
														accessibilityLabel={option.label}
														onPress={() => field.onChange(option.value)}
														style={[
															styles.duration,
															{
																backgroundColor: selected
																	? selectedFill
																	: c.card,
																borderColor: selected ? selectedFill : c.border,
															},
														]}
													>
														<Text
															style={[
																styles.durationText,
																{ color: selected ? k.onFill : c.text },
															]}
														>
															{option.label}
														</Text>
													</Pressable>
												);
											})}
										</View>
									)}
								/>
								{errors.duration ? (
									<Text style={[styles.errorText, { color: k.dangerText }]}>
										{t(errors.duration.message ?? "")}
									</Text>
								) : null}
							</View>
						) : null}

						{textLabel ? (
							<View style={styles.field}>
								<Text style={[styles.fieldLabel, { color: c.text }]}>
									{textLabel}
								</Text>
								<Controller
									control={form.control}
									name="text"
									render={({ field }) => (
										<TextInput
											value={field.value}
											onChangeText={field.onChange}
											onBlur={field.onBlur}
											placeholder={textPlaceholder}
											placeholderTextColor={c.muted}
											accessibilityLabel={textLabel}
											multiline
											style={[
												styles.textarea,
												{
													backgroundColor: c.bg,
													borderColor: errors.text ? k.dangerText : c.border,
													color: c.text,
												},
											]}
										/>
									)}
								/>
								{errors.text ? (
									<Text style={[styles.errorText, { color: k.dangerText }]}>
										{t(errors.text.message ?? "")}
									</Text>
								) : null}
							</View>
						) : null}
					</ScrollView>

					{/* Cancel left, the decision right, as in every alert sheet. */}
					<View style={[styles.footer, { borderTopColor: c.border }]}>
						<Pressable
							onPress={onClose}
							accessibilityRole="button"
							accessibilityLabel={t("common.cancel")}
							style={({ pressed }) => [
								styles.secondaryBtn,
								{
									borderColor: k.strongBorder,
									opacity: pressed ? 0.8 : 1,
								},
							]}
						>
							<Text style={[styles.btnText, { color: c.text }]}>
								{t("common.cancel")}
							</Text>
						</Pressable>
						<Pressable
							onPress={submit}
							disabled={!ready || pending}
							accessibilityRole="button"
							accessibilityLabel={confirmLabel}
							accessibilityState={{
								disabled: !ready || Boolean(pending),
								busy: Boolean(pending),
							}}
							style={({ pressed }) => [
								styles.confirmBtn,
								{
									backgroundColor: confirmFill,
									opacity: pressed ? 0.88 : 1,
								},
							]}
						>
							{pending ? (
								<ActivityIndicator color={k.onFill} />
							) : (
								<Text
									style={[
										styles.btnText,
										{ color: ready ? k.onFill : k.disabledText },
									]}
									numberOfLines={2}
								>
									{confirmLabel}
								</Text>
							)}
						</Pressable>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	sheet: {
		// flexShrink lets the sheet size to its content and stop growing at the
		// screen edge; React Native defaults it to 0, which would let a long
		// reason list push the footer off-screen.
		flexShrink: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
	},
	grabber: { alignItems: "center", paddingTop: 8 },
	grabberBar: { width: 40, height: 4, borderRadius: 2 },
	header: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		paddingLeft: 20,
		paddingRight: 10,
		paddingTop: 14,
		paddingBottom: 8,
	},
	title: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	subtitle: {
		fontSize: 14,
		lineHeight: 20,
		fontFamily: Fonts.body,
		marginTop: 4,
	},
	closeBtn: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		marginTop: -8,
	},
	body: { paddingHorizontal: 20, flexGrow: 0, flexShrink: 1 },
	bodyContent: { paddingTop: 4, paddingBottom: 12, gap: 20 },
	field: { gap: 8 },
	fieldLabel: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	errorText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodyMedium },
	choices: { gap: 8 },
	choice: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	choiceText: { fontSize: 15, lineHeight: 20, flex: 1 },
	durations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	duration: {
		minHeight: 48,
		justifyContent: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 16,
	},
	durationText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	textarea: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.body,
		minHeight: 96,
		textAlignVertical: "top",
	},
	footer: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	secondaryBtn: {
		flex: 1,
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 12,
	},
	confirmBtn: {
		flex: 1.6,
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 14,
	},
	btnText: {
		fontSize: 16,
		lineHeight: 20,
		fontFamily: Fonts.bodyBold,
		textAlign: "center",
	},
});
