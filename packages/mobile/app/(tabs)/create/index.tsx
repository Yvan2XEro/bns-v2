import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	findNodeHandle,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, TextStyles } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { PublishedStamp } from "@/src/components/brand/PublishedStamp";
import { CategoryField } from "@/src/components/CategorySheet";
import { CityPicker } from "@/src/components/CityPicker";
import {
	PriceUnitChips,
	priceUnitToSend,
} from "@/src/components/listing/PriceUnitChips";
import { SuspensionBanner } from "@/src/components/moderation/SuspensionBanner";
import {
	PendingPhotoErrors,
	PendingPhotoTile,
} from "@/src/components/PendingPhotoTile";
import { PublishInShopToggle } from "@/src/components/shop/PublishInShopToggle";
import { TagPicker } from "@/src/components/TagPicker";
import { FieldIssueList } from "@/src/components/ui/FieldIssueList";
import { PhotoLimitNote } from "@/src/components/ui/PhotoLimitNote";
import { StepSegments } from "@/src/components/ui/StepSegments";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCategoryTags } from "@/src/hooks/useCategoryTags";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { usePhoneGate } from "@/src/hooks/usePhoneGate";
import {
	type PhotoUploads,
	usePhotoUploads,
} from "@/src/hooks/usePhotoUploads";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useMyShop } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { createCategorySuggester } from "@/src/lib/categorySuggest";
import { pruneTagIds } from "@/src/lib/categoryTags";
import {
	clearCreateDraft,
	isDraftWorthKeeping,
	loadCreateDraft,
	saveCreateDraft,
} from "@/src/lib/createDraft";
import {
	type FieldIssue,
	issueAt,
	issueMessage,
	serverFieldIssues,
} from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import {
	type AttributeIssue,
	areAttributesValid,
	formatAttributeValue,
	getAttributeIssue,
	getCategoryAttributes,
	getListingFormPreset,
	groupListingAttributes,
	groupPriceDigits,
	isProductListingCategory,
	type ListingAttribute,
	listingDraftIssues,
	maskDateInput,
	sanitizeNumberInput,
	sanitizePriceInput,
	serializeAttributeValues,
} from "@/src/lib/listingForm";
import { defaultPriceUnit, kindPriceText } from "@/src/lib/listingKind";
import { formatPrice as formatMarketPrice } from "@/src/lib/market";
import { isSuspended } from "@/src/lib/moderation";
import { track } from "@/src/lib/monitoring";
import { canAddPhoto } from "@/src/lib/photoLimit";
import { makeMain } from "@/src/lib/photoQueue";
import type { Place } from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { listingIssueStep } from "../../../../api/src/contracts/listingValidation";
import { ANALYTICS_EVENTS } from "../../../../api/src/contracts/monitoring";

const DURATIONS = [30, 60, 90];
/** Space between photo tiles; three tiles and two gaps fill the row. */
const PHOTO_GAP = 10;

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

/**
 * The step that asks for a field. The description is asked with the price and
 * the place rather than on the opening step: a seller holding the item takes
 * its picture before writing a paragraph about it, so the first step only
 * needs a title and the category guessed from it. The server rule is the
 * same; only where the wizard asks for it moved.
 */
function issueStep(path: string): StepId {
	return path.split(".")[0] === "description"
		? "details"
		: listingIssueStep(path);
}

interface UploadedImage {
	id: string; // Payload media document ID
	uri: string; // local URI for preview
}

interface FormData {
	category: any;
	title: string;
	description: string;
	price: string;
	/** What the price covers; the kind's default once a category is picked. */
	priceUnit: string;
	duration: number;
	location: string;
	coordinates: { lat: number; lng: number } | null;
	/** The picked place, for display: a neighbourhood is shown with its city. */
	place: Place | null;
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
		priceUnit: "",
		duration: 30,
		location: "",
		coordinates: null,
		place: null,
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
	const { showAlert, showError, showWarning } = useAlert();
	const didPrefillLocationRef = useRef(false);
	const [step, setStep] = useState<StepId>("describe");
	const [form, setForm] = useState<FormData>(createEmptyForm);
	const { photosIncluded } = useAppConfig();
	/**
	 * Set when the seller leaves the review to change one thing: the step's
	 * button then takes them straight back instead of through every step after.
	 */
	const [returnToReview, setReturnToReview] = useState(false);

	// The upload queue belongs to the wizard, not to the photo step: photos
	// still sending survive a step change, and a reset can cancel them before
	// they land in the next ad.
	const uploads = usePhotoUploads({
		alt: form.title,
		onUploaded: (photo) =>
			setForm((f) => ({ ...f, images: [...f.images, photo] })),
	});
	const cancelUploads = uploads.cancelAll;

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

	// What the API would refuse, by step. Shown once the seller tries to move
	// on; the server's own refusal is shown until the form changes.
	// Tags belong to the category: once the new category's tags are known, the
	// ones it does not get are dropped, and the shared rule checks the rest.
	const { tags: categoryTags, applicableIds: applicableTagIds } =
		useCategoryTags(form.category?.id);
	useEffect(() => {
		if (!applicableTagIds) return;
		setForm((f) => {
			const tags = pruneTagIds(f.tags, applicableTagIds);
			return tags === f.tags ? f : { ...f, tags };
		});
	}, [applicableTagIds]);

	const draftIssues = useMemo(
		() =>
			listingDraftIssues(form, categoryAttributes, {
				applicableTags: applicableTagIds,
				photoLimit: photosIncluded,
			}),
		[form, categoryAttributes, applicableTagIds, photosIncluded],
	);
	const [attempted, setAttempted] = useState(false);
	const [refused, setRefused] = useState<{
		form: FormData;
		issues: FieldIssue[];
	} | null>(null);
	const serverIssues = refused?.form === form ? refused.issues : [];

