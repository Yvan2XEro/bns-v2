import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CategoryField } from "@/src/components/CategorySheet";
import { CityPicker } from "@/src/components/CityPicker";
import { SuspensionBanner } from "@/src/components/moderation/SuspensionBanner";
import { TagPicker } from "@/src/components/TagPicker";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { createCategorySuggester } from "@/src/lib/categorySuggest";
import { useTranslation } from "@/src/lib/i18n";
import {
	type AttributeIssue,
	areAttributesValid,
	formatAttributeValue,
	getAttributeIssue,
	getCategoryAttributes,
	getListingFormPreset,
	groupListingAttributes,
	isProductListingCategory,
	type ListingAttribute,
	maskDateInput,
	sanitizeNumberInput,
	sanitizePriceInput,
	serializeAttributeValues,
} from "@/src/lib/listingForm";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import { isSuspended } from "@/src/lib/moderation";
import type { Place } from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";

const DURATIONS = [30, 60, 90];

/**
 * Steps are addressed by id, never by position: which ones exist depends on the
 * category, so an index means nothing on its own.
 *
 * `describe` comes first and asks what the seller is selling, in their own
 * words. The category used to be the opening question, which meant choosing a
 * taxonomy before having said anything — and once chosen it left the screen for
 * good, so a wrong pick was neither visible nor correctable. It is now guessed
 * from the title and shown on every step that can change it.
 */
type StepId = "attributes" | "describe" | "details" | "photos" | "review";

/** Maximum number of images a listing can carry (enforced server-side too). */
const MAX_LISTING_IMAGES = 3;

interface UploadedImage {
	id: string; // Payload media document ID
	uri: string; // local URI for preview
}

interface FormData {
	category: any;
	title: string;
	description: string;
	price: string;
	condition: string;
	duration: number;
	location: string;
	coordinates: { lat: number; lng: number } | null;
	attributes: Record<string, any>;
	images: UploadedImage[];
	tags: string[];
}

/**
 * A blank ad. Built fresh each time rather than shared from a constant, so a
 * reset can never hand back the `attributes` object or `images` array a
 * previous draft was using.
 */
function createEmptyForm(): FormData {
	return {
		category: null,
		title: "",
		description: "",
		price: "",
		condition: "new",
		duration: 30,
		location: "",
		coordinates: null,
		attributes: {},
		images: [],
		tags: [],
	};
}

