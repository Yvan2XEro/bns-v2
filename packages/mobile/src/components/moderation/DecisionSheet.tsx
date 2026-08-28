import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useModerationTheme } from "./theme";

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
	const { t } = useTranslation();
	const [choice, setChoice] = useState<string | null>(null);
	const [duration, setDuration] = useState<number | null>(null);
	const [durationTouched, setDurationTouched] = useState(false);
	const [text, setText] = useState("");

	// Reopening must not inherit the previous decision: a moderator who
	// rejected one listing for fraud should not find "fraud" preselected on the
	// next one and confirm it without looking.
	useEffect(() => {
		if (visible) {
			setChoice(null);
			setDuration(durations?.[0]?.value ?? null);
			setDurationTouched(false);
			setText("");
		}
	}, [visible, durations]);

	const needsChoice = Boolean(choices?.length);
	const needsDuration = Boolean(durations?.length);
	const ready =
		(!needsChoice || choice !== null) &&
		(!needsDuration || durationTouched || durations?.length === 1) &&
		(!textRequired || text.trim().length > 0);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable
				style={[styles.backdrop, { backgroundColor: c.overlay }]}
				onPress={onClose}
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.sheetWrap}
			>
				<View
					style={[
						styles.sheet,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<View style={styles.grabber}>
						<View style={[styles.grabberBar, { backgroundColor: c.border }]} />
					</View>

					<View style={styles.header}>
						<View style={{ flex: 1 }}>
							<Text style={[styles.title, { color: c.text }]}>{title}</Text>
							{subtitle ? (
								<Text
									style={[styles.subtitle, { color: c.muted }]}
									numberOfLines={2}
								>
									{subtitle}
								</Text>
							) : null}
						</View>
						<Pressable onPress={onClose} hitSlop={10}>
							<Ionicons name="close" size={24} color={c.muted} />
						</Pressable>
					</View>

					<ScrollView
						style={styles.body}
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={{ paddingBottom: 8 }}
					>
						{needsChoice ? (
							<>
								{choicesLabel ? (
									<Text style={[styles.fieldLabel, { color: c.muted }]}>
										{choicesLabel}
									</Text>
								) : null}
								<View style={styles.choices}>
									{choices?.map((option) => {
										const selected = choice === option.value;
										return (
											<Pressable
												key={option.value}
												onPress={() => setChoice(option.value)}
												style={[
													styles.choice,
													{
														backgroundColor: selected
															? destructive
																? c.dangerSoft
																: c.isDark
																	? "#1e3a5f"
																	: "#dbeafe"
															: "transparent",
														borderColor: selected
															? destructive
																? c.danger
																: c.primary
															: c.border,
														borderWidth: selected ? 2 : 1,
													},
												]}
											>
												<Text style={[styles.choiceText, { color: c.text }]}>
													{option.label}
												</Text>
												{selected ? (
													<Ionicons
														name="checkmark-circle"
														size={18}
														color={destructive ? c.danger : c.primary}
													/>
												) : null}
											</Pressable>
										);
									})}
								</View>
							</>
						) : null}

						{needsDuration ? (
							<>
								<Text
									style={[
										styles.fieldLabel,
										{ color: c.muted, marginTop: needsChoice ? 16 : 0 },
									]}
								>
									{durationsLabel}
								</Text>
								<View style={styles.durations}>
									{durations?.map((option) => {
										const selected =
											durationTouched && duration === option.value;
										return (
											<Pressable
												key={String(option.value)}
												onPress={() => {
													setDuration(option.value);
													setDurationTouched(true);
												}}
												style={[
													styles.duration,
													{
														backgroundColor: selected
															? c.danger
															: "transparent",
														borderColor: selected ? c.danger : c.border,
													},
												]}
											>
												<Text
													style={[
														styles.durationText,
														{ color: selected ? "#fff" : c.text },
													]}
												>
													{option.label}
												</Text>
											</Pressable>
										);
									})}
								</View>
							</>
						) : null}

						{textLabel ? (
							<>
								<Text
									style={[styles.fieldLabel, { color: c.muted, marginTop: 16 }]}
								>
									{textLabel}
								</Text>
								<TextInput
									value={text}
									onChangeText={setText}
									placeholder={textPlaceholder}
									placeholderTextColor={c.muted}
									multiline
									style={[
										styles.textarea,
										{
											backgroundColor: c.bg,
											borderColor: c.border,
											color: c.text,
										},
									]}
								/>
							</>
						) : null}
					</ScrollView>

					<View style={[styles.footer, { borderTopColor: c.border }]}>
						<Pressable
							onPress={onClose}
							style={[styles.secondaryBtn, { borderColor: c.border }]}
						>
							<Text style={[styles.secondaryText, { color: c.text }]}>
								{t("common.cancel")}
							</Text>
						</Pressable>
						<Pressable
							onPress={() =>
								onConfirm({ choice, durationDays: duration, text: text.trim() })
							}
							disabled={!ready || pending}
							style={[
								styles.confirmBtn,
								{
									backgroundColor: !ready
										? c.isDark
											? "#334155"
											: "#e2e8f0"
										: destructive
											? c.danger
											: c.primary,
								},
							]}
						>
							{pending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text
									style={[
										styles.confirmText,
										{ color: ready ? "#fff" : c.muted },
									]}
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
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	sheetWrap: { flex: 1, justifyContent: "flex-end" },
	sheet: {
		// flexShrink lets the sheet size to its content and stop growing at the
		// screen edge; React Native defaults it to 0, which would let a long
		// reason list push the footer off-screen.
		flexShrink: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		paddingBottom: 24,
	},
	grabber: { alignItems: "center", paddingTop: 8 },
	grabberBar: { width: 40, height: 4, borderRadius: 2 },
	header: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingHorizontal: 20,
		paddingTop: 12,
		paddingBottom: 8,
	},
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 13, fontFamily: Fonts.body, marginTop: 2 },
	body: { paddingHorizontal: 20, flexGrow: 0, flexShrink: 1 },
	fieldLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
		marginBottom: 8,
	},
	choices: { gap: 8 },
	choice: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	choiceText: { fontSize: 14, fontFamily: Fonts.body, flex: 1 },
	durations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	duration: {
		borderRadius: 999,
		borderWidth: 1.5,
		paddingHorizontal: 16,
		paddingVertical: 9,
	},
	durationText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	textarea: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		fontFamily: Fonts.body,
		minHeight: 88,
		textAlignVertical: "top",
	},
	footer: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 14,
		marginTop: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	secondaryBtn: {
		flex: 1,
		borderRadius: 14,
		borderWidth: 1.5,
		paddingVertical: 14,
		alignItems: "center",
	},
	secondaryText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	confirmBtn: {
		flex: 2,
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: "center",
	},
	confirmText: { fontSize: 15, fontFamily: Fonts.displayBold },
});