	// The wizard for this category: a step only exists when it has something
	// to ask. A category with no attributes never shows an attributes step, and
	// one that does not want photos never shows a photos step — rather than
	// showing them and skipping past, which left the counter describing pages
	// the seller never saw.
	const steps = useMemo<StepId[]>(() => {
		// Characteristics follow the category directly: they are the questions
		// that category asks, and answering them right after choosing it keeps
		// one train of thought. Price and duration are about selling
		// rather than about the thing, so they come after.
		// Photos come right after the title: a seller holding the thing takes
		// its picture first, and a listing with photos sells.
		const list: StepId[] = ["describe"];
		if (preset.fields.photos?.enabled !== false) list.push("photos");
		if (hasAttributes) list.push("attributes");
		list.push("details");
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
	const stepRef = useRef<StepId>("describe");
	// Reduce Motion: the step fades in place instead of sliding.
	const reduceMotion = useReducedMotion();
	// The step line in the header. After a step change a screen reader is
	// moved there, so it reads the new step instead of staying where the
	// Continue button was.
	const stepHeaderRef = useRef<Text>(null);

	const goToStep = (next: StepId) => {
		const target = steps.includes(next) ? next : "describe";
		const from = steps.indexOf(stepRef.current);
		const to = steps.indexOf(target);
		const dir = to > from ? 1 : -1;
		translateX.value = reduceMotion ? 0 : dir * SCREEN_W * 0.25;
		opacity.value = 0;
		stepRef.current = target;
		setStep(target);
		if (target === "review") setReturnToReview(false);
		setTimeout(() => {
			const node = stepHeaderRef.current
				? findNodeHandle(stepHeaderRef.current)
				: null;
			if (node) AccessibilityInfo.setAccessibilityFocus(node);
		}, 350);
		// The system's decelerating ease (0.16, 1, 0.3, 1), as everywhere else.
		const ease = Easing.bezier(0.16, 1, 0.3, 1);
		translateX.value = withTiming(0, { duration: 300, easing: ease });
		opacity.value = withTiming(1, { duration: 220, easing: ease });
	};

	const stepAnimStyle = useAnimatedStyle(() => ({
		flex: 1,
		transform: [{ translateX: translateX.value }],
		opacity: opacity.value,
	}));

	// Every colour comes from the Ndop tokens. `primary` is the brand word
	// colour (links, icons, outlines) and `fill` the one behind a white label:
	// in dark mode the two differ, because white on the night primary falls
	// under 4.5:1.
	const C = Colors[isDark ? "dark" : "light"];
	const bg = C.background;
	const cardBg = C.card;
	const textColor = C.foreground;
	const mutedColor = C.mutedForeground;
	const primary = C.link;
	const fill = C.primaryFill;
	const border = C.border;
	// The wizard sits on the ground: the indigo shell belongs to home, auth and
	// onboarding only.
	const accentBg = C.background;
	const inputBg = C.well;

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
						place: rememberedPlace,
						coordinates:
							rememberedPlace.lat != null && rememberedPlace.lng != null
								? { lat: rememberedPlace.lat, lng: rememberedPlace.lng }
								: null,
					},
		);
	}, [locationHydrated, rememberedPlace]);

	// The ad lives on the phone as it is written: a killed app, a call or a
	// flat battery no longer costs the seller what they typed.
	const userId = user?.id ? String(user.id) : null;
	const draftCheckedRef = useRef<string | null>(null);
	const [published, setPublished] = useState<{
		id: string;
		title: string;
	} | null>(null);
	useEffect(() => {
		if (!userId || draftCheckedRef.current === userId) return;
		draftCheckedRef.current = userId;
		void loadCreateDraft<FormData>(userId).then((saved) => {
			if (!saved || !isDraftWorthKeeping(saved)) return;
			// Naming the ad lets the seller decide before "start over" deletes it.
			const savedTitle =
				typeof saved.title === "string" ? saved.title.trim() : "";
			const message = savedTitle
				? t("create.resumeMsgWithTitle", {
						title: savedTitle,
						defaultValue:
							"Votre annonce « {{title}} » n’est pas terminée. La reprendre ?",
					})
				: t("create.resumeMsg");
			showAlert(t("create.resumeTitle"), message, [
				{
					text: t("create.resumeDiscard"),
					style: "destructive",
					onPress: () => void clearCreateDraft(userId),
				},
				{
					text: t("create.resumeConfirm"),
					onPress: () => {
						// A category in the draft was the seller's answer or an
						// accepted guess: either way, the title no longer moves it.
						categoryChosenRef.current = Boolean(saved.category);
						setForm({ ...createEmptyForm(), ...saved });
					},
				},
			]);
		});
	}, [userId, showAlert, t]);
	// Once per ad: the moment the seller starts, to measure the time to publish.
	const startedRef = useRef(false);
	const worthKeeping = isDraftWorthKeeping(form);
	useEffect(() => {
		if (!worthKeeping) {
			startedRef.current = false;
			return;
		}
		if (startedRef.current) return;
		startedRef.current = true;
		track(ANALYTICS_EVENTS.listingStarted, { platform: "mobile" });
	}, [worthKeeping]);
	useEffect(() => {
		if (!userId) return;
		const timer = setTimeout(() => {
			if (isDraftWorthKeeping(form)) void saveCreateDraft(userId, form);
		}, 500);
		return () => clearTimeout(timer);
	}, [form, userId]);

	/**
	 * Moves the form to a category, dropping whatever belonged to the previous
	 * one. Attributes are keyed by slugs that belong to a single category, and a
	 * price the new category hides can neither be seen nor removed by the
	 * seller — keeping either would submit answers to questions this
	 * category never asked.
	 */
	const applyCategory = useCallback(
		(next: any, guessed: boolean) => {
			setCategoryWasGuessed(guessed);
			// Photos still sending would land in an ad that no longer has a photo
			// step, where they could be neither seen nor removed.
			if (getListingFormPreset(next).fields.photos?.enabled === false) {
				cancelUploads();
			}
			setForm((f: any) => {
				if (f.category?.id === next?.id) return f;
				const nextPreset = getListingFormPreset(next);
				return {
					...f,
					category: next,
					price: nextPreset.fields.price.enabled ? f.price : "",
					priceUnit: defaultPriceUnit(nextPreset.categoryType),
					attributes: {},
					// The photo step disappears with the category, so keeping the files
					// would attach pictures the seller can no longer see or remove.
					images: nextPreset.fields.photos?.enabled === false ? [] : f.images,
				};
			});
		},
		[cancelUploads],
	);

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
						style={[styles.sellIconWrap, { backgroundColor: C.sun }]}
						importantForAccessibility="no-hide-descendants"
					>
						<Ionicons name="pricetag" size={22} color={C.sunForeground} />
					</View>
					<Text
						style={[styles.noUserTitle, { color: textColor }]}
						accessibilityRole="header"
					>
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
						style={[styles.sellIconWrap, { backgroundColor: C.sun }]}
						importantForAccessibility="no-hide-descendants"
					>
						<Ionicons name="pricetag" size={22} color={C.sunForeground} />
					</View>
					<Text
						style={[styles.noUserTitle, { color: textColor }]}
						accessibilityRole="header"
					>
						{t("create.sell")}
					</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<View style={styles.noUserInner}>
						<View
							style={[styles.lockCircle, { backgroundColor: C.primaryTint }]}
							importantForAccessibility="no-hide-descendants"
						>
							<Ionicons name="lock-closed" size={32} color={primary} />
						</View>
						<Text
							style={[styles.noUserHeading, { color: textColor }]}
							accessibilityRole="header"
						>
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
							accessibilityRole="button"
							style={[
								styles.loginBtn,
								styles.loginBtnWide,
								{ backgroundColor: fill },
							]}
						>
							<Text style={styles.loginBtnText}>{t("auth.login")}</Text>
						</Pressable>
						{/* A first-time seller has no account yet: signing up is the
						    step they need, not one to discover behind "log in". */}
						<Pressable
							onPress={() =>
								router.push({
									pathname: "/auth/register",
									params: getAuthModalParams(pathname),
								})
							}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.textBtn,
								{ opacity: pressed ? 0.6 : 1 },
							]}
						>
							<Text style={[styles.textBtnText, { color: primary }]}>
								{t("auth.createAccount")}
							</Text>
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
		fill,
		border,
		isDark,
		accentBg,
		inputBg,
		C,
	};

	const issuesOn = (id: StepId): FieldIssue[] => {
		const onStep = (issue: FieldIssue) => issueStep(issue.path) === id;
		const server = serverIssues.filter(onStep);
		const local = attempted
			? draftIssues.filter(
					(issue) =>
						onStep(issue) && !server.some((known) => known.path === issue.path),
				)
			: [];
		return [...server, ...local];
	};
	const blockedOn = (id: StepId) =>
		draftIssues.some((issue) => issueStep(issue.path) === id);
	const firstStepWith = (issues: FieldIssue[]) =>
		steps.find((id) => issues.some((issue) => issueStep(issue.path) === id));

	/**
	 * A photo still sending, or one that failed, has no media id yet. Moving on
	 * used to let it vanish from view, and publishing dropped it without a word.
	 */
	const photosSettled = () => {
		if (uploads.uploading) {
			showWarning(t("create.photosStillUploading"));
			return false;
		}
		if (uploads.failed) {
			showWarning(
				t("create.photosFailedOnNext", {
					defaultValue:
						"Une photo n’a pas été envoyée. Réessayez-la ou retirez-la pour continuer.",
				}),
			);
			return false;
		}
		return true;
	};

	const onBlocked = () => {
		setAttempted(true);
		AccessibilityInfo.announceForAccessibility(t("formIssues.fixStep"));
	};

	const goNext = () => {
		if (blockedOn(currentStep)) {
			onBlocked();
			return;
		}
		if (currentStep === "photos" && !photosSettled()) return;
		setAttempted(false);
		if (returnToReview) {
			// Back to the review, unless the change left a later step incomplete
			// (a new category clears its characteristics, for one).
			const later = steps
				.slice(stepIndex + 1)
				.find((id) => id !== "review" && blockedOn(id));
			goToStep(later ?? "review");
			return;
		}
		goToStep(steps[stepIndex + 1] ?? "review");
	};
	const stepGate = {
		issues: issuesOn(currentStep),
		blocked: blockedOn(currentStep),
		onBlocked,
		label: returnToReview
			? t("create.backToReview", { defaultValue: "Revenir à la vérification" })
			: undefined,
	};

	/** From the review, "Modifier" opens the step and comes straight back. */
	const editFromReview = (target: StepId) => {
		goToStep(target);
		setReturnToReview(true);
	};

	/** The last gate before sending: rewinds to the step that owns a problem. */
	const readyToSubmit = () => {
		if (!photosSettled()) {
			if (steps.includes("photos")) goToStep("photos");
			return false;
		}
		const blocking = firstStepWith(draftIssues);
		if (!blocking) return true;
		setAttempted(true);
		goToStep(blocking);
		showError(t("create.publishError"), t("formIssues.fixStep"));
		return false;
	};
	const handleRefused = (issues: FieldIssue[]) => {
		setRefused({ form, issues });
		const step = firstStepWith(issues);
		if (step) goToStep(step);
	};

	/** Anything the seller would be sorry to lose. */
	const hasDraft = isDraftWorthKeeping(form);

	const resetForm = () => {
		const blank = createEmptyForm();
		// The remembered city is a preference, not part of the draft: asking for
		// it again on every new ad is the thing `useUserLocation` exists to avoid.
		if (rememberedPlace?.name) {
			blank.location = rememberedPlace.name;
			blank.place = rememberedPlace;
			blank.coordinates =
				rememberedPlace.lat != null && rememberedPlace.lng != null
					? { lat: rememberedPlace.lat, lng: rememberedPlace.lng }
					: null;
		}
		setForm(blank);
		// Nothing still sending may land in the next ad.
		cancelUploads();
		setReturnToReview(false);
		if (userId) void clearCreateDraft(userId);
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

	if (published) {
		return (
			<PublishedView
				listing={published}
				colors={colors}
				onAnother={() => setPublished(null)}
			/>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ── Header ── */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				{/* On the first step there is nowhere to go back to: inside a tab,
				    router.back() did nothing or jumped to another tab. The bin on
				    the right is the way out of a started ad. */}
				{stepIndex > 0 ? (
					<Pressable
						onPress={() => goToStep(steps[stepIndex - 1])}
						hitSlop={4}
						accessibilityRole="button"
						accessibilityLabel={t("common.back")}
						style={({ pressed }) => [
							styles.backBtn,
							{
								backgroundColor: cardBg,
								borderColor: border,
								opacity: pressed ? 0.7 : 1,
							},
						]}
					>
						<Ionicons name="arrow-back" size={20} color={textColor} />
					</Pressable>
				) : (
					<View style={styles.headerSpacer} />
				)}

				{/* Four steps in, "Nouvelle annonce" tells the seller nothing they do
				    not know, while the thing they are describing has long left the
				    screen. The title takes its place as soon as there is one, with the
				    category beside the step so both stay answerable at a glance. */}
				<View style={styles.headerCenter}>
					<Text
						style={[styles.headerTitle, { color: textColor }]}
						numberOfLines={1}
						accessibilityRole="header"
					>
						{form.title.trim() || t("create.newListing")}
					</Text>
					<Text
						ref={stepHeaderRef}
						accessible
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
					hitSlop={4}
					style={({ pressed }) => [
						styles.discardBtn,
						{
							backgroundColor: cardBg,
							borderColor: border,
							opacity: !hasDraft ? 0.4 : pressed ? 0.7 : 1,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={t("create.discardTitle")}
					accessibilityState={{ disabled: !hasDraft }}
				>
					<Ionicons name="trash-outline" size={20} color={mutedColor} />
				</Pressable>
			</View>

			{/* ── Progress: one segment per step ── */}
			<StepSegments count={steps.length} current={stepIndex} />

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
							gate={stepGate}
							colors={colors}
						/>
					)}
					{currentStep === "details" && (
						<DetailsStep
							form={form}
							setForm={setForm}
							availableTags={categoryTags}
							onNext={goNext}
							gate={stepGate}
							colors={colors}
						/>
					)}
					{currentStep === "attributes" && (
						<AttributesStep
							form={form}
							setForm={setForm}
							attributes={categoryAttributes}
							onNext={goNext}
							gate={stepGate}
							colors={colors}
						/>
					)}
					{currentStep === "photos" && (
						<PhotosStep
							form={form}
							setForm={setForm}
							uploads={uploads}
							onNext={goNext}
							gate={stepGate}
							colors={colors}
							photoLimit={photosIncluded}
						/>
					)}
					{currentStep === "review" && (
						<ReviewStep
							form={form}
							attributes={categoryAttributes}
							availableTags={categoryTags}
							setStep={editFromReview}
							onPublished={(listing: { id: string; title: string } | null) => {
								resetForm();
								if (listing) setPublished(listing);
							}}
							readyToSubmit={readyToSubmit}
							onRefused={handleRefused}
							serverIssues={serverIssues}
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
	gate,
	colors,
}: any) {
	const { bg, cardBg, textColor, mutedColor, border, inputBg, C } = colors;
	const { t } = useTranslation();
	const isProductCategory = isProductListingCategory(form.category);

	const update = (key: string, val: any) =>
		setForm((f: any) => ({ ...f, [key]: val }));

	// The category is the whole point of this step's second half, so moving on
	// without one is not allowed — but it is usually already filled by then.
	// The description is asked on the details step, after the photos.
	const canProceed = Boolean(form.title.trim() && form.category);
	const titleIssue = issueAt(gate.issues, "title");

	return (
		<KeyboardAwareScrollView
			bottomOffset={24}
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text
				style={[styles.stepTitle, { color: textColor }]}
				accessibilityRole="header"
			>
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
						{
							color: textColor,
							borderColor: titleIssue ? C.destructive : border,
							backgroundColor: inputBg,
						},
					]}
					maxLength={100}
					autoFocus
					// Without a name TalkBack read the placeholder as if it were typed.
					accessibilityLabel={`${t("create.titleFieldLabel")}, ${t("common.required")}`}
				/>
				<FieldIssueLine issue={titleIssue} colors={colors} />
				<Text
					style={[styles.charCount, { color: mutedColor }]}
					importantForAccessibility="no"
				>
					{form.title.length}/100
				</Text>
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
					// White glyphs sit on the fill; the ring and check take the link.
					colors={{ ...colors, link: C.link }}
				/>
			</View>

			<FieldIssueLine
				issue={issueAt(gate.issues, "category")}
				colors={colors}
			/>
			<NextButton
				label={gate.label ?? t("common.next")}
				onPress={canProceed && !gate.blocked ? onNext : gate.onBlocked}
				colors={colors}
			/>
		</KeyboardAwareScrollView>
	);
}

// ─── Details Step ──────────────────────────────────────────────────────────────

function DetailsStep({
	form,
	setForm,
	availableTags,
	onNext,
	gate,
	colors,
}: any) {
	const {
		bg,
		cardBg,
		textColor,
		mutedColor,
		primary,
		fill,
		border,
		inputBg,
		C,
	} = colors;
	const { t } = useTranslation();
	const categoryPreset = getListingFormPreset(form.category);
	const isProductCategory = isProductListingCategory(form.category);
	const showsPrice = categoryPreset.fields.price.enabled;
	const requiresPrice = categoryPreset.fields.price.required;
	// A rental says "Loyer mensuel", a job "Salaire" — the category owns the
	// wording, and only when it says nothing do we use the translated default.
	const priceLabel =
		categoryPreset.fields.price.label ?? t("create.priceFieldLabel");

	const update = (key: string, val: any) =>
		setForm((f: any) => ({ ...f, [key]: val }));
	const handleCitySelect = (place: Place) =>
		setForm((f: any) => ({
			...f,
			location: place.name,
			place,
			// A place typed by hand has no coordinates; store null rather than
			// an object of undefined, which would break the radius search.
			coordinates:
				place.lat != null && place.lng != null
					? { lat: place.lat, lng: place.lng }
					: null,
		}));
	const handleCityClear = () =>
		setForm((f: any) => ({
			...f,
			location: "",
			coordinates: null,
			place: null,
		}));

	const canProceed =
		form.title.trim() &&
		form.description.trim() &&
		form.category &&
		(!requiresPrice || form.price) &&
		form.location.trim();
	const descriptionIssue = issueAt(gate.issues, "description");
	const priceIssue = issueAt(gate.issues, "price");
	const locationIssue = issueAt(gate.issues, "location");

	return (
		<KeyboardAwareScrollView
			bottomOffset={24}
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text
				style={[styles.stepTitle, { color: textColor }]}
				accessibilityRole="header"
			>
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

			<View
				style={[
					styles.fieldCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
			>
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
						{
							color: textColor,
							borderColor: descriptionIssue ? C.destructive : border,
							backgroundColor: inputBg,
						},
					]}
					multiline
					numberOfLines={5}
					textAlignVertical="top"
					accessibilityLabel={`${t("create.descriptionFieldLabel")}, ${t("common.required")}`}
				/>
				<FieldIssueLine issue={descriptionIssue} colors={colors} />
			</View>

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
							value={groupPriceDigits(form.price)}
							// Prices are whole XAF amounts: a decimal separator typed on the
							// "numeric" keypad used to reach the server as NaN. Shown grouped
							// ("1 500 000") so a zero too many is seen; stored as digits.
							onChangeText={(v) => update("price", sanitizePriceInput(v))}
							placeholder={t("create.pricePlaceholder")}
							placeholderTextColor={mutedColor}
							style={[
								styles.priceInput,
								{
									color: textColor,
									borderColor: priceIssue ? C.destructive : border,
									backgroundColor: inputBg,
								},
							]}
							keyboardType="number-pad"
							accessibilityLabel={
								requiresPrice
									? `${priceLabel}, ${t("common.required")}`
									: priceLabel
							}
						/>
						{/* The currency sits on the yellow tag every price wears, so
						    the field already reads as the price it will become. */}
						<View
							style={[styles.priceBadge, { backgroundColor: C.sun }]}
							importantForAccessibility="no-hide-descendants"
						>
							<Text style={[styles.priceBadgeText, { color: C.sunForeground }]}>
								{t("common.currency", { defaultValue: "XAF" })}
							</Text>
						</View>
					</View>
					<FieldIssueLine issue={priceIssue} colors={colors} />
					<PriceUnitChips
						kind={categoryPreset.categoryType}
						value={form.priceUnit}
						onChange={(unit) => update("priceUnit", unit)}
						colors={{ textColor, mutedColor, primary, border }}
					/>
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
					value={form.place ?? form.location}
					onSelect={handleCitySelect}
					onClear={handleCityClear}
					inputBg={inputBg}
					borderColor={locationIssue ? C.destructive : border}
					textColor={textColor}
					mutedColor={mutedColor}
				/>
				<FieldIssueLine issue={locationIssue} colors={colors} />
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
				<View style={styles.durationRow} accessibilityRole="radiogroup">
					{DURATIONS.map((d) => {
						const active = form.duration === d;
						return (
							<Pressable
								key={d}
								onPress={() => update("duration", d)}
								accessibilityRole="radio"
								accessibilityState={{ checked: active }}
								accessibilityLabel={`${d} ${t("create.days")}`}
								style={[
									styles.durationPill,
									{
										backgroundColor: active ? fill : inputBg,
										borderColor: active ? fill : border,
										flex: 1,
									},
								]}
							>
								<Text
									style={[
										styles.durationNum,
										{ color: active ? "#ffffff" : textColor },
									]}
								>
									{d}
								</Text>
								<Text
									style={[
										styles.durationUnit,
										{ color: active ? "#ffffff" : mutedColor },
									]}
								>
									{t("create.days")}
								</Text>
							</Pressable>
						);
					})}
				</View>
				{/* What the number means, so a choice that matters little is
				    not one to hesitate over. */}
				<Text style={[styles.attrHint, { color: mutedColor }]}>
					{t("create.durationHint", {
						defaultValue:
							"Ensuite, l’annonce expire. Vous pourrez la renouveler depuis Mes annonces.",
					})}
				</Text>
			</View>

			<FieldIssueList issues={gate.issues} attributes={[]} />
			<NextButton
				label={gate.label ?? t("create.continue")}
				onPress={canProceed && !gate.blocked ? onNext : gate.onBlocked}
				colors={colors}
			/>
		</KeyboardAwareScrollView>
	);
}

// ─── Attributes Step ───────────────────────────────────────────────────────────

function AttributesStep({
	form,
	setForm,
	attributes,
	onNext,
	gate,
	colors,
}: any) {
	const { bg, cardBg, textColor, mutedColor, border } = colors;
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
		<KeyboardAwareScrollView
			bottomOffset={24}
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
			keyboardShouldPersistTaps="handled"
		>
			<Text
				style={[styles.stepTitle, { color: textColor }]}
				accessibilityRole="header"
			>
				{form.category?.name}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepAttributesHint")}
			</Text>

			{sections.map((section) => (
				<View key={section.key}>
					{section.title ? (
						<View style={styles.groupHeadingRow}>
							<Text
								style={[styles.groupHeading, { color: textColor }]}
								accessibilityRole="header"
							>
								{section.title}
							</Text>
							<View style={[styles.groupRule, { backgroundColor: border }]} />
						</View>
					) : null}

					{/* One card per section, the questions separated by hairlines:
					    a card and an icon per attribute turned eight answers into
					    a long, repetitive scroll. */}
					<View
						style={[
							styles.fieldCard,
							styles.attrCard,
							{ backgroundColor: cardBg, borderColor: border },
						]}
					>
						{section.attributes.map((attr, index) => (
							<AttributeField
								key={attr.slug}
								attribute={attr}
								first={index === 0}
								value={form.attributes?.[attr.slug] ?? ""}
								onChange={(v: string) => updateAttr(attr.slug, v)}
								colors={colors}
							/>
						))}
					</View>
				</View>
			))}

			<FieldIssueList issues={gate.issues} attributes={list} />
			<NextButton
				label={gate.label ?? t("create.continue")}
				onPress={canProceed && !gate.blocked ? onNext : gate.onBlocked}
				colors={colors}
			/>
		</KeyboardAwareScrollView>
	);
}

/**
 * One category attribute. Every type the admin can define is handled here —
 * a type this does not know about would silently vanish from the form, which is
 * exactly how `date` went missing.
 */
function AttributeField({ attribute, first, value, onChange, colors }: any) {
	const { textColor, mutedColor, fill, border, inputBg, C } = colors;
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

	// A required answer cannot be cleared by tapping it again: a tap meant to
	// confirm the choice used to erase it. Optional ones still toggle off.
	const pick = (option: string, active: boolean) =>
		onChange(active && !attr.required ? "" : option);

	return (
		<View
			style={[
				styles.attrRow,
				!first && {
					borderTopWidth: StyleSheet.hairlineWidth,
					borderTopColor: border,
				},
			]}
		>
			<FieldHeader label={attr.name} required={attr.required} colors={colors} />

			{attr.type === "select" && attr.options.length > 0 ? (
				<View style={styles.conditionWrap} accessibilityRole="radiogroup">
					{attr.options.map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => pick(opt.value, active)}
								accessibilityRole="radio"
								accessibilityState={{ checked: active }}
								style={[
									styles.conditionPill,
									{
										backgroundColor: active ? fill : inputBg,
										borderColor: active ? fill : border,
									},
								]}
							>
								{active && (
									<Ionicons name="checkmark" size={14} color="#ffffff" />
								)}
								<Text
									style={[
										styles.conditionText,
										{ color: active ? "#ffffff" : textColor },
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : attr.type === "boolean" ? (
				<View style={styles.conditionWrap} accessibilityRole="radiogroup">
					{[
						{ label: t("common.yes"), value: "true" },
						{ label: t("common.no"), value: "false" },
					].map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => pick(opt.value, active)}
								accessibilityRole="radio"
								accessibilityState={{ checked: active }}
								style={[
									styles.conditionPill,
									{
										backgroundColor: active ? fill : inputBg,
										borderColor: active ? fill : border,
									},
								]}
							>
								{active && (
									<Ionicons name="checkmark" size={14} color="#ffffff" />
								)}
								<Text
									style={[
										styles.conditionText,
										{ color: active ? "#ffffff" : textColor },
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
						accessibilityLabel={attr.name}
						style={[
							styles.fieldInput,
							styles.attrInput,
							{
								color: textColor,
								borderColor: showIssue ? C.destructive : border,
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
				<Text
					style={[styles.attrError, { color: C.dangerText }]}
					accessibilityRole="alert"
				>
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

function PhotosStep({
	form,
	setForm,
	uploads,
	onNext,
	gate,
	colors,
	photoLimit,
}: any) {
	const { bg, cardBg, textColor, mutedColor, primary, fill, border, C } =
		colors;
	const { t } = useTranslation();
	// Three tiles to a row at any width: measured from the grid itself, so the
	// centred column on a tablet is respected.
	const [gridWidth, setGridWidth] = useState(0);
	const tile =
		gridWidth > 0 ? Math.floor((gridWidth - PHOTO_GAP * 2) / 3) : 100;
	const tileSize = { width: tile, height: tile };
	// Whether a photo is mandatory is the category's call, not this screen's.
	const photosRequired = getListingFormPreset(form.category).fields.photos
		.required;
	const { showAlert, showWarning } = useAlert();
	// Owned by the wizard (see CreateScreen), so it survives this step.
	const queue: PhotoUploads = uploads;
	const taken = form.images.length + queue.pending.length;
	const full = !canAddPhoto(taken, photoLimit);
	const remaining = Math.max(0, photoLimit - taken);
	const pickImage = (fromCamera: boolean) =>
		void queue.pick(fromCamera, remaining);

	const showPicker = () => {
		if (full) {
			showWarning(t("create.limitReached"), t("photoLimit.moreSoon"));
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
			<Text
				style={[styles.stepTitle, { color: textColor }]}
				accessibilityRole="header"
			>
				{t("create.stepPhotosTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepPhotosHint", { count: photoLimit })}
			</Text>

			{/* Tip card */}
			<View style={[styles.tipCard, { backgroundColor: C.primaryTint }]}>
				<Ionicons
					name="bulb-outline"
					size={18}
					color={primary}
					importantForAccessibility="no"
				/>
				<Text style={[styles.tipText, { color: textColor }]}>
					{isProductListingCategory(form.category)
						? t("create.stepPhotosQualityTip")
						: t("create.stepPhotosQualityTipGeneric")}
				</Text>
			</View>

			<View
				style={styles.photosGrid}
				onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
			>
				{form.images.map((img: UploadedImage, i: number) => (
					<View
						key={img.id}
						style={[
							styles.photoThumb,
							tileSize,
							{ backgroundColor: cardBg, borderColor: border },
						]}
					>
						<Image
							source={{ uri: img.uri }}
							style={StyleSheet.absoluteFill}
							contentFit="cover"
							accessibilityIgnoresInvertColors
						/>
						{i === 0 ? (
							<View
								style={[styles.photoPrimaryBadge, { backgroundColor: fill }]}
							>
								<Text style={styles.photoPrimaryText}>{t("create.main")}</Text>
							</View>
						) : (
							// The first photo is the one on every card: any other can
							// take its place.
							<Pressable
								onPress={() =>
									setForm((f: any) => ({ ...f, images: makeMain(f.images, i) }))
								}
								accessibilityRole="button"
								accessibilityLabel={t("create.makeMain")}
								hitSlop={8}
								style={styles.photoMakeMainBtn}
							>
								<Ionicons name="star-outline" size={16} color="#ffffff" />
							</Pressable>
						)}
						<Pressable
							onPress={() => removeImage(i)}
							hitSlop={10}
							accessibilityRole="button"
							accessibilityLabel={t("create.removePhoto")}
							style={styles.photoDeleteBtn}
						>
							{/* The same ink disc as a photo still uploading: one way to
							    remove a picture, legible on any photo. */}
							<Ionicons name="close" size={16} color="#ffffff" />
						</Pressable>
					</View>
				))}
				{queue.pending.map((photo) => (
					<PendingPhotoTile
						key={photo.key}
						photo={photo}
						onRetry={() => queue.retry(photo.key)}
						onRemove={() => queue.remove(photo.key)}
						style={[
							styles.photoThumb,
							tileSize,
							{ backgroundColor: cardBg, borderColor: border },
						]}
					/>
				))}

				<Pressable
					style={({ pressed }) => [
						styles.addPhotoBtn,
						tileSize,
						{
							backgroundColor: pressed ? C.primaryTint : cardBg,
							borderColor: primary,
						},
						full && { opacity: 0.4 },
					]}
					onPress={showPicker}
					disabled={full}
					accessibilityRole="button"
					accessibilityLabel={t("create.addPhoto")}
					accessibilityState={{ disabled: full }}
				>
					<View
						style={[styles.addIconCircle, { backgroundColor: C.primaryTint }]}
					>
						<Ionicons name="camera-outline" size={22} color={primary} />
					</View>
					<Text
						style={[styles.addPhotoText, { color: primary }]}
						numberOfLines={2}
					>
						{t("create.addPhoto")}
					</Text>
				</Pressable>
			</View>
			{/* Counts the photos still sending too, as the add button does. */}
			<PhotoLimitNote count={taken} limit={photoLimit} color={mutedColor} />
			<PendingPhotoErrors photos={queue.pending} />

			{/* Required is where the step starts, not a mistake: a hint until a
			    blocked Continue, after which the issue list below says it. */}
			{photosRequired && taken === 0 && gate.issues.length === 0 && (
				<Text style={[styles.photoRequired, { color: mutedColor }]}>
					{t("create.photoRequired")}
				</Text>
			)}
			<FieldIssueList issues={gate.issues} attributes={[]} />
			{queue.uploading && (
				<Text
					style={[styles.stepSub, styles.uploadingNote, { color: mutedColor }]}
					accessibilityLiveRegion="polite"
				>
					{t("create.photosStillUploading")}
				</Text>
			)}
			<NextButton
				label={gate.label ?? t("create.continue")}
				onPress={gate.blocked ? gate.onBlocked : onNext}
				colors={colors}
			/>
		</ScrollView>
	);
}

// ─── Review Step ───────────────────────────────────────────────────────────────

function ReviewStep({
	form,
	attributes,
	availableTags,
	setStep,
	onPublished,
	readyToSubmit,
	onRefused,
	serverIssues,
	colors,
}: any) {
	const { user } = useAuth();
	const { t, i18n } = useTranslation();
	const { showSuccess, showError } = useAlert();
	const { bg, cardBg, textColor, mutedColor, primary, border, C } = colors;
	const { data: myShop } = useMyShop();
	const activeShop = myShop?.shop?.status === "active" ? myShop.shop : null;
	const [publishInShop, setPublishInShop] = useState(true);
	const categoryPreset = getListingFormPreset(form.category);
	const showsPrice = categoryPreset.fields.price.enabled;
	const categoryAttributes: ListingAttribute[] = attributes ?? [];

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
				...(activeShop && publishInShop ? { shop: activeShop.id } : {}),
				...(showsPrice && form.price
					? {
							price: Number(form.price),
							priceUnit: priceUnitToSend(
								categoryPreset.categoryType,
								form.priceUnit,
							),
						}
					: {}),
				...(form.tags.length > 0 ? { tags: form.tags } : {}),
				images: form.images.map((img: UploadedImage) => ({ image: img.id })),
				// The API validates attribute types strictly (a number sent as a
				// string is rejected), so the form's strings are typed here.
				...(Object.keys(serializedAttributes).length > 0
					? { attributes: serializedAttributes }
					: {}),
			}),
		onSuccess: (data, status) => {
			// The Create tab is never unmounted, so without this the ad that was
			// just published is still sitting in the form the next time it opens.
			if (status === "draft") {
				showSuccess(t("create.draftSavedTitle"), t("create.draftSavedMsg"));
				onPublished?.(null);
				// Straight to the list that holds the draft, rather than the busy
				// account screen with no pointer to it.
				router.push({
					pathname: "/account/listings",
					params: { filter: "draft" },
				});
				return;
			}
			const id = data?.doc?.id ?? data?.id;
			track(ANALYTICS_EVENTS.listingPublished, {
				platform: "mobile",
				photos: form.images.length,
				category_id: form.category?.id ?? null,
			});
			onPublished?.(id ? { id: String(id), title: form.title } : null);
			if (!id) router.push("/(tabs)/account");
		},
		onError: (err: any) => {
			const refused = serverFieldIssues(err);
			if (refused.length > 0) {
				onRefused(refused);
				showError(t("create.publishError"), t("formIssues.serverRefused"));
				return;
			}
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
	// Publishing needs a verified phone; a draft does not.
	const { requirePhone } = usePhoneGate();
	const submit = (status: "draft" | "pending") => {
		if (status === "pending" && !requirePhone("publishListing")) return;
		if (readyToSubmit()) publish(status);
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

	const tagNames: string[] = (form.tags ?? [])
		.map(
			(id: string) =>
				(availableTags ?? []).find((tag: any) => String(tag.id) === id)?.name,
		)
		.filter(Boolean);
	const showsPhotos = categoryPreset.fields.photos?.enabled !== false;
	const cover: UploadedImage | undefined = form.images[0];
	const priceText = showsPrice
		? kindPriceText(
				form.price ? formatPrice(form.price, i18n.language) : null,
				{
					kind: categoryPreset.categoryType,
					priceUnit: priceUnitToSend(
						categoryPreset.categoryType,
						form.priceUnit,
					),
				},
				(key) => t(`listingKind.${key}`),
			)
		: null;

	const rows: {
		id: string;
		label: string;
		icon: string;
		value: string;
		step: string;
		tag?: boolean;
		lines?: number;
	}[] = [
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
						value: kindPriceText(
							form.price ? formatPrice(form.price, i18n.language) : null,
							{
								kind: categoryPreset.categoryType,
								priceUnit: priceUnitToSend(
									categoryPreset.categoryType,
									form.priceUnit,
								),
							},
							(key) => t(`listingKind.${key}`),
						),
						step: "details",
						tag: true,
					},
				]
			: []),
		{
			id: "description",
			label: t("create.descriptionFieldLabel"),
			icon: "document-text-outline",
			value: form.description.trim() || "—",
			step: "details",
			lines: 3,
		},
		{
			id: "location",
			label: t("create.locationRowLabel"),
			icon: "location-outline",
			value: form.location || "—",
			step: "details",
		},
		...(tagNames.length > 0
			? [
					{
						id: "tags",
						label: t("create.tagsFieldLabel", { defaultValue: "Tags" }),
						icon: "pricetags-outline",
						value: tagNames.join(", "),
						step: "details",
					},
				]
			: []),
		{
			id: "duration",
			label: t("create.durationFieldLabel"),
			icon: "time-outline",
			value: `${form.duration} ${t("create.days")}`,
			step: "details",
		},
		...attrRows,
		...(showsPhotos
			? [
					{
						id: "photos",
						label: t("create.photosRowLabel"),
						icon: "camera-outline",
						value: t("create.photoCount", { count: form.images.length }),
						step: "photos",
					},
				]
			: []),
	];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: bg }}
			contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
		>
			<Text
				style={[styles.stepTitle, { color: textColor }]}
				accessibilityRole="header"
			>
				{t("create.stepReviewTitle")}
			</Text>
			<Text style={[styles.stepSub, { color: mutedColor }]}>
				{t("create.stepReviewHint")}
			</Text>

			{/* The ad as a buyer meets it first: cover photo, title, price tag
			    and place. This is what the seller checks before sending. */}
			<View
				style={[
					styles.previewCard,
					{ backgroundColor: cardBg, borderColor: border },
				]}
				accessible
				accessibilityLabel={[form.title, priceText, form.location]
					.filter(Boolean)
					.join(", ")}
			>
				{showsPhotos ? (
					cover ? (
						<Image
							source={{ uri: cover.uri }}
							style={styles.previewImage}
							contentFit="cover"
							accessibilityIgnoresInvertColors
						/>
					) : (
						<View
							style={[
								styles.previewImage,
								styles.previewImageEmpty,
								{ backgroundColor: C.well },
							]}
						>
							<Ionicons name="image-outline" size={24} color={mutedColor} />
						</View>
					)
				) : null}
				<View style={styles.previewText}>
					<Text
						style={[styles.previewTitle, { color: textColor }]}
						numberOfLines={2}
					>
						{form.title || "—"}
					</Text>
					{priceText && form.price ? (
						<View style={[styles.reviewPriceTag, { backgroundColor: C.sun }]}>
							<Text
								style={[styles.reviewPriceText, { color: C.sunForeground }]}
								numberOfLines={1}
							>
								{priceText}
							</Text>
						</View>
					) : null}
					{form.location ? (
						<View style={styles.previewPlace}>
							<Ionicons name="location-outline" size={14} color={mutedColor} />
							<Text
								style={[styles.previewPlaceText, { color: mutedColor }]}
								numberOfLines={1}
							>
								{form.location}
							</Text>
						</View>
					) : null}
				</View>
			</View>

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
								{ backgroundColor: C.primaryTint },
							]}
							importantForAccessibility="no-hide-descendants"
						>
							<Ionicons name={row.icon as any} size={16} color={primary} />
						</View>
						<View style={styles.reviewText}>
							<Text style={[styles.reviewLabel, { color: mutedColor }]}>
								{row.label}
							</Text>
							{/* The price wears its tag here as it will on the card:
							    ink on signage yellow, in the display face. */}
							{row.tag && form.price ? (
								<View
									style={[styles.reviewPriceTag, { backgroundColor: C.sun }]}
								>
									<Text
										style={[styles.reviewPriceText, { color: C.sunForeground }]}
										numberOfLines={1}
									>
										{row.value}
									</Text>
								</View>
							) : (
								<Text
									style={[styles.reviewValue, { color: textColor }]}
									numberOfLines={row.lines ?? 2}
								>
									{row.value}
								</Text>
							)}
						</View>
						<Pressable
							onPress={() => setStep(row.step)}
							hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
							accessibilityRole="button"
							accessibilityLabel={`${t("create.editBtn")}, ${row.label}`}
							style={({ pressed }) => [
								styles.editPill,
								{ backgroundColor: pressed ? C.primaryTint : "transparent" },
							]}
						>
							<Text style={[styles.editPillText, { color: primary }]}>
								{t("create.editBtn")}
							</Text>
						</Pressable>
					</View>
				))}
			</View>

			{activeShop ? (
				<PublishInShopToggle
					shopName={activeShop.name}
					value={publishInShop}
					onChange={setPublishInShop}
				/>
			) : null}

			<FieldIssueList issues={serverIssues} attributes={categoryAttributes} />

			{/* Submit for review */}
			<Pressable
				onPress={() => submit("pending")}
				disabled={isPending}
				accessibilityRole="button"
				accessibilityLabel={t("create.publishBtn")}
				accessibilityState={{ busy: isPending, disabled: isPending }}
				style={({ pressed }) => [
					styles.publishBtn,
					{
						backgroundColor: C.sun,
						transform: [{ scale: pressed && !isPending ? 0.98 : 1 }],
					},
				]}
			>
				{isPending ? (
					<ActivityIndicator color={C.sunForeground} />
				) : (
					<>
						<Ionicons
							name="pricetag-outline"
							size={20}
							color={C.sunForeground}
						/>
						<Text style={[styles.publishBtnText, { color: C.sunForeground }]}>
							{t("create.publishBtn")}
						</Text>
					</>
				)}
			</Pressable>

			{/* Save as a draft — the listing stays private until submitted. */}
			<Pressable
				onPress={() => submit("draft")}
				disabled={isPending}
				accessibilityRole="button"
				accessibilityState={{ disabled: isPending }}
				style={({ pressed }) => [
					styles.draftBtn,
					{ opacity: pressed ? 0.6 : 1 },
				]}
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

/**
 * The amount in the market's format, as every price in the app reads — the
 * bare `toLocaleString()` it replaced gave "150,000" on an English device.
 */
function formatPrice(raw: string, lang: string): string {
	const amount = Number.parseInt(raw, 10);
	if (!Number.isFinite(amount)) return "—";
	return formatMarketPrice(amount, lang);
}

// ─── Published ─────────────────────────────────────────────────────────────────

/**
 * After sending: the ad is under review, not live. One filled action (see it)
 * and a quiet one (post another). There is no share button here: a link to a
 * listing still under review opens "not found" for everyone but its owner, so
 * sharing waits for the notification that says it is online.
 */
function PublishedView({
	listing,
	colors,
	onAnother,
}: {
	listing: { id: string; title: string };
	colors: {
		bg: string;
		textColor: string;
		mutedColor: string;
		fill: string;
		primary: string;
	};
	onAnother: () => void;
}) {
	const { t } = useTranslation();
	const { bg, textColor, mutedColor, fill, primary } = colors;
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={styles.publishedWrap}>
				<PublishedStamp />
				<Text
					style={[styles.noUserHeading, { color: textColor }]}
					accessibilityRole="header"
				>
					{t("create.publishSuccess")}
				</Text>
				<Text style={[styles.noUserSub, { color: mutedColor }]}>
					{t("create.publishSuccessMsg")}
				</Text>
				<View style={styles.publishedNotice}>
					<Ionicons
						name="notifications-outline"
						size={18}
						color={primary}
						importantForAccessibility="no"
					/>
					<Text style={[styles.publishedNoticeText, { color: textColor }]}>
						{t("create.publishedNotify", {
							defaultValue:
								"Vous recevrez une notification dès qu’elle sera en ligne. Vous pourrez alors la partager.",
						})}
					</Text>
				</View>
				<Pressable
					onPress={() => router.push(`/listing/${listing.id}`)}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.loginBtn,
						{ backgroundColor: fill, opacity: pressed ? 0.85 : 1 },
					]}
				>
					<Text style={styles.loginBtnText}>{t("create.viewListing")}</Text>
				</Pressable>
				<Pressable
					onPress={onAnother}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.textBtn,
						{ opacity: pressed ? 0.6 : 1 },
					]}
				>
					<Text style={[styles.textBtnText, { color: primary }]}>
						{t("create.postAnother")}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function FieldHeader({ icon, label, required, colors }: any) {
	const { textColor, primary } = colors;
	const { t } = useTranslation();
	return (
		<View style={styles.fieldHeaderRow}>
			{icon ? (
				<Ionicons
					name={icon}
					size={16}
					color={primary}
					importantForAccessibility="no"
				/>
			) : null}
			{/* Read as "Titre, obligatoire" rather than "Titre étoile". */}
			<Text
				style={[styles.fieldLabel, { color: textColor }]}
				accessibilityLabel={
					required ? `${label}, ${t("common.required")}` : label
				}
			>
				{label}
				{required && <Text style={{ color: colors.C.dangerText }}> *</Text>}
			</Text>
		</View>
	);
}

/** What the server or the form refuses on a field, right under it. */
function FieldIssueLine({
	issue,
	colors,
}: {
	issue: FieldIssue | undefined;
	colors: { C: { dangerText: string } };
}) {
	const { t } = useTranslation();
	if (!issue) return null;
	return (
		<Text
			style={[styles.attrError, { color: colors.C.dangerText }]}
			accessibilityRole="alert"
		>
			{issueMessage(t, issue)}
		</Text>
	);
}

/**
 * Always drawn as the step's primary action. It used to turn grey (and say
 * "disabled" to screen readers) while a field was missing, so sellers never
 * tapped it and never learned what was missing; a tap now flags the fields.
 */
function NextButton({ label, onPress, colors }: any) {
	const { fill } = colors;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => [
				styles.nextBtn,
				{
					backgroundColor: fill,
					borderColor: fill,
					transform: [{ scale: pressed ? 0.98 : 1 }],
				},
			]}
		>
			<Text style={[styles.nextBtnText, { color: "#ffffff" }]}>{label}</Text>
			<Ionicons name="arrow-forward" size={18} color="#ffffff" />
		</Pressable>
	);
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	publishedWrap: {
		flex: 1,
		alignItems: "stretch",
		justifyContent: "center",
		padding: 24,
		gap: 12,
	},
	safe: { flex: 1 },
	publishedNotice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		marginBottom: 12,
		maxWidth: 360,
		alignSelf: "center",
	},
	publishedNoticeText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
	},
	textBtn: {
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	textBtnText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodySemibold },

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
		borderRadius: 12,
		// The sell plaque's darker foot, as on the tab bar.
		borderBottomWidth: 3,
		borderBottomColor: "#9a6a00",
		alignItems: "center",
		justifyContent: "center",
	},
	noUserTitle: {
		fontSize: 24,
		lineHeight: 32,
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
		fontSize: 24,
		lineHeight: 32,
		fontFamily: Fonts.displayBold,
		marginBottom: 8,
		textAlign: "center",
	},
	noUserSub: {
		fontSize: 15,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 24,
		maxWidth: 320,
	},
	loginBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		minHeight: 52,
		paddingHorizontal: 24,
		paddingVertical: 14,
	},
	loginBtnWide: { alignSelf: "stretch" },
	loginBtnText: {
		color: "#ffffff",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
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
	headerSpacer: { width: 44, height: 44 },
	backBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},
	headerCenter: { flex: 1 },
	headerTitle: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.2,
	},
	headerStep: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
		marginTop: 1,
	},
	discardBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},

	/* ── Progress ── */

	/* ── Step headings ── */
	// One question per step, set as the screen's title (h2): the header above
	// already carries the listing's own name.
	stepTitle: {
		...TextStyles.h2,
		marginTop: 4,
		marginBottom: 6,
	},
	stepSub: {
		...TextStyles.body,
		marginBottom: 20,
	},
	uploadingNote: { marginTop: 8, marginBottom: 0 },

	/* ── Field card ── */
	fieldCard: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		marginBottom: 12,
		gap: 10,
	},
	fieldHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	fieldLabel: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	fieldDivider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: 4,
	},
	fieldInput: {
		minHeight: 48,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	multiline: {
		minHeight: 120,
		textAlignVertical: "top",
		lineHeight: 22,
	},
	charCount: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
		fontVariant: ["tabular-nums"],
		textAlign: "right",
		marginTop: -4,
	},

	/* ── Category attributes ── */
	attrCard: { gap: 0, paddingVertical: 4 },
	attrRow: { gap: 10, paddingVertical: 12 },
	groupHeadingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 12,
		marginBottom: 10,
	},
	groupHeading: {
		...TextStyles.h4,
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
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	attrError: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
	},
	attrHint: {
		fontSize: 12,
		lineHeight: 16,
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
		minHeight: 56,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		fontVariant: ["tabular-nums"],
	},
	priceBadge: {
		minHeight: 56,
		borderRadius: 10,
		paddingHorizontal: 14,
		justifyContent: "center",
	},
	priceBadgeText: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
	},

	/* ── Option pills ── */
	conditionWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	conditionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44,
		borderRadius: 22,
		borderWidth: 1,
		paddingHorizontal: 16,
	},
	conditionText: {
		fontSize: 15,
		lineHeight: 22,
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
		minHeight: 56,
		borderRadius: 12,
		borderWidth: 1,
		paddingVertical: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	durationNum: {
		fontSize: 20,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	durationUnit: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyMedium,
	},

	/* ── Tip ── */
	tipCard: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		padding: 12,
		marginBottom: 16,
	},
	tipText: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
		lineHeight: 22,
	},

	/* ── Photos ── */
	photosGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: PHOTO_GAP,
		marginBottom: 8,
	},
	photoThumb: {
		width: 100,
		height: 100,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	photoIndex: {
		fontSize: 20,
		lineHeight: 28,
		fontFamily: Fonts.displayBold,
	},
	addPhotoBtn: {
		width: 100,
		height: 100,
		borderRadius: 14,
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		padding: 6,
	},
	addIconCircle: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	addPhotoText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	photoRequired: {
		fontSize: 13,
		lineHeight: 18,
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
		color: "#ffffff",
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyBold,
	},
	photoMakeMainBtn: {
		position: "absolute",
		bottom: 6,
		left: 6,
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "rgba(18, 22, 58, 0.7)",
		alignItems: "center",
		justifyContent: "center",
	},
	photoDeleteBtn: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "rgba(18, 22, 58, 0.7)",
		alignItems: "center",
		justifyContent: "center",
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
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Review ── */
	previewCard: {
		flexDirection: "row",
		gap: 12,
		padding: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		marginBottom: 12,
	},
	previewImage: { width: 88, height: 88, borderRadius: 12 },
	previewImageEmpty: { alignItems: "center", justifyContent: "center" },
	previewText: { flex: 1, gap: 6, justifyContent: "center" },
	previewTitle: {
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.displaySemibold,
	},
	previewPlace: { flexDirection: "row", alignItems: "center", gap: 4 },
	previewPlaceText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
	},
	reviewCard: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		marginBottom: 20,
	},
	reviewRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		paddingLeft: 14,
		paddingRight: 8,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	reviewIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewText: { flex: 1, gap: 2 },
	reviewLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyMedium,
	},
	reviewValue: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	reviewPriceTag: {
		alignSelf: "flex-start",
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 2,
		marginTop: 2,
	},
	reviewPriceText: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.3,
	},
	editPill: {
		minHeight: 36,
		borderRadius: 10,
		paddingHorizontal: 10,
		justifyContent: "center",
	},
	editPillText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	publishBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		borderRadius: 12,
		minHeight: 56,
		paddingVertical: 14,
		// The sign plaque, as on the sell tab: a darker foot, no glow.
		borderBottomWidth: 3,
		borderBottomColor: "#9a6a00",
	},
	publishBtnText: {
		color: "#12163a",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
	draftBtn: {
		alignItems: "center",
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		minHeight: 48,
		marginTop: 8,
	},
	draftBtnText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 22,
	},
	publishNote: {
		fontSize: 13,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 19,
	},

	/* ── Next button ── */
	nextBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 52,
		paddingVertical: 14,
		marginTop: 12,
	},
	nextBtnText: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
});