export default function CreateScreen() {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { user } = useAuth();
	const pathname = usePathname();
	const { width: SCREEN_W, centeredContent } = useResponsive();
	const { asPlace: rememberedPlace, hydrated: locationHydrated } =
		useUserLocation();
	const { showAlert } = useAlert();
	const didPrefillLocationRef = useRef(false);
	const [step, setStep] = useState<StepId>("describe");
	const [form, setForm] = useState<FormData>(createEmptyForm);

	// Owned by the wizard rather than by a step: the category drives which steps
	// exist, the header, and the guess made from the title.
	const { data: categoriesData } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});

	// A category with a null/missing `name` used to throw downstream and blank
	// the whole Create tab — same `.filter(Boolean)` guard the home screen uses.
	const categories = useMemo(
		() => (categoriesData?.categories ?? []).filter(Boolean),
		[categoriesData],
	);

	/**
	 * Set the moment the seller opens the category sheet themselves. From then on
	 * the title no longer moves the category: a guess may replace a guess, never
	 * an answer.
	 */
	const categoryChosenRef = useRef(false);
	const [categoryWasGuessed, setCategoryWasGuessed] = useState(false);

	const suggestFromTitle = useMemo(
		() => createCategorySuggester(categories),
		[categories],
	);

	// The extra-details step exists only for categories that define attributes.
	// Categories without any (most services and job offers) used to land on an
	// empty step that bounced forward, which made the back button unusable; the
	// step is now skipped in both directions instead.
	const categoryAttributes = useMemo(
		() => getCategoryAttributes(form.category),
		[form.category],
	);
	const hasAttributes = categoryAttributes.length > 0;
	// Drives which steps exist, so it belongs to the wizard rather than to a
	// single step component.
	const preset = useMemo(
		() => getListingFormPreset(form.category),
		[form.category],
	);

	// The wizard for this category: a step only exists when it has something
	// to ask. A category with no attributes never shows an attributes step, and
	// one that does not want photos never shows a photos step — rather than
	// showing them and skipping past, which left the counter describing pages
	// the seller never saw.
	const steps = useMemo<StepId[]>(() => {
		// Characteristics follow the category directly: they are the questions
		// that category asks, and answering them right after choosing it keeps
		// one train of thought. Price, condition and duration are about selling
		// rather than about the thing, so they come after.
		const list: StepId[] = ["describe"];
		if (hasAttributes) list.push("attributes");
		list.push("details");
		if (preset.fields.photos?.enabled !== false) list.push("photos");
		list.push("review");
		return list;
	}, [hasAttributes, preset]);

	const STEP_LABELS: Record<StepId, string> = {
		describe: t("create.stepDescribe"),
		details: t("create.stepDetails"),
		attributes: t("create.stepAttributes"),
		photos: t("create.stepPhotos"),
		review: t("create.stepReview"),
	};

	// Changing category can remove the step being displayed; fall back to the
	// last one that still exists rather than rendering nothing.
	const stepIndex = Math.max(0, steps.indexOf(step));
	const currentStep = steps[stepIndex] ?? "describe";
	const totalSteps = steps.length;

	// ── Animations ────────────────────────────────────────────────
	const translateX = useSharedValue(0);
	const opacity = useSharedValue(1);
	const progressAnim = useSharedValue(20);
	const stepRef = useRef<StepId>("describe");

	const goToStep = (next: StepId) => {
		const target = steps.includes(next) ? next : "describe";
		const from = steps.indexOf(stepRef.current);
		const to = steps.indexOf(target);
		const dir = to > from ? 1 : -1;
		translateX.value = dir * SCREEN_W * 0.4;
		opacity.value = 0;
		stepRef.current = target;
		setStep(target);
		translateX.value = withTiming(0, {
			duration: 320,
			easing: Easing.out(Easing.cubic),
		});
		opacity.value = withTiming(1, {
			duration: 260,
			easing: Easing.out(Easing.ease),
		});
		progressAnim.value = withTiming(((to + 1) / steps.length) * 100, {
			duration: 380,
			easing: Easing.out(Easing.cubic),
		});
	};

	const stepAnimStyle = useAnimatedStyle(() => ({
		flex: 1,
		transform: [{ translateX: translateX.value }],
		opacity: opacity.value,
	}));

	const progressBarStyle = useAnimatedStyle(() => ({
		width: `${progressAnim.value}%` as any,
	}));

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primary = isDark ? "#3b82f6" : "#1e40af";
	const border = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";
	const inputBg = isDark ? "#162032" : "#f8fafc";

	// Pre-fill the location from the remembered place, so a seller does not
	// re-enter their city on every listing. Only ever fills an empty field, and
	// never refills one the user deliberately cleared.
	useEffect(() => {
		if (!locationHydrated || !rememberedPlace?.name) return;
		// Fill at most once per mount, so a location the user clears on purpose
		// is never silently written back.
		if (didPrefillLocationRef.current) return;
		didPrefillLocationRef.current = true;
		setForm((f: any) =>
			f.location
				? f
				: {
						...f,
						location: rememberedPlace.name,
						coordinates:
							rememberedPlace.lat != null && rememberedPlace.lng != null
								? { lat: rememberedPlace.lat, lng: rememberedPlace.lng }
								: null,
					},
		);
	}, [locationHydrated, rememberedPlace]);

	/**
	 * Moves the form to a category, dropping whatever belonged to the previous
	 * one. Attributes are keyed by slugs that belong to a single category, and a
	 * price or condition the new category hides can neither be seen nor removed
	 * by the seller — keeping either would submit answers to questions this
	 * category never asked.
	 */
	const applyCategory = useCallback((next: any, guessed: boolean) => {
		setCategoryWasGuessed(guessed);
		setForm((f: any) => {
			if (f.category?.id === next?.id) return f;
			const nextPreset = getListingFormPreset(next);
			return {
				...f,
				category: next,
				price: nextPreset.fields.price.enabled ? f.price : "",
				condition: nextPreset.fields.condition.enabled
					? f.condition || "new"
					: "",
				attributes: {},
				// The photo step disappears with the category, so keeping the files
				// would attach pictures the seller can no longer see or remove.
				images: nextPreset.fields.photos?.enabled === false ? [] : f.images,
			};
		});
	}, []);

	const handleCategoryPick = useCallback(
		(next: any) => {
			categoryChosenRef.current = true;
			applyCategory(next, false);
		},
		[applyCategory],
	);

	/**
	 * The title the seller last rejected a guess for.
	 *
	 * Clearing the category has to survive the very next render, or the effect
	 * below would put the same suggestion straight back and the cross would look
	 * broken. Rejecting a guess means "not for this title" — editing the title at
	 * all is what asks for another one.
	 */
	const dismissedTitleRef = useRef<string | null>(null);

	const handleCategoryClear = useCallback(() => {
		// Back to guessing: clearing is how a seller asks the title to decide
		// again, so it must undo their earlier trip to the sheet as well.
		categoryChosenRef.current = false;
		dismissedTitleRef.current = form.title;
		applyCategory(null, false);
	}, [applyCategory, form.title]);

	// Emptying the title is starting the ad over. The category was chosen for a
	// subject that no longer exists, so it goes with it — and the next title may
	// suggest freely, even if the last one was answered by hand. Without this,
	// one trip to the sheet silenced the guess for the rest of the session and
	// rewriting the title appeared to do nothing.
	useEffect(() => {
		if (form.title.trim() !== "") return;
		categoryChosenRef.current = false;
		dismissedTitleRef.current = null;
		if (form.category) applyCategory(null, false);
	}, [form.title, form.category, applyCategory]);

	// Guess the category from the title, the way leboncoin does. Only ever
	// replaces another guess: once the seller has opened the sheet themselves,
	// `categoryChosenRef` is set and the title stops moving the category.
	//
	// A guess only ever describes the title it was made from. Rewrite the title
	// into something the corpus does not recognise and the guess goes with it,
	// rather than sitting in the field looking like a deliberate answer — which
	// is exactly how a seller ends up publishing a fridge under Cars.
	useEffect(() => {
		if (categoryChosenRef.current || categories.length === 0) return;
		if (dismissedTitleRef.current === form.title) return;

		const match = suggestFromTitle(form.title);
		const nextId = match ? match.category.id : null;
		const currentId = form.category?.id ?? null;
		if (nextId === currentId) return;

		applyCategory(match ? match.category : null, match != null);
	}, [form.title, form.category, categories, suggestFromTitle, applyCategory]);

	// A suspended seller reaching the form would fill it in and only learn of
	// the sanction when publishing fails, so the guard comes before the form.
	if (user && isSuspended(user)) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.sellIconWrap,
							{ backgroundColor: isDark ? "#422006" : "#fef3c7" },
						]}
					>
						<Ionicons name="pricetag" size={22} color="#d97706" />
					</View>
					<Text style={[styles.noUserTitle, { color: textColor }]}>
						{t("create.sell")}
					</Text>
				</View>
				<View
					style={[styles.contentWrap, { backgroundColor: bg, padding: 20 }]}
				>
					<SuspensionBanner />
				</View>
			</SafeAreaView>
		);
	}

	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.sellIconWrap,
							{ backgroundColor: isDark ? "#422006" : "#fef3c7" },
						]}
					>
						<Ionicons name="pricetag" size={22} color="#d97706" />
					</View>
					<Text style={[styles.noUserTitle, { color: textColor }]}>
						{t("create.sell")}
					</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<View style={styles.noUserInner}>
						<View
							style={[
								styles.lockCircle,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Ionicons name="lock-closed" size={32} color={primary} />
						</View>
						<Text style={[styles.noUserHeading, { color: textColor }]}>
							{t("create.loginRequired")}
						</Text>
						<Text style={[styles.noUserSub, { color: mutedColor }]}>
							{t("create.loginRequiredSubtitle")}
						</Text>
						<Pressable
							onPress={() =>
								router.push({
									pathname: "/auth/login",
									params: getAuthModalParams(pathname),
								})
							}
							style={[styles.loginBtn, { backgroundColor: primary }]}
						>
							<Text style={styles.loginBtnText}>{t("auth.login")}</Text>
						</Pressable>
					</View>
				</View>
			</SafeAreaView>
		);
	}

	const colors = {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		border,
		isDark,
		accentBg,
		inputBg,
	};

	const goNext = () => goToStep(steps[stepIndex + 1] ?? "review");

	/** Anything the seller would be sorry to lose. */
	const hasDraft = Boolean(
		form.title.trim() ||
			form.description.trim() ||
			form.category ||
			form.price ||
			form.images.length > 0 ||
			form.tags.length > 0,
	);

	const resetForm = () => {
		const blank = createEmptyForm();
		// The remembered city is a preference, not part of the draft: asking for
		// it again on every new ad is the thing `useUserLocation` exists to avoid.
		if (rememberedPlace?.name) {
			blank.location = rememberedPlace.name;
			blank.coordinates =
				rememberedPlace.lat != null && rememberedPlace.lng != null
					? { lat: rememberedPlace.lat, lng: rememberedPlace.lng }
					: null;
		}
		setForm(blank);
		categoryChosenRef.current = false;
		dismissedTitleRef.current = null;
		setCategoryWasGuessed(false);
		goToStep("describe");
	};

	const discardDraft = () => {
		if (!hasDraft) return;
		showAlert(t("create.discardTitle"), t("create.discardMsg"), [
			{ text: t("common.cancel"), style: "cancel" },
			{
				text: t("create.discardConfirm"),
				style: "destructive",
				onPress: resetForm,
			},
		]);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ── Header ── */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				<Pressable
					onPress={() =>
						stepIndex > 0 ? goToStep(steps[stepIndex - 1]) : router.back()
					}
					style={[styles.backBtn, { backgroundColor: cardBg }]}
				>
					<Ionicons name="arrow-back" size={18} color={textColor} />
				</Pressable>

				{/* Four steps in, "Nouvelle annonce" tells the seller nothing they do
				    not know, while the thing they are describing has long left the
				    screen. The title takes its place as soon as there is one, with the
				    category beside the step so both stay answerable at a glance. */}
				<View style={styles.headerCenter}>
					<Text
						style={[styles.headerTitle, { color: textColor }]}
						numberOfLines={1}
					>
						{form.title.trim() || t("create.newListing")}
					</Text>
					<Text
						style={[styles.headerStep, { color: mutedColor }]}
						numberOfLines={1}
					>
						{form.category?.name
							? t("create.stepLabelWithCategory", {
									current: stepIndex + 1,
									total: totalSteps,
									name: STEP_LABELS[currentStep],
									category: form.category.name,
								})
							: t("create.stepLabel", {
									current: stepIndex + 1,
									total: totalSteps,
									name: STEP_LABELS[currentStep],
								})}
					</Text>
				</View>

				{/* Replaces the "1/5" badge, which repeated the step line directly
				    above it. This tab is never unmounted, so without a way out a
				    half-written ad followed the seller around until they deleted it
				    character by character or restarted the app. */}
				<Pressable
					onPress={discardDraft}
					disabled={!hasDraft}
					style={[
						styles.discardBtn,
						{ backgroundColor: cardBg, opacity: hasDraft ? 1 : 0.4 },
					]}
					accessibilityRole="button"
					accessibilityLabel={t("create.discardTitle")}
				>
					<Ionicons name="trash-outline" size={18} color={mutedColor} />
				</Pressable>
			</View>

			{/* ── Progress bar ── */}
			<View
				style={[
					styles.progressTrack,
					{ backgroundColor: isDark ? "#1e293b" : "#e2e8f0" },
				]}
			>
				<Animated.View
					style={[
						styles.progressFill,
						{ backgroundColor: primary },
						progressBarStyle,
					]}
				/>
			</View>

			{/* ── Content ── */}
			<View
				style={[styles.contentWrap, { backgroundColor: bg }, centeredContent]}
			>
				<Animated.View style={stepAnimStyle}>
					{currentStep === "describe" && (
						<DescribeStep
							form={form}
							setForm={setForm}
							categories={categories}
							onCategoryPick={handleCategoryPick}
							onCategoryClear={handleCategoryClear}
							categoryWasGuessed={categoryWasGuessed}
							onNext={goNext}
							colors={colors}
						/>
					)}
					{currentStep === "details" && (
						<DetailsStep
							form={form}
							setForm={setForm}
							onNext={goNext}
							colors={colors}
						/>
					)}
					{currentStep === "attributes" && (
						<AttributesStep
							form={form}
							setForm={setForm}
							attributes={categoryAttributes}
							onNext={goNext}
							colors={colors}
						/>
					)}
					{currentStep === "photos" && (
						<PhotosStep
							form={form}
							setForm={setForm}
							onNext={goNext}
							colors={colors}
						/>
					)}
					{currentStep === "review" && (
						<ReviewStep
							form={form}
							attributes={categoryAttributes}
							setStep={goToStep}
							onPublished={resetForm}
							colors={colors}
						/>
					)}
				</Animated.View>
			</View>
		</SafeAreaView>
	);
}

