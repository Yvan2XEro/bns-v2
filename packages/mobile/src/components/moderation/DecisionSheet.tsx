import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Modal,
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
import { InlineNotice } from "./ModerationKit";
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
	/**
	 * The text becomes required for some choices only: "Autre motif" says
	 * nothing by itself. Checked live, so the label and the confirm button
	 * follow the reason the moderator has just picked.
	 */
	textRequiredFor?: (choice: string | null) => boolean;
	/**
	 * Why the last attempt failed. Shown inside the sheet, above the buttons:
	 * an alert raised over an open sheet is a second Modal, which iOS refuses
	 * to present, so the moderator would see the spinner stop and nothing else.
	 */
	error?: string | null;
	/**
	 * A draft the text field opens with, when the screen already knows what
	 * was done (a report closed after its target was sanctioned).
	 */
	initialText?: string;
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
	textRequiredFor,
	error,
	initialText,
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

	// Read through a ref: screens pass an inline function, and a new schema on
	// every render would swap the form's resolver each time.
	const textRequiredForRef = useRef(textRequiredFor);
	textRequiredForRef.current = textRequiredFor;
	const schema = useMemo(
		() =>
			buildDecisionSchema({
				needsChoice,
				needsDuration,
				singleDuration,
				textRequired: Boolean(textRequired),
				textRequiredFor: (picked) =>
					Boolean(textRequiredForRef.current?.(picked)),
			}),
		[needsChoice, needsDuration, singleDuration, textRequired],
	);

	const form = useForm<DecisionFormValues>({
		resolver: zodResolver(schema),
		mode: "onChange",
		defaultValues: decisionSheetDefaults(singleDuration, singleDurationValue),
	});

	// A typed note is the one thing a stray backdrop tap or Android back must
	// not throw away: the sheet asks first, inside itself, never over itself.
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);

	// Reopening must not inherit the previous decision: a moderator who
	// rejected one listing for fraud should not find "fraud" preselected on the
	// next one and confirm it without looking. A draft text is read at open
	// time only, so one arriving later never wipes what is being typed.
	const initialTextRef = useRef(initialText);
	initialTextRef.current = initialText;
	useEffect(() => {
		if (visible) {
			form.reset({
				...decisionSheetDefaults(singleDuration, singleDurationValue),
				text: initialTextRef.current ?? "",
			});
			setConfirmingDiscard(false);
		}
	}, [visible, singleDuration, singleDurationValue, form.reset]);

	const choice = form.watch("choice");
	const duration = form.watch("duration");
	const text = form.watch("text");
	const textNowRequired =
		Boolean(textRequired) || Boolean(textRequiredFor?.(choice ?? null));
	const textMissing = textNowRequired && text.trim().length === 0;
	// The schema owns every rule, the choice-dependent note included.
	const ready = form.formState.isValid;
	const errors = form.formState.errors;

	// Field errors appear once a field has been touched; until then a grey
	// confirm button says nothing. This line names the first thing missing.
	const missing =
		needsChoice && choice === null
			? t("moderation.decisionChoiceRequired")
			: needsDuration && !singleDuration && duration === null
				? t("moderation.decisionDurationRequired")
				: textMissing && textLabel
					? t("moderation.decisionTextMissing", { label: textLabel })
					: null;

	const fieldLabel =
		textLabel && textNowRequired
			? `${textLabel} (${t("common.required").toLowerCase()})`
			: textLabel;

	const requestClose = () => {
		const typed = text.trim();
		if (
			!pending &&
			!confirmingDiscard &&
			typed.length > 0 &&
			typed !== initialText
		) {
			setConfirmingDiscard(true);
			return;
		}
		onClose();
	};

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
			onRequestClose={requestClose}
			statusBarTranslucent
		>
			<Pressable
				style={[styles.backdrop, { backgroundColor: c.overlay }]}
				onPress={requestClose}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
			/>
			{/* Padding on both platforms: SDK 57 runs edge to edge, so Android no
			    longer shrinks the window for the keyboard, and the note field and
			    the confirm button would sit behind it. */}
			<KeyboardAvoidingView
				behavior="padding"
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
							onPress={requestClose}
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
									{fieldLabel}
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
											accessibilityLabel={fieldLabel}
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

					{error && !confirmingDiscard ? (
						<View style={styles.notice}>
							<InlineNotice text={error} />
						</View>
					) : null}

					{confirmingDiscard ? (
						<View style={[styles.footerBlock, { borderTopColor: c.border }]}>
							<View accessibilityRole="alert" style={styles.discardText}>
								<Text style={[styles.discardTitle, { color: c.text }]}>
									{t("moderation.discardTitle")}
								</Text>
								<Text style={[styles.discardBody, { color: c.muted }]}>
									{t("moderation.discardBody")}
								</Text>
							</View>
							<View style={styles.footerRow}>
								<Pressable
									onPress={() => setConfirmingDiscard(false)}
									accessibilityRole="button"
									accessibilityLabel={t("moderation.discardKeep")}
									style={({ pressed }) => [
										styles.secondaryBtn,
										{
											borderColor: k.strongBorder,
											opacity: pressed ? 0.8 : 1,
										},
									]}
								>
									<Text style={[styles.btnText, { color: c.text }]}>
										{t("moderation.discardKeep")}
									</Text>
								</Pressable>
								<Pressable
									onPress={onClose}
									accessibilityRole="button"
									accessibilityLabel={t("moderation.discardConfirm")}
									style={({ pressed }) => [
										styles.confirmBtn,
										{
											backgroundColor: k.dangerFill,
											opacity: pressed ? 0.88 : 1,
										},
									]}
								>
									<Text style={[styles.btnText, { color: k.onFill }]}>
										{t("moderation.discardConfirm")}
									</Text>
								</Pressable>
							</View>
						</View>
					) : (
						// Cancel left, the decision right, as in every alert sheet.
						<View style={[styles.footerBlock, { borderTopColor: c.border }]}>
							{!ready && missing && !error ? (
								<Text style={[styles.missingText, { color: c.muted }]}>
									{missing}
								</Text>
							) : null}
							<View style={styles.footerRow}>
								<Pressable
									onPress={requestClose}
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
					)}
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
		fontSize: 15,
		lineHeight: 22,
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
	choiceText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 20, flex: 1 },
	durations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	duration: {
		minHeight: 48,
		justifyContent: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 16,
	},
	durationText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
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
	notice: { paddingHorizontal: 20, paddingBottom: 10 },
	footerBlock: {
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	footerRow: { flexDirection: "row", gap: 10 },
	missingText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodyMedium },
	discardText: { gap: 2 },
	discardTitle: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodyBold },
	discardBody: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
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