// ─── Describe Step ─────────────────────────────────────────────────────────────

/**
 * The opening step: what are you selling, in your own words.
 *
 * The title comes first because it is the one question a seller can always
 * answer, and because it is enough to guess the category from — which is the
 * only reason the category is no longer a wall to climb before starting.
 */
function DescribeStep({
	form,
	setForm,
	categories,
	onCategoryPick,
	onCategoryClear,
	categoryWasGuessed,
	onNext,
	colors,
}: any) {
	const { bg, cardBg, textColor, mutedColor, border, inputBg } = colors;
	const { t } = useTranslation();
	const isProductCategory = isProductListingCategory(form.category);

	const update = (key: string, val: any) =>
		setForm((f: any) => ({ ...f, [key]: val }));

	// The category is the whole point of this step's second half, so moving on
	// without one is not allowed — but it is usually already filled by then.
	const canProceed = Boolean(
		form.title.trim() && form.description.trim() && form.category,
	);

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				{t("create.stepDescribeTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepDescribeHint")}
			</Text>

			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="text-outline"
					label={t("create.titleFieldLabel")}
					required
					colors={colors}
				/>
				<TextInput
					value={form.title}
					onChangeText={(v) => update("title", v)}
					placeholder={
						isProductCategory
							? t("create.titlePlaceholder")
							: t("create.titlePlaceholderGeneric")
					}
					placeholderTextColor={mutedColor}
					style={[
						styles.fieldInput,
						{ color: textColor, borderColor: border, backgroundColor: inputBg },
					]}
					maxLength={100}
					autoFocus
				/>
				<Text style={[styles.charCount, { color: mutedColor }]}>
					{form.title.length}/100
				</Text>

				<View style={[styles.fieldDivider, { backgroundColor: border }]} />

				<FieldHeader
					icon="document-text-outline"
					label={t("create.descriptionFieldLabel")}
					required
					colors={colors}
				/>
				<TextInput
					value={form.description}
					onChangeText={(v) => update("description", v)}
					placeholder={
						isProductCategory
							? t("create.descriptionPlaceholder")
							: t("create.descriptionPlaceholderGeneric")
					}
					placeholderTextColor={mutedColor}
					style={[
						styles.fieldInput,
						styles.multiline,
						{ color: textColor, borderColor: border, backgroundColor: inputBg },
					]}
					multiline
					numberOfLines={5}
					textAlignVertical="top"
				/>
			</View>

			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="grid-outline"
					label={t("create.categoryFieldLabel")}
					required
					colors={colors}
				/>
				<CategoryField
					categories={categories}
					value={form.category}
					onSelect={onCategoryPick}
					onClear={onCategoryClear}
					// Saying the category was guessed is what makes it safe to fill in
					// for the seller: a wrong guess reads as a wrong guess, not as
					// something they chose and can stop reading.
					hint={
						form.category && categoryWasGuessed
							? t("create.categoryGuessedFromTitle")
							: null
					}
					colors={colors}
				/>
			</View>

			<NextButton
				label={t("common.next")}
				onPress={onNext}
				active={canProceed}
				colors={colors}
			/>
		</ScrollView>
	);
}

// ─── Details Step ──────────────────────────────────────────────────────────────

function DetailsStep({ form, setForm, onNext, colors }: any) {
	const {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		border,
		isDark,
		inputBg,
	} = colors;
	const { t } = useTranslation();
	const categoryPreset = getListingFormPreset(form.category);
	const isProductCategory = isProductListingCategory(form.category);
	const showsPrice = categoryPreset.fields.price.enabled;
	const requiresPrice = categoryPreset.fields.price.required;
	const showsCondition = categoryPreset.fields.condition.enabled;
	// A rental says "Loyer mensuel", a job "Salaire" — the category owns the
	// wording, and only when it says nothing do we use the translated default.
	const priceLabel =
		categoryPreset.fields.price.label ?? t("create.priceFieldLabel");

	const CONDITIONS: { key: string; label: string; icon: string }[] = [
		{ key: "new", label: t("conditions.new"), icon: "sparkles-outline" },
		{ key: "like_new", label: t("conditions.likeNew"), icon: "star-outline" },
		{ key: "good", label: t("conditions.good"), icon: "thumbs-up-outline" },
		{ key: "fair", label: t("conditions.fair"), icon: "remove-circle-outline" },
		{ key: "poor", label: t("conditions.poor"), icon: "construct-outline" },
	];

	const { data: tagsData } = useQuery({
		queryKey: ["tags"],
		queryFn: () => api.get<any[]>("/api/public/tags"),
	});
	const availableTags: any[] = Array.isArray(tagsData) ? tagsData : [];

	const update = (key: string, val: any) =>
		setForm((f: any) => ({ ...f, [key]: val }));
	const handleCitySelect = (place: Place) =>
		setForm((f: any) => ({
			...f,
			location: place.name,
			// A place typed by hand has no coordinates; store null rather than
			// an object of undefined, which would break the radius search.
			coordinates:
				place.lat != null && place.lng != null
					? { lat: place.lat, lng: place.lng }
					: null,
		}));
	const handleCityClear = () =>
		setForm((f: any) => ({ ...f, location: "", coordinates: null }));

	const canProceed =
		form.title.trim() &&
		form.description.trim() &&
		form.category &&
		(!requiresPrice || form.price) &&
		form.location.trim();

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				{t("create.stepDetailsTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{isProductCategory
					? t("create.stepDetailsHint")
					: t("create.stepDetailsHintGeneric")}
			</Text>

			{/* The category is not repeated here: it is chosen on the previous step
			    and the header carries it on every step, so a second copy of the
			    same field only added a row to scroll past. */}

			{showsPrice && (
				<View
					style={[
						styles.fieldCard,
						{ backgroundColor: cardBg, borderColor: border },
					]}
				>
					<FieldHeader
						icon="cash-outline"
						label={priceLabel}
						required={requiresPrice}
						colors={colors}
					/>
					<View style={styles.priceRow}>
						<TextInput
							value={form.price}
							// Prices are whole XAF amounts: a decimal separator typed on the
							// "numeric" keypad used to reach the server as NaN.
							onChangeText={(v) => update("price", sanitizePriceInput(v))}
							placeholder={t("create.pricePlaceholder")}
							placeholderTextColor={mutedColor}
							style={[
								styles.priceInput,
								{
									color: textColor,
									borderColor: border,
									backgroundColor: inputBg,
								},
							]}
							keyboardType="number-pad"
						/>
						<View
							style={[
								styles.priceBadge,
								{ backgroundColor: isDark ? "#422006" : "#fef3c7" },
							]}
						>
							<Text style={[styles.priceBadgeText, { color: "#b45309" }]}>
								{t("common.currency", { defaultValue: "XAF" })}
							</Text>
						</View>
					</View>
				</View>
			)}

			{showsCondition && (
				<View
					style={[
						styles.fieldCard,
						{ backgroundColor: cardBg, borderColor: border },
					]}
				>
					<FieldHeader
						icon="shield-checkmark-outline"
						label={t("create.conditionFieldLabel")}
						colors={colors}
					/>
					<View style={styles.conditionWrap}>
						{CONDITIONS.map((c) => {
							const active = form.condition === c.key;
							return (
								<Pressable
									key={c.key}
									onPress={() => update("condition", c.key)}
									style={[
										styles.conditionPill,
										{
											backgroundColor: active ? primary : inputBg,
											borderColor: active ? primary : border,
										},
									]}
								>
									<Ionicons
										name={c.icon as any}
										size={13}
										color={active ? "#fff" : mutedColor}
									/>
									<Text
										style={[
											styles.conditionText,
											{ color: active ? "#fff" : mutedColor },
										]}
									>
										{c.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			)}

			{/* Card: Tags */}
			{availableTags.length > 0 && (
				<View
					style={[
						styles.fieldCard,
						{ backgroundColor: cardBg, borderColor: border },
					]}
				>
					<FieldHeader
						icon="pricetag-outline"
						label={t("create.tagsFieldLabel", { defaultValue: "Tags" })}
						colors={colors}
					/>
					<TagPicker
						selectedIds={form.tags ?? []}
						onChangeIds={(ids) => update("tags", ids)}
						availableTags={availableTags}
						inputBg={inputBg}
						borderColor={border}
						textColor={textColor}
						mutedColor={mutedColor}
						primaryColor={primary}
					/>
				</View>
			)}

			{/* Card: Localisation */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="location-outline"
					label={t("create.locationFieldLabel")}
					required
					colors={colors}
				/>
				<CityPicker
					value={form.location}
					onSelect={handleCitySelect}
					onClear={handleCityClear}
					inputBg={inputBg}
					borderColor={border}
					textColor={textColor}
					mutedColor={mutedColor}
					primaryColor={primary}
				/>
			</View>

			{/* Card: Durée */}
			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				<FieldHeader
					icon="time-outline"
					label={t("create.durationFieldLabel")}
					colors={colors}
				/>
				<View style={styles.durationRow}>
					{DURATIONS.map((d) => {
						const active = form.duration === d;
						return (
							<Pressable
								key={d}
								onPress={() => update("duration", d)}
								style={[
									styles.durationPill,
									{
										backgroundColor: active ? primary : inputBg,
										borderColor: active ? primary : border,
										flex: 1,
									},
								]}
							>
								<Text
									style={[
										styles.durationNum,
										{ color: active ? "#fff" : textColor },
									]}
								>
									{d}
								</Text>
								<Text
									style={[
										styles.durationUnit,
										{ color: active ? "rgba(255,255,255,0.8)" : mutedColor },
									]}
								>
									{t("create.days")}
								</Text>
							</Pressable>
						);
					})}
				</View>
			</View>

			<NextButton
				label={t("create.continue")}
				onPress={canProceed ? onNext : undefined}
				active={!!canProceed}
				colors={colors}
			/>
		</ScrollView>
	);
}

// ─── Attributes Step ───────────────────────────────────────────────────────────

function AttributesStep({ form, setForm, attributes, onNext, colors }: any) {
	const { bg, textColor, mutedColor, border } = colors;
	const { t } = useTranslation();
	const list: ListingAttribute[] = attributes ?? [];

	// The parent skips this step entirely when the category defines no
	// attributes, so this is only a guard against an unexpected render.
	if (list.length === 0) return null;

	const updateAttr = (slug: string, value: any) =>
		setForm((f: any) => ({
			...f,
			attributes: { ...f.attributes, [slug]: value },
		}));

	const sections = groupListingAttributes(list);
	const canProceed = areAttributesValid(list, form.attributes ?? {});

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				{form.category?.name}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepAttributesHint")}
			</Text>

			{sections.map((section) => (
				<View key={section.key}>
					{section.title ? (
						<View style={styles.groupHeadingRow}>
							<Text style={[styles.groupHeading, { color: textColor }]}>
								{section.title}
							</Text>
							<View style={[styles.groupRule, { backgroundColor: border }]} />
						</View>
					) : null}

					{section.attributes.map((attr) => (
						<AttributeField
							key={attr.slug}
							attribute={attr}
							value={form.attributes?.[attr.slug] ?? ""}
							onChange={(v: string) => updateAttr(attr.slug, v)}
							colors={colors}
						/>
					))}
				</View>
			))}

			<NextButton
				label={t("create.continue")}
				onPress={canProceed ? onNext : undefined}
				active={canProceed}
				colors={colors}
			/>
		</ScrollView>
	);
}

/**
 * One category attribute. Every type the admin can define is handled here —
 * a type this does not know about would silently vanish from the form, which is
 * exactly how `date` went missing.
 */
function AttributeField({ attribute, value, onChange, colors }: any) {
	const { cardBg, textColor, mutedColor, primary, border, inputBg } = colors;
	const { t } = useTranslation();
	const attr: ListingAttribute = attribute;
	const issue = getAttributeIssue(attr, value);
	// "Required" is a state the field starts in, not a mistake the user made:
	// only bad input is shown in red, and only once something was typed.
	const showIssue = issue !== null && issue.code !== "required";

	const boundsHint = [
		attr.min !== undefined
			? `${t("common.min", { defaultValue: "Min" })} ${attr.min}`
			: null,
		attr.max !== undefined
			? `${t("common.max", { defaultValue: "Max" })} ${attr.max}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<View
			style={[
				styles.fieldCard,
				{ backgroundColor: cardBg, borderColor: border },
			]}
		>
			<FieldHeader
				icon="pricetag-outline"
				label={attr.name}
				required={attr.required}
				colors={colors}
			/>

			{attr.type === "select" && attr.options.length > 0 ? (
				<View style={styles.conditionWrap}>
					{attr.options.map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => onChange(active ? "" : opt.value)}
								style={[
									styles.conditionPill,
									{
										backgroundColor: active ? primary : inputBg,
										borderColor: active ? primary : border,
									},
								]}
							>
								{active && <Ionicons name="checkmark" size={12} color="#fff" />}
								<Text
									style={[
										styles.conditionText,
										{ color: active ? "#fff" : mutedColor },
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : attr.type === "boolean" ? (
				<View style={[styles.conditionWrap, { gap: 8 }]}>
					{[
						{ label: t("common.yes"), value: "true" },
						{ label: t("common.no"), value: "false" },
					].map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => onChange(active ? "" : opt.value)}
								style={[
									styles.conditionPill,
									{
										backgroundColor: active ? primary : inputBg,
										borderColor: active ? primary : border,
									},
								]}
							>
								{active && <Ionicons name="checkmark" size={12} color="#fff" />}
								<Text
									style={[
										styles.conditionText,
										{ color: active ? "#fff" : mutedColor },
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : (
				<View style={styles.attrInputRow}>
					<TextInput
						value={value}
						onChangeText={(v) =>
							onChange(
								attr.type === "number"
									? sanitizeNumberInput(v)
									: attr.type === "date"
										? maskDateInput(v)
										: v,
							)
						}
						placeholder={
							attr.type === "date"
								? t("create.dateFormatHint", { defaultValue: "JJ/MM/AAAA" })
								: attr.name
						}
						placeholderTextColor={mutedColor}
						keyboardType={
							attr.type === "number"
								? // "numeric" rather than "number-pad": an attribute may allow
									// decimals or a negative minimum.
									"numeric"
								: attr.type === "date"
									? "number-pad"
									: "default"
						}
						maxLength={attr.type === "date" ? 10 : undefined}
						style={[
							styles.fieldInput,
							styles.attrInput,
							{
								color: textColor,
								borderColor: showIssue ? "#ef4444" : border,
								backgroundColor: inputBg,
							},
						]}
					/>
					{/* Units belong next to the value, not in the label: "120 km". */}
					{attr.unit ? (
						<Text style={[styles.attrUnit, { color: mutedColor }]}>
							{attr.unit}
						</Text>
					) : null}
				</View>
			)}

			{showIssue ? (
				<Text style={[styles.attrError, { color: "#ef4444" }]}>
					{attributeIssueMessage(issue, t)}
				</Text>
			) : boundsHint ? (
				<Text style={[styles.attrHint, { color: mutedColor }]}>
					{boundsHint}
				</Text>
			) : null}
		</View>
	);
}

/** Turns a validation issue into a translated sentence. */
function attributeIssueMessage(
	issue: AttributeIssue,
	t: (key: string, options?: any) => string,
): string {
	switch (issue.code) {
		case "required":
			return t("common.required");
		case "min":
			return t("create.attributeMin", {
				defaultValue: "Valeur minimale : {{value}}",
				value: issue.bound,
			});
		case "max":
			return t("create.attributeMax", {
				defaultValue: "Valeur maximale : {{value}}",
				value: issue.bound,
			});
		case "date":
			return t("create.attributeInvalidDate", {
				defaultValue: "Date invalide (JJ/MM/AAAA)",
			});
		default:
			return t("create.attributeInvalidNumber", {
				defaultValue: "Valeur numérique invalide",
			});
	}
}

// ─── Photos Step ───────────────────────────────────────────────────────────────

function PhotosStep({ form, setForm, onNext, colors }: any) {
	const { bg, cardBg, textColor, mutedColor, primary, border, isDark } = colors;
	const { t } = useTranslation();
	// Whether a photo is mandatory is the category's call, not this screen's.
	const photosRequired = getListingFormPreset(form.category).fields.photos
		.required;
	const { showAlert, showError, showWarning } = useAlert();
	const [uploading, setUploading] = useState(false);

	const pickImage = async (fromCamera: boolean) => {
		try {
			if (fromCamera) {
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("create.permissionDenied"),
						t("create.cameraPermissionMsg"),
					);
					return;
				}
			} else {
				const { status } =
					await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("create.permissionDenied"),
						t("create.galleryPermissionMsg"),
					);
					return;
				}
			}

			const result = fromCamera
				? await ImagePicker.launchCameraAsync({
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.85,
					})
				: await ImagePicker.launchImageLibraryAsync({
						mediaTypes: ["images"],
						allowsEditing: true,
						aspect: [4, 3],
						quality: 0.85,
					});

			if (result.canceled || !result.assets?.[0]) return;
			const asset = result.assets[0];

			setUploading(true);
			try {
				const defaultBaseName = `photo_${Date.now()}`;
				const formData = await createMediaUploadFormData(asset, {
					defaultBaseName,
					alt: asset.fileName ?? defaultBaseName,
				});

				const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
					"/api/media",
					formData,
				);
				const mediaId = uploaded?.doc?.id;
				const mediaUri = uploaded?.doc?.url ?? asset.uri;

				if (!mediaId) throw new Error("upload_failed");

				setForm((f: any) => ({
					...f,
					images: [...f.images, { id: mediaId, uri: mediaUri }],
				}));
			} finally {
				setUploading(false);
			}
		} catch (_err: any) {
			setUploading(false);
			showError(t("create.uploadError"), t("create.uploadErrorMsg"));
		}
	};

	const showPicker = () => {
		if (form.images.length >= MAX_LISTING_IMAGES) {
			showWarning(
				t("create.limitReached"),
				t("create.limitReachedMsg", { count: MAX_LISTING_IMAGES }),
			);
			return;
		}
		showAlert(t("create.addPhotoTitle"), t("create.addPhotoSource"), [
			{ text: t("create.camera"), onPress: () => pickImage(true) },
			{ text: t("create.gallery"), onPress: () => pickImage(false) },
			// `create.cancel` was never translated, so the French build showed the
			// key itself on this button. The word already exists under `common`.
			{ text: t("common.cancel"), style: "cancel" },
		]);
	};

	const removeImage = (index: number) => {
		setForm((f: any) => ({
			...f,
			images: f.images.filter((_: any, i: number) => i !== index),
		}));
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				{t("create.stepPhotosTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepPhotosHint", { count: MAX_LISTING_IMAGES })}
			</Text>

			{/* Tip card */}
			<View
				style={[
					styles.tipCard,
					{
						backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
						borderColor: isDark ? "#2d5a9e" : "#bfdbfe",
					},
				]}
			>
				<Ionicons name="information-circle-outline" size={16} color={primary} />
				<Text style={[styles.tipText, { color: primary }]}>
					{isProductListingCategory(form.category)
						? t("create.stepPhotosQualityTip")
						: t("create.stepPhotosQualityTipGeneric", {
								defaultValue:
									"Des photos nettes et bien éclairées rendent votre annonce plus convaincante.",
							})}
				</Text>
			</View>

			<View style={styles.photosGrid}>
				{form.images.map((img: UploadedImage, i: number) => (
					<View
						key={img.id}
						style={[
							styles.photoThumb,
							{ backgroundColor: cardBg, borderColor: border },
						]}
					>
						<Image
							source={{ uri: img.uri }}
							style={{ width: "100%", height: "100%", borderRadius: 12 }}
							contentFit="cover"
						/>
						{i === 0 && (
							<View
								style={[styles.photoPrimaryBadge, { backgroundColor: primary }]}
							>
								<Text style={styles.photoPrimaryText}>{t("create.main")}</Text>
							</View>
						)}
						<Pressable
							onPress={() => removeImage(i)}
							style={styles.photoDeleteBtn}
						>
							<Ionicons name="close-circle" size={22} color="#ef4444" />
						</Pressable>
					</View>
				))}

				{form.images.length < MAX_LISTING_IMAGES && (
					<Pressable
						style={[
							styles.addPhotoBtn,
							{
								backgroundColor: isDark ? "#162032" : "#f0f7ff",
								borderColor: primary,
							},
						]}
						onPress={showPicker}
						disabled={uploading}
					>
						{uploading ? (
							<ActivityIndicator color={primary} />
						) : (
							<>
								<View
									style={[
										styles.addIconCircle,
										{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
									]}
								>
									<Ionicons name="add" size={24} color={primary} />
								</View>
								<Text style={[styles.addPhotoText, { color: primary }]}>
									{t("create.addPhoto")}
								</Text>
							</>
						)}
					</Pressable>
				)}
			</View>

			{photosRequired && form.images.length === 0 && (
				<Text style={[styles.photoRequired, { color: "#ef4444" }]}>
					{t("create.photoRequired")}
				</Text>
			)}
			<NextButton
				label={t("create.continue")}
				onPress={onNext}
				active={!photosRequired || form.images.length > 0}
				colors={colors}
			/>
		</ScrollView>
	);
}

// ─── Review Step ───────────────────────────────────────────────────────────────

function ReviewStep({ form, attributes, setStep, onPublished, colors }: any) {
	const { user } = useAuth();
	const { t } = useTranslation();
	const { showSuccess, showError } = useAlert();
	const { bg, cardBg, textColor, mutedColor, primary, border, isDark } = colors;
	const categoryPreset = getListingFormPreset(form.category);
	const showsPrice = categoryPreset.fields.price.enabled;
	const showsCondition = categoryPreset.fields.condition.enabled;
	const categoryAttributes: ListingAttribute[] = attributes ?? [];

	const CONDITION_LABELS: Record<string, string> = {
		new: t("conditions.new"),
		like_new: t("conditions.likeNew"),
		good: t("conditions.good"),
		fair: t("conditions.fair"),
		poor: t("conditions.poor"),
	};

	const serializedAttributes = serializeAttributeValues(
		categoryAttributes,
		form.attributes ?? {},
	);

	const { mutate: publish, isPending } = useMutation({
		mutationFn: async (status: "draft" | "pending") =>
			api.post<any>("/api/listings", {
				// Without this the server applies the field default ("draft") and
				// the listing never reaches moderation.
				status,
				title: form.title,
				description: form.description,
				duration: form.duration,
				location: form.location,
				...(form.coordinates ? { coordinates: form.coordinates } : {}),
				category: form.category?.id,
				seller: user?.id,
				...(showsPrice && form.price ? { price: Number(form.price) } : {}),
				...(showsCondition && form.condition
					? { condition: form.condition }
					: {}),
				...(form.tags.length > 0 ? { tags: form.tags } : {}),
				images: form.images.map((img: UploadedImage) => ({ image: img.id })),
				// The API validates attribute types strictly (a number sent as a
				// string is rejected), so the form's strings are typed here.
				...(Object.keys(serializedAttributes).length > 0
					? { attributes: serializedAttributes }
					: {}),
			}),
		onSuccess: (_data, status) => {
			showSuccess(
				status === "draft"
					? t("create.draftSavedTitle")
					: t("create.publishSuccess"),
				status === "draft"
					? t("create.draftSavedMsg")
					: t("create.publishSuccessMsg"),
			);
			// The Create tab is never unmounted, so without this the ad that was
			// just published is still sitting in the form the next time it opens.
			onPublished?.();
			router.push("/(tabs)/account");
		},
		onError: (err: any) => {
			showError(
				t("create.publishError"),
				resolveErrorMessage(err, t, t("create.publishErrorMsg")),
			);
		},
	});

	// The server runs the same checks on drafts as on submissions, so both
	// buttons go through this. Only fields the preset actually shows can block:
	// a hidden price is never "missing", and the wizard is rewound to the step
	// that owns the problem rather than failing with a server error.
	const submit = (status: "draft" | "pending") => {
		if (showsPrice && categoryPreset.fields.price.required && !form.price) {
			showError(t("create.publishError"), t("create.priceRequired"));
			setStep("details");
			return;
		}
		if (!areAttributesValid(categoryAttributes, form.attributes ?? {})) {
			showError(t("create.publishError"), t("errors.validation"));
			setStep("attributes");
			return;
		}
		publish(status);
	};

	const attrRows = categoryAttributes
		.map((a) => ({
			attribute: a,
			// Booleans, select labels, units and dates are all rendered the way the
			// category defined them — never as the raw stored string.
			value: formatAttributeValue(a, form.attributes?.[a.slug], {
				yes: t("common.yes"),
				no: t("common.no"),
			}),
		}))
		.filter((row) => row.value !== "")
		.map((row) => ({
			// Slugs are unique per category; names are not, and can clash with
			// a fixed row's translated label.
			id: `attr-${row.attribute.slug}`,
			label: row.attribute.name,
			icon: "pricetag-outline",
			value: row.value,
			step: "attributes",
		}));

	const rows = [
		{
			id: "category",
			label: t("create.categoryFieldLabel"),
			icon: "grid-outline",
			value: form.category?.name ?? "—",
			step: "describe",
		},
		{
			id: "title",
			label: t("create.titleRowLabel"),
			icon: "text-outline",
			value: form.title || "—",
			step: "describe",
		},
		...(showsPrice
			? [
					{
						id: "price",
						label:
							categoryPreset.fields.price.label ?? t("create.priceRowLabel"),
						icon: "cash-outline",
						value: formatPrice(form.price, t),
						step: "details",
					},
				]
			: []),
		...(showsCondition
			? [
					{
						id: "condition",
						label: t("create.conditionRowLabel"),
						icon: "shield-checkmark-outline",
						value: CONDITION_LABELS[form.condition] || form.condition || "—",
						step: "details",
					},
				]
			: []),
		{
			id: "location",
			label: t("create.locationRowLabel"),
			icon: "location-outline",
			value: form.location || "—",
			step: "details",
		},
		...attrRows,
		{
			id: "photos",
			label: t("create.photosRowLabel"),
			icon: "camera-outline",
			value: t("create.photoCount", { count: form.images.length }),
			step: "photos",
		},
	];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text style={[styles.stepTitle, { color: textColor }]}>
				{t("create.stepReviewTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepReviewHint")}
			</Text>

			<View
				style={[
					styles.reviewCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
				{rows.map((row, i) => (
					<View
						key={row.id}
						style={[
							styles.reviewRow,
							{
								borderBottomColor: i < rows.length - 1 ? border : "transparent",
							},
						]}
					>
						<View
							style={[
								styles.reviewIconWrap,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Ionicons name={row.icon as any} size={14} color={primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.reviewLabel, { color: mutedColor }]}>
								{row.label}
							</Text>
							<Text
								style={[styles.reviewValue, { color: textColor }]}
								numberOfLines={1}
							>
								{row.value}
							</Text>
						</View>
						<Pressable
							onPress={() => setStep(row.step)}
							style={[
								styles.editPill,
								{ backgroundColor: isDark ? "#162032" : "#f0f7ff" },
							]}
						>
							<Text style={[styles.editPillText, { color: primary }]}>
								{t("create.editBtn")}
							</Text>
						</Pressable>
					</View>
				))}
			</View>

			{/* Submit for review */}
			<Pressable
				onPress={() => submit("pending")}
				disabled={isPending}
				accessibilityRole="button"
				style={[styles.publishBtn, { backgroundColor: "#f59e0b" }]}
			>
				{isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<>
						<Ionicons name="rocket-outline" size={20} color="#fff" />
						<Text style={styles.publishBtnText}>{t("create.publishBtn")}</Text>
					</>
				)}
			</Pressable>

			{/* Save as a draft — the listing stays private until submitted. */}
			<Pressable
				onPress={() => submit("draft")}
				disabled={isPending}
				accessibilityRole="button"
				style={styles.draftBtn}
			>
				<Ionicons name="document-outline" size={18} color={mutedColor} />
				<Text style={[styles.draftBtnText, { color: mutedColor }]}>
					{t("create.saveDraftBtn")}
				</Text>
			</Pressable>

			<Text style={[styles.publishNote, { color: mutedColor }]}>
				{t("create.publishNote")}
			</Text>
		</ScrollView>
	);
}

/** Grouped amount plus the currency, or an em dash when nothing was entered. */
function formatPrice(
	raw: string,
	t: (key: string, options?: any) => string,
): string {
	const amount = Number.parseInt(raw, 10);
	if (!Number.isFinite(amount)) return "—";
	return `${amount.toLocaleString()} ${t("common.currency", { defaultValue: "XAF" })}`;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function FieldHeader({ icon, label, required, colors }: any) {
	const { textColor, mutedColor, primary } = colors;
	return (
		<View style={styles.fieldHeaderRow}>
			<Ionicons name={icon} size={14} color={primary} />
			<Text style={[styles.fieldLabel, { color: textColor }]}>
				{label}
				{required && <Text style={{ color: "#ef4444" }}> *</Text>}
			</Text>
		</View>
	);
}

function NextButton({ label, onPress, active, colors }: any) {
	const { primary, mutedColor, isDark } = colors;
	return (
		<Pressable
			onPress={active ? onPress : undefined}
			style={[
				styles.nextBtn,
				{
					backgroundColor: active ? primary : isDark ? "#1e293b" : "#e2e8f0",
					opacity: active ? 1 : 0.6,
				},
			]}
		>
			<Text
				style={[styles.nextBtnText, { color: active ? "#fff" : mutedColor }]}
			>
				{label}
			</Text>
			<Ionicons
				name="arrow-forward"
				size={18}
				color={active ? "#fff" : mutedColor}
			/>
		</Pressable>
	);
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── No-user ── */
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},
	sellIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	noUserTitle: {
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
	},
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	noUserInner: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	lockCircle: {
		width: 80,
		height: 80,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 20,
	},
	noUserHeading: {
		fontSize: 22,
		fontFamily: Fonts.displayBold,
		marginBottom: 8,
		textAlign: "center",
	},
	noUserSub: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
		marginBottom: 24,
	},
	loginBtn: {
		borderRadius: 14,
		paddingHorizontal: 32,
		paddingVertical: 14,
	},
	loginBtnText: {
		color: "#fff",
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},

	/* ── Header ── */
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 12,
	},
	backBtn: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 2,
	},
	headerCenter: { flex: 1 },
	headerTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.2,
	},
	headerStep: {
		fontSize: 11,
		fontFamily: Fonts.body,
		marginTop: 1,
	},
	discardBtn: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},

	/* ── Progress ── */
	progressTrack: {
		height: 3,
	},
	progressFill: {
		height: 3,
		borderRadius: 2,
	},

	/* ── Step headings ── */
	stepTitle: {
		fontSize: 22,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
		marginBottom: 6,
	},
	stepSub: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 20,
		marginBottom: 20,
	},

	/* ── Field card ── */
	fieldCard: {
		borderRadius: 16,
		borderWidth: 1,
		padding: 14,
		marginBottom: 12,
		gap: 10,
	},
	fieldHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	fieldLabel: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	fieldDivider: {
		height: 1,
		marginVertical: 2,
	},
	fieldInput: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	multiline: {
		height: 110,
		textAlignVertical: "top",
		paddingTop: 10,
	},
	charCount: {
		fontSize: 11,
		fontFamily: Fonts.body,
		textAlign: "right",
		marginTop: -6,
	},

	/* ── Category attributes ── */
	groupHeadingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 6,
		marginBottom: 10,
	},
	groupHeading: {
		fontSize: 13,
		fontFamily: Fonts.displayBold,
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	groupRule: {
		flex: 1,
		height: 1,
	},
	attrInputRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	attrInput: {
		flex: 1,
	},
	attrUnit: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	attrError: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	attrHint: {
		fontSize: 11,
		fontFamily: Fonts.body,
	},

	/* ── Price ── */
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	priceInput: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	priceBadge: {
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	priceBadgeText: {
		fontSize: 14,
		fontFamily: Fonts.displayBold,
	},

	/* ── Condition ── */
	conditionWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	conditionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	conditionText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Location ── */
	locationRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	locationInput: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},

	/* ── Duration ── */
	durationRow: {
		flexDirection: "row",
		gap: 8,
	},
	durationPill: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	durationNum: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	durationUnit: {
		fontSize: 11,
		fontFamily: Fonts.body,
	},

	/* ── Tip ── */
	tipCard: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		marginBottom: 16,
	},
	tipText: {
		flex: 1,
		fontSize: 12,
		fontFamily: Fonts.body,
		lineHeight: 18,
	},

	/* ── Photos ── */
	photosGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		marginBottom: 8,
	},
	photoThumb: {
		width: 100,
		height: 100,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	photoIndex: {
		fontSize: 20,
		fontFamily: Fonts.displayBold,
	},
	addPhotoBtn: {
		width: 100,
		height: 100,
		borderRadius: 12,
		borderWidth: 2,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	addIconCircle: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	addPhotoText: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},
	photoRequired: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
		marginTop: 8,
	},
	photoPrimaryBadge: {
		position: "absolute",
		bottom: 6,
		left: 6,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	photoPrimaryText: {
		color: "#fff",
		fontSize: 9,
		fontFamily: Fonts.displayBold,
	},
	photoDeleteBtn: {
		position: "absolute",
		top: 4,
		right: 4,
	},
	gpsBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 6,
		marginTop: 2,
	},
	gpsBtnText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Review ── */
	reviewCard: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
		marginBottom: 20,
	},
	reviewRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 13,
		borderBottomWidth: 1,
	},
	reviewIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewLabel: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.3,
		textTransform: "uppercase",
		marginBottom: 1,
	},
	reviewValue: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	editPill: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	editPillText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	publishBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		borderRadius: 16,
		paddingVertical: 16,
		shadowColor: "#f59e0b",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 10,
		elevation: 6,
	},
	publishBtnText: {
		color: "#fff",
		fontSize: 17,
		fontFamily: Fonts.displayBold,
	},
	draftBtn: {
		alignItems: "center",
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		marginTop: 12,
		paddingVertical: 12,
	},
	draftBtnText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 14,
	},
	publishNote: {
		fontSize: 12,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginTop: 12,
		lineHeight: 18,
	},

	/* ── Next button ── */
	nextBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 16,
		paddingVertical: 15,
		marginTop: 8,
	},
	nextBtnText: {
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
});
