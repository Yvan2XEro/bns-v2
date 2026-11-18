import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, TextStyles } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { CityPicker } from "@/src/components/CityPicker";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import {
	PriceUnitChips,
	priceUnitToSend,
} from "@/src/components/listing/PriceUnitChips";
import { SkeletonBox } from "@/src/components/listing/Skeletons";
import {
	PendingPhotoErrors,
	PendingPhotoTile,
} from "@/src/components/PendingPhotoTile";
import { FieldIssueText } from "@/src/components/seller/FieldIssueText";
import { PublishInShopToggle } from "@/src/components/shop/PublishInShopToggle";
import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { TagPicker } from "@/src/components/TagPicker";
import { FieldIssueList } from "@/src/components/ui/FieldIssueList";
import { PhotoLimitNote } from "@/src/components/ui/PhotoLimitNote";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCategoryTags } from "@/src/hooks/useCategoryTags";
import { CATEGORIES_STALE_TIME_MS } from "@/src/hooks/useListings";
import { usePhoneGate } from "@/src/hooks/usePhoneGate";
import { usePhotoUploads } from "@/src/hooks/usePhotoUploads";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useMyShop } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { pruneTagIds } from "@/src/lib/categoryTags";
import {
	type FieldIssue,
	issueAt,
	serverFieldIssues,
} from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import {
	type AttributeIssue,
	deserializeAttributeValues,
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
import { listingKindRules } from "@/src/lib/listingKind";
import { canAddPhoto } from "@/src/lib/photoLimit";
import { makeMain } from "@/src/lib/photoQueue";
import type { Place } from "@/src/lib/places";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { rejectionText } from "../../../../api/src/contracts/listingRejection";

const DURATIONS = [30, 60, 90];

type ImageItem = { id: string; uri: string };

/** The Ndop tokens for the current appearance. */
function usePalette() {
	return Colors[useColorScheme() === "dark" ? "dark" : "light"];
}

/** How the listing's current state reads, by what it asks of the seller. */
const STATUS_TONE: Record<string, StatusTone> = {
	draft: "neutral",
	pending: "warning",
	published: "success",
	rejected: "danger",
	sold: "info",
	expired: "neutral",
};

function SectionCard({
	icon,
	title,
	children,
	cardBg,
	borderColor,
	textColor,
}: any) {
	const C = usePalette();
	return (
		<View
			style={[styles.sectionCard, { backgroundColor: cardBg, borderColor }]}
		>
			<View style={styles.sectionHeader}>
				<View
					style={[styles.sectionIconBox, { backgroundColor: C.primaryTint }]}
					importantForAccessibility="no-hide-descendants"
				>
					<Ionicons name={icon} size={16} color={C.link} />
				</View>
				<Text
					style={[styles.sectionTitle, { color: textColor }]}
					accessibilityRole="header"
				>
					{title}
				</Text>
			</View>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

function FieldLabel({ label, required }: any) {
	const C = usePalette();
	return (
		<Text style={[styles.fieldLabel, { color: C.foreground }]}>
			{label}
			{required && <Text style={{ color: C.dangerText }}> *</Text>}
		</Text>
	);
}

/** Translates one attribute validation issue. */
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

/**
 * One category attribute. Handles every type an admin can define, including
 * `date`, which the form used to drop silently, and shows the unit and bounds
 * the category declares.
 */
function EditAttributeField({
	attribute,
	value,
	onChange,
	textColor,
	mutedColor,
	primaryColor,
	borderColor,
	inputBg,
}: {
	attribute: ListingAttribute;
	value: string;
	onChange: (value: string) => void;
	textColor: string;
	mutedColor: string;
	primaryColor: string;
	borderColor: string;
	inputBg: string;
}) {
	const { t } = useTranslation();
	const C = usePalette();
	const issue = getAttributeIssue(attribute, value);
	// A field left empty is not an error the user made yet; bad input is.
	const showIssue = issue !== null && issue.code !== "required";

	const bounds = [
		attribute.min !== undefined
			? `${t("common.min", { defaultValue: "Min" })} ${attribute.min}`
			: null,
		attribute.max !== undefined
			? `${t("common.max", { defaultValue: "Max" })} ${attribute.max}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={styles.fieldGroup}>
			<FieldLabel
				label={attribute.name}
				required={attribute.required}
				mutedColor={mutedColor}
			/>

			{attribute.type === "select" && attribute.options.length > 0 ? (
				<View style={styles.pillRow} accessibilityRole="radiogroup">
					{attribute.options.map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => onChange(active ? "" : opt.value)}
								accessibilityRole="radio"
								accessibilityState={{ checked: active }}
								style={[
									styles.pill,
									{
										backgroundColor: active ? primaryColor : inputBg,
										borderColor: active ? primaryColor : borderColor,
									},
								]}
							>
								{active && (
									<Ionicons name="checkmark" size={14} color="#ffffff" />
								)}
								<Text
									style={[
										styles.pillText,
										{ color: active ? "#ffffff" : textColor },
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : attribute.type === "boolean" ? (
				<View style={styles.pillRow} accessibilityRole="radiogroup">
					{[
						{ label: t("common.yes"), value: "true" },
						{ label: t("common.no"), value: "false" },
					].map((opt) => {
						const active = value === opt.value;
						return (
							<Pressable
								key={opt.value}
								onPress={() => onChange(active ? "" : opt.value)}
								accessibilityRole="radio"
								accessibilityState={{ checked: active }}
								style={[
									styles.pill,
									{
										backgroundColor: active ? primaryColor : inputBg,
										borderColor: active ? primaryColor : borderColor,
									},
								]}
							>
								{active && (
									<Ionicons name="checkmark" size={14} color="#ffffff" />
								)}
								<Text
									style={[
										styles.pillText,
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
				<View
					style={[
						styles.inputRow,
						{
							backgroundColor: inputBg,
							borderColor: showIssue ? C.destructive : borderColor,
						},
					]}
				>
					<TextInput
						value={value}
						onChangeText={(v) =>
							onChange(
								attribute.type === "number"
									? sanitizeNumberInput(v)
									: attribute.type === "date"
										? maskDateInput(v)
										: v,
							)
						}
						placeholder={
							attribute.type === "date"
								? t("create.dateFormatHint", { defaultValue: "JJ/MM/AAAA" })
								: attribute.name
						}
						placeholderTextColor={mutedColor}
						keyboardType={
							attribute.type === "number"
								? // "numeric" rather than "number-pad": an attribute may allow
									// decimals or a negative minimum.
									"numeric"
								: attribute.type === "date"
									? "number-pad"
									: "default"
						}
						maxLength={attribute.type === "date" ? 10 : undefined}
						accessibilityLabel={attribute.name}
						style={[styles.rowInput, { color: textColor }]}
					/>
					{/* The unit sits with the value, e.g. "120 km". */}
					{attribute.unit ? (
						<Text style={[styles.attrUnit, { color: mutedColor }]}>
							{attribute.unit}
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
			) : bounds ? (
				<Text style={[styles.attrHint, { color: mutedColor }]}>{bounds}</Text>
			) : null}
		</View>
	);
}

export default function EditListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const queryClient = useQueryClient();
	const { showSuccess, showError, showAlert, showWarning } = useAlert();
	const { t } = useTranslation();
	const { photosIncluded } = useAppConfig();

	// Ndop tokens. `primaryColor` is for brand words, rings and icons; `fill`
	// sits behind white labels (white on the night primary falls under 4.5:1).
	const C = Colors[isDark ? "dark" : "light"];
	const bg = C.background;
	const cardBg = C.card;
	const textColor = C.foreground;
	const mutedColor = C.mutedForeground;
	const primaryColor = C.link;
	const fill = C.primaryFill;
	const borderColor = C.border;
	const inputBg = C.well;

	const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<any>(`/api/listings/${id}?depth=2`),
		enabled: !!id,
	});

	const listing = data?.doc ?? data;

	// `/api/listings/:id?depth=2` normally embeds the whole category, preset and
	// attributes included. When it comes back as a bare id — a shallower depth, a
	// cached payload — the form would otherwise fall back to a generic preset and
	// lose every category attribute, so the category is fetched on its own.
	const embeddedCategory =
		listing?.category && typeof listing.category === "object"
			? listing.category
			: null;
	const categoryId =
		typeof listing?.category === "string"
			? listing.category
			: (embeddedCategory?.id ?? null);
	const { data: fetchedCategory } = useQuery({
		queryKey: ["category", categoryId],
		queryFn: () => api.get<any>(`/api/public/categories?id=${categoryId}`),
		enabled: !!categoryId && !embeddedCategory?.formPreset,
		staleTime: CATEGORIES_STALE_TIME_MS,
	});
	const category = embeddedCategory?.formPreset
		? embeddedCategory
		: (fetchedCategory ?? embeddedCategory);

	const categoryPreset = getListingFormPreset(category);
	const isProductCategory = isProductListingCategory(category);
	const showsPrice = categoryPreset.fields.price.enabled;
	const requiresPrice = categoryPreset.fields.price.required;
	const priceLabel = categoryPreset.fields.price.label ?? t("edit.priceLabel");

	// ── Form state ─────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	// An ad saved without a unit was a one-off price, and stays one until the
	// seller says otherwise.
	const [priceUnit, setPriceUnit] = useState("total");
	// The reason in the seller's language, whoever moderated the listing.
	const rejection = listing
		? rejectionText(listing, (code) => t(`listingRejection.${code}`))
		: null;
	const [location, setLocation] = useState("");
	const [coordinates, setCoordinates] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [duration, setDuration] = useState(30);
	const [attributes, setAttributes] = useState<Record<string, any>>({});
	const [images, setImages] = useState<ImageItem[]>([]);
	const [nextStatus, setNextStatus] = useState<"draft" | "pending">("pending");
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const { data: myShop } = useMyShop();
	const activeShop = myShop?.shop?.status === "active" ? myShop.shop : null;
	const [inShop, setInShop] = useState(false);

	// The listing's own shop, whatever it is — never assumed to be the
	// signed-in seller's current shop. Toggling is only ever offered when the
	// two agree (or the listing has none yet), so this never silently moves a
	// listing to a different shop than the one it already belongs to.
	const currentShopId: string | null = listing?.shop
		? typeof listing.shop === "object"
			? (listing.shop.id ?? null)
			: listing.shop
		: null;
	const shopMismatch = Boolean(
		activeShop && currentShopId && currentShopId !== activeShop.id,
	);
	const wasInShop = Boolean(listing?.shop);

	// The form as loaded, to tell an edit from what the server sent. Bumped by
	// each hydration below; the snapshot is taken on the render after it.
	const [hydration, setHydration] = useState(0);
	const [baseline, setBaseline] = useState<string | null>(null);

	// Initialize once listing is loaded
	useEffect(() => {
		if (!listing) return;
		setHydration((n) => n + 1);
		const s = listing.status ?? "pending";
		setNextStatus(s === "draft" ? "draft" : "pending");
		setTitle(listing.title ?? "");
		setInShop(Boolean(listing.shop));
		setDescription(listing.description ?? "");
		setPrice(listing.price != null ? String(listing.price) : "");
		setPriceUnit(listing.priceUnit ?? "total");
		setLocation(listing.location ?? "");
		if (listing.coordinates?.lat && listing.coordinates?.lng) {
			setCoordinates({
				lat: listing.coordinates.lat,
				lng: listing.coordinates.lng,
			});
		}
		setDuration(listing.duration ?? 30);

		// Initialize tags
		if (Array.isArray(listing.tags)) {
			setSelectedTagIds(
				listing.tags.map((t: any) =>
					typeof t === "object" && t !== null ? String(t.id) : String(t),
				),
			);
		}

		// Normalize images from depth=2 response
		const imgs: ImageItem[] = (listing.images ?? [])
			.map((entry: any) => {
				const media = entry.image ?? entry;
				const rawUrl = media?.url ?? entry?.url ?? "";
				return {
					id: media?.id ?? entry?.id ?? "",
					uri: resolveListingImageUrl({ url: rawUrl }) ?? rawUrl,
				};
			})
			.filter((img: ImageItem) => img.id);
		setImages(imgs);
	}, [listing?.id, listing]);

	// A product-backed listing is derived from its shop product; this generic
	// form would silently ignore any change made here. Send the seller to the
	// product editor instead — the same target the listing detail's "Edit"
	// button uses for a shop product.
	useEffect(() => {
		const productRef = listing?.product;
		if (!productRef) return;
		const productId =
			typeof productRef === "object" ? productRef.id : productRef;
		if (!productId) return;
		router.replace(`/seller/product/${productId}` as never);
	}, [listing?.product]);

	// Only the tags this category gets are offered; one the listing still
	// carries from before tags were scoped is dropped on save.
	const { tags: availableTags, applicableIds: applicableTagIds } =
		useCategoryTags(categoryId);
	useEffect(() => {
		if (!applicableTagIds) return;
		setSelectedTagIds((ids) => pruneTagIds(ids, applicableTagIds));
		setHydration((n) => n + 1);
	}, [applicableTagIds]);

	const categoryAttributes = useMemo(
		() => getCategoryAttributes(category),
		[category],
	);
	const attributeSections = useMemo(
		() => groupListingAttributes(categoryAttributes),
		[categoryAttributes],
	);

	// The same rules the API applies to this PATCH; the category is not edited
	// here, so a bare id stands in for it when only the id is known.
	const draft = {
		title,
		description,
		price: showsPrice ? price : "",
		location,
		category: category ?? (categoryId ? { id: categoryId } : null),
		attributes,
		images,
		tags: selectedTagIds,
	};
	const draftIssues = listingDraftIssues(draft, categoryAttributes, {
		previousImageCount: Array.isArray(listing?.images)
			? listing.images.length
			: 0,
		applicableTags: applicableTagIds,
		photoLimit: photosIncluded,
	});
	const draftKey = JSON.stringify(draft);
	// Everything the save sends, for the leave guard.
	const formKey = JSON.stringify([
		draftKey,
		duration,
		priceUnit,
		nextStatus,
		inShop,
		coordinates,
	]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot is taken once per hydration, never on a keystroke
	useEffect(() => {
		if (hydration > 0) setBaseline(formKey);
	}, [hydration]);
	const [attempted, setAttempted] = useState(false);
	const [refused, setRefused] = useState<{
		key: string;
		issues: FieldIssue[];
	} | null>(null);
	const serverIssues = refused?.key === draftKey ? refused.issues : [];
	const visibleIssues = [
		...serverIssues,
		...(attempted
			? draftIssues.filter(
					(issue) => !serverIssues.some((known) => known.path === issue.path),
				)
			: []),
	];

	// The inputs edit strings; the stored JSON holds real numbers and booleans.
	// Hydration is keyed so it runs once per listing *and* once more if the
	// attribute list only arrives with the separately fetched category — never on
	// every refetch, which would throw away what the user is typing.
	const attributesKey = `${listing?.id ?? ""}:${categoryAttributes.length}`;
	const hydratedAttributesRef = useRef<string | null>(null);
	useEffect(() => {
		if (!listing) return;
		if (hydratedAttributesRef.current === attributesKey) return;
		hydratedAttributesRef.current = attributesKey;
		setHydration((n) => n + 1);
		setAttributes(
			deserializeAttributeValues(categoryAttributes, listing.attributes),
		);
	}, [listing, attributesKey, categoryAttributes]);

	// ── Photos ─────────────────────────────────────────────────────
	// The same pipeline as the create form: several at once, each uploading
	// in the background with its own progress, failure and retry. A photo
	// joins `images` only once the API has given it a media id, so what the
	// PATCH sends is unchanged: the ids of the uploaded photos, in order.
	const uploads = usePhotoUploads({
		alt: title,
		onUploaded: (photo) => setImages((prev) => [...prev, photo]),
	});
	const photosTaken = images.length + uploads.pending.length;
	const photosFull = !canAddPhoto(photosTaken, photosIncluded);
	const photosRemaining = Math.max(0, photosIncluded - photosTaken);
	const pickImage = (fromCamera: boolean) =>
		void uploads.pick(fromCamera, photosRemaining);

	const showImagePicker = () => {
		if (photosFull) {
			showWarning(t("edit.limitReached"), t("photoLimit.moreSoon"));
			return;
		}
		showAlert(t("edit.addPhotoTitle"), t("edit.addPhotoSource"), [
			{ text: t("edit.camera"), onPress: () => pickImage(true) },
			{ text: t("edit.gallery"), onPress: () => pickImage(false) },
			{ text: t("common.cancel"), style: "cancel" },
		]);
	};

	// ── Save mutation ──────────────────────────────────────────────
	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/listings/${id}`, {
				title,
				description,
				location,
				...(coordinates ? { coordinates } : {}),
				duration,
				images: images.map((img) => ({ image: img.id })),
				...(showsPrice && price
					? {
							price: Number(price),
							priceUnit:
								priceUnitToSend(categoryPreset.categoryType, priceUnit) ?? null,
						}
					: {}),
				// Typed per the category definition: the API rejects a number
				// attribute sent as a string and a boolean sent as "true". Omitted
				// entirely when the category is unknown, so a failed category lookup
				// can never blank the attributes already stored.
				...(categoryAttributes.length > 0
					? {
							attributes: serializeAttributeValues(
								categoryAttributes,
								attributes,
							),
						}
					: {}),
				status: nextStatus,
				...(selectedTagIds.length > 0
					? { tags: selectedTagIds }
					: { tags: [] }),
				...(activeShop && !shopMismatch
					? { shop: inShop ? activeShop.id : null }
					: {}),
			}),
		onSuccess: () => {
			savedRef.current = true;
			queryClient.invalidateQueries({ queryKey: ["listing", id] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
			showSuccess(t("edit.saveSuccess"), t("edit.saveSuccessMsg"));
			router.back();
		},
		onError: (err: any) => {
			const issues = serverFieldIssues(err);
			if (issues.length > 0) {
				setRefused({ key: draftKey, issues });
				showError(t("edit.errorTitle"), t("formIssues.serverRefused"));
				return;
			}
			showError(t("edit.errorTitle"), resolveErrorMessage(err, t));
		},
	});

	const updateAttr = (slug: string, value: any) =>
		setAttributes((prev) => ({ ...prev, [slug]: value }));

	// Back, or the Android back gesture, used to throw every edit away without
	// a word. Leaving with changes now asks first, as the product editor does.
	const navigation = useNavigation();
	const savedRef = useRef(false);
	const dirty =
		baseline !== null && (formKey !== baseline || uploads.pending.length > 0);
	useEffect(() => {
		if (!dirty) return;
		return navigation.addListener("beforeRemove", (event) => {
			if (savedRef.current) return;
			event.preventDefault();
			showAlert(t("create.discardTitle"), t("create.discardMsg"), [
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("create.discardConfirm"),
					style: "destructive",
					onPress: () => navigation.dispatch(event.data.action),
				},
			]);
		});
	}, [dirty, navigation, showAlert, t]);

	const scrollRef = useRef<any>(null);
	const { requirePhone } = usePhoneGate();
	const handleSavePress = () => {
		// Sending the ad (back) to review needs a verified phone.
		if (
			nextStatus === "pending" &&
			listing?.status !== "pending" &&
			!requirePhone("publishListing")
		)
			return;
		// A photo still on its way has no media id yet: saving now would drop it
		// without a word.
		if (uploads.uploading) {
			showWarning(t("create.photosStillUploading"));
			return;
		}
		// A photo that failed has no media id either: the seller retries or
		// removes it, rather than losing it to a save that says nothing.
		if (uploads.pending.some((photo) => photo.status === "failed")) {
			showWarning(t("edit.photosFailedOnSave"));
			return;
		}
		// Only a field the preset actually shows may block the save: a hidden
		// price is never "required", which `listingDraftIssues` already knows.
		if (draftIssues.length > 0) {
			setAttempted(true);
			// The list of what to fix sits at the top of the form.
			scrollRef.current?.scrollTo?.({ y: 0, animated: true });
			showError(t("edit.errorTitle"), t("formIssues.fixStep"));
			return;
		}
		// A live ad goes back to review and leaves the feed until it is
		// approved: said before the save, not in the last card of the form.
		if (listing?.status === "published" && nextStatus === "pending") {
			showAlert(
				t("edit.resubmitTitle", {
					defaultValue: "Renvoyer l’annonce en vérification ?",
				}),
				t("edit.resubmitMsg", {
					defaultValue:
						"Vos modifications seront vérifiées (moins de 24 h). L’annonce restera hors ligne pendant ce temps.",
				}),
				[
					{ text: t("common.cancel"), style: "cancel" },
					{
						text: t("edit.resubmitConfirm", {
							defaultValue: "Enregistrer et soumettre",
						}),
						onPress: () => save(),
					},
				],
			);
			return;
		}
		save();
	};

	// The form's own frame while the ad loads: header, then cards in the shape
	// of the photo strip and the fields, instead of a lone spinner.
	if (isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={[styles.header, { borderBottomColor: borderColor }]}>
					<HeaderBackButton
						color={textColor}
						fallback="/(tabs)/account"
						style={styles.backBtn}
					/>
					<Text
						style={[styles.headerTitle, { color: textColor }]}
						accessibilityRole="header"
					>
						{t("edit.title")}
					</Text>
					<View style={styles.backBtn} />
				</View>
				<View
					style={[styles.scroll, centeredContent]}
					accessible
					accessibilityRole="progressbar"
					accessibilityLabel={t("common.loading")}
				>
					<SkeletonBox width="100%" height={150} radius={16} />
					<SkeletonBox width="100%" height={230} radius={16} />
					<SkeletonBox width="100%" height={180} radius={16} />
				</View>
			</SafeAreaView>
		);
	}

	// Offline or gone: say so, rather than an empty form the seller might
	// start retyping the ad into.
	if (!listing) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={[styles.header, { borderBottomColor: borderColor }]}>
					<HeaderBackButton
						color={textColor}
						fallback="/(tabs)/account"
						style={styles.backBtn}
					/>
					<Text
						style={[styles.headerTitle, { color: textColor }]}
						accessibilityRole="header"
					>
						{t("edit.title")}
					</Text>
					<View style={styles.backBtn} />
				</View>
				<EmptyState
					illustration="notFound"
					title={t("edit.loadError", {
						defaultValue: "Impossible de charger l’annonce",
					})}
					subtitle={
						isError
							? resolveErrorMessage(error, t, t("create.publishErrorMsg"))
							: undefined
					}
					ctaLabel={isRefetching ? undefined : t("common.retry")}
					onCta={() => void refetch()}
				/>
			</SafeAreaView>
		);
	}

	const status: string = listing.status ?? "";

	const sharedSection = {
		cardBg,
		borderColor,
		textColor,
		mutedColor,
		primaryColor,
		isDark,
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<HeaderBackButton
					color={textColor}
					fallback="/(tabs)/account"
					style={styles.backBtn}
				/>
				<Text
					style={[styles.headerTitle, { color: textColor }]}
					accessibilityRole="header"
				>
					{t("edit.title")}
				</Text>
				<Pressable
					onPress={handleSavePress}
					disabled={isPending}
					hitSlop={6}
					accessibilityRole="button"
					accessibilityLabel={t("edit.save")}
					accessibilityState={{ busy: isPending, disabled: isPending }}
					style={({ pressed }) => [
						styles.saveBtn,
						{
							backgroundColor: fill,
							opacity: isPending ? 0.7 : pressed ? 0.85 : 1,
						},
					]}
				>
					{isPending ? (
						<ActivityIndicator size="small" color="#ffffff" />
					) : (
						<Text style={styles.saveBtnText}>{t("edit.save")}</Text>
					)}
				</Pressable>
			</View>

			<KeyboardAwareScrollView
				ref={scrollRef}
				style={{ flex: 1 }}
				contentContainerStyle={[
					styles.scroll,
					{ backgroundColor: bg },
					centeredContent,
				]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
				showsVerticalScrollIndicator={false}
			>
				{/* What the seller came to fix comes first: a rejected ad's reason
				    used to sit in the last card, after every field. */}
				{status === "rejected" ? (
					<View
						style={[styles.notice, { backgroundColor: C.dangerTint }]}
						accessibilityRole="alert"
					>
						<Ionicons
							name="alert-circle-outline"
							size={18}
							color={C.dangerText}
							importantForAccessibility="no"
						/>
						<View style={styles.noticeBody}>
							<Text style={[styles.noticeTitle, { color: C.dangerText }]}>
								{t("edit.statusRejectedNotice")}
							</Text>
							{rejection ? (
								<Text style={[styles.noticeText, { color: C.dangerText }]}>
									{t("edit.statusRejectionReason", { reason: rejection })}
								</Text>
							) : null}
						</View>
					</View>
				) : null}
				{status === "published" && nextStatus === "pending" ? (
					<View style={[styles.notice, { backgroundColor: C.warningTint }]}>
						<Ionicons
							name="warning-outline"
							size={18}
							color={C.warningText}
							importantForAccessibility="no"
						/>
						<Text style={[styles.noticeText, { color: C.warningText }]}>
							{t("edit.statusPublishedNotice")}
						</Text>
					</View>
				) : null}
				<FieldIssueList
					issues={visibleIssues}
					attributes={categoryAttributes}
				/>
				{activeShop && !shopMismatch ? (
					<PublishInShopToggle
						shopName={activeShop.name}
						value={inShop}
						onChange={setInShop}
						hint={
							wasInShop && !inShop
								? t("shop.publishInDetachWarning")
								: undefined
						}
					/>
				) : null}

				{/* ── Photos ── */}
				<SectionCard
					icon="images-outline"
					title={t("edit.photos")}
					{...sharedSection}
				>
					<Text style={[styles.hint, { color: mutedColor }]}>
						{t("edit.photosHint", { count: photosIncluded })}
					</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.imageList}
					>
						{images.map((img, index) => (
							<View
								key={img.id}
								style={[
									styles.imageWrap,
									{ backgroundColor: C.well, borderColor },
								]}
							>
								<Image
									source={{ uri: img.uri }}
									style={StyleSheet.absoluteFill}
									contentFit="cover"
									accessibilityIgnoresInvertColors
								/>
								{index === 0 ? (
									<View style={[styles.mainBadge, { backgroundColor: fill }]}>
										<Text style={styles.mainBadgeText}>
											{t("edit.mainPhoto")}
										</Text>
									</View>
								) : (
									// The first photo is the one on every card: any other can
									// take its place, as on the create form.
									<Pressable
										onPress={() => setImages((prev) => makeMain(prev, index))}
										hitSlop={8}
										accessibilityRole="button"
										accessibilityLabel={t("create.makeMain")}
										style={styles.makeMainBtn}
									>
										<Ionicons name="star-outline" size={16} color="#ffffff" />
									</Pressable>
								)}
								<Pressable
									onPress={() =>
										setImages((prev) => prev.filter((_, i) => i !== index))
									}
									hitSlop={10}
									accessibilityRole="button"
									accessibilityLabel={t("create.removePhoto")}
									style={styles.removeImageBtn}
								>
									<Ionicons name="close" size={16} color="#ffffff" />
								</Pressable>
							</View>
						))}
						{uploads.pending.map((photo) => (
							<PendingPhotoTile
								key={photo.key}
								photo={photo}
								onRetry={() => uploads.retry(photo.key)}
								onRemove={() => uploads.remove(photo.key)}
								style={[
									styles.imageWrap,
									{ backgroundColor: C.well, borderColor },
								]}
							/>
						))}
						<Pressable
							onPress={showImagePicker}
							disabled={photosFull}
							accessibilityRole="button"
							accessibilityLabel={t("edit.addPhoto")}
							accessibilityState={{ disabled: photosFull }}
							style={({ pressed }) => [
								styles.addImageBtn,
								{
									backgroundColor: pressed ? C.primaryTint : cardBg,
									borderColor: primaryColor,
								},
								photosFull && { opacity: 0.4 },
							]}
						>
							<View
								style={[
									styles.addIconCircle,
									{ backgroundColor: C.primaryTint },
								]}
							>
								<Ionicons
									name="camera-outline"
									size={20}
									color={primaryColor}
								/>
							</View>
							<Text
								style={[styles.addImageText, { color: primaryColor }]}
								numberOfLines={2}
							>
								{t("edit.addPhoto")}
							</Text>
						</Pressable>
					</ScrollView>
					<PhotoLimitNote
						count={photosTaken}
						limit={photosIncluded}
						color={mutedColor}
					/>
					<PendingPhotoErrors photos={uploads.pending} />
					<FieldIssueText issue={issueAt(visibleIssues, "images")} />
					{uploads.uploading && (
						<Text
							style={[styles.hint, styles.uploadingNote, { color: mutedColor }]}
							accessibilityLiveRegion="polite"
						>
							{t("create.photosStillUploading")}
						</Text>
					)}
				</SectionCard>

				{/* ── Détails ── */}
				<SectionCard
					icon="create-outline"
					title={t("edit.details")}
					{...sharedSection}
				>
					{/* Title */}
					<View style={styles.fieldGroup}>
						<FieldLabel
							label={t("edit.titleLabel")}
							required
							mutedColor={mutedColor}
						/>
						<TextInput
							value={title}
							onChangeText={setTitle}
							placeholder={
								isProductCategory
									? t("edit.titlePlaceholder")
									: t("create.titlePlaceholderGeneric")
							}
							placeholderTextColor={mutedColor}
							style={[
								styles.input,
								{
									backgroundColor: inputBg,
									borderColor: issueAt(visibleIssues, "title")
										? C.destructive
										: borderColor,
									color: textColor,
								},
							]}
							maxLength={100}
							accessibilityLabel={`${t("edit.titleLabel")}, ${t("common.required")}`}
						/>
						<FieldIssueText issue={issueAt(visibleIssues, "title")} />
						<Text
							style={[styles.charCount, { color: mutedColor }]}
							importantForAccessibility="no"
						>
							{title.length}/100
						</Text>
					</View>

					{/* Description */}
					<View style={styles.fieldGroup}>
						<FieldLabel
							label={t("edit.descriptionLabel")}
							required
							mutedColor={mutedColor}
						/>
						<TextInput
							value={description}
							onChangeText={setDescription}
							placeholder={
								isProductCategory
									? t("edit.descriptionPlaceholder")
									: t("edit.descriptionPlaceholderGeneric")
							}
							placeholderTextColor={mutedColor}
							style={[
								styles.input,
								styles.multiline,
								{
									backgroundColor: inputBg,
									borderColor: issueAt(visibleIssues, "description")
										? C.destructive
										: borderColor,
									color: textColor,
								},
							]}
							multiline
							numberOfLines={5}
							accessibilityLabel={`${t("edit.descriptionLabel")}, ${t("common.required")}`}
						/>
						<FieldIssueText issue={issueAt(visibleIssues, "description")} />
					</View>

					{/* The category is fixed once the ad exists; saying so spares a
					    seller the search for a field that is not there. */}
					{category?.name ? (
						<View style={styles.fieldGroup}>
							<FieldLabel
								label={t("create.categoryFieldLabel")}
								mutedColor={mutedColor}
							/>
							<Text style={[styles.categoryValue, { color: textColor }]}>
								{category.name}
							</Text>
							<Text style={[styles.hint, { color: mutedColor }]}>
								{t("edit.categoryLocked", {
									defaultValue:
										"Pour changer de catégorie, créez une nouvelle annonce.",
								})}
							</Text>
						</View>
					) : null}
				</SectionCard>

				{/* ── Attributs dynamiques ── */}
				{categoryAttributes.length > 0 && (
					<SectionCard
						icon="pricetag-outline"
						title={`${t("edit.characteristics")} — ${category?.name ?? ""}`}
						{...sharedSection}
					>
						{attributeSections.map((section) => (
							<View key={section.key} style={styles.attrSection}>
								{section.title ? (
									<Text
										style={[styles.groupHeading, { color: textColor }]}
										accessibilityRole="header"
									>
										{section.title}
									</Text>
								) : null}
								{section.attributes.map((attr) => (
									<EditAttributeField
										key={attr.slug}
										attribute={attr}
										value={attributes[attr.slug] ?? ""}
										onChange={(v: string) => updateAttr(attr.slug, v)}
										textColor={textColor}
										mutedColor={mutedColor}
										// Behind the selected pill's white label.
										primaryColor={fill}
										borderColor={borderColor}
										inputBg={inputBg}
									/>
								))}
							</View>
						))}
					</SectionCard>
				)}

				{/* ── Vente ── */}
				<SectionCard
					icon="pricetag-outline"
					title={t("edit.saleSection")}
					{...sharedSection}
				>
					{showsPrice && (
						<View style={styles.fieldGroup}>
							<FieldLabel
								label={priceLabel}
								required={requiresPrice}
								mutedColor={mutedColor}
							/>
							<View
								style={[
									styles.inputRow,
									{
										backgroundColor: inputBg,
										borderColor: issueAt(visibleIssues, "price")
											? C.destructive
											: borderColor,
									},
								]}
							>
								<TextInput
									// Grouped ("1 500 000") as on the create form, so a zero
									// too many is seen; stored as digits.
									value={groupPriceDigits(price)}
									// Whole XAF amounts only: a separator typed on the numeric
									// keypad reached the API as NaN.
									onChangeText={(v) => setPrice(sanitizePriceInput(v))}
									placeholder={t("create.pricePlaceholder")}
									placeholderTextColor={mutedColor}
									style={[styles.priceInput, { color: textColor }]}
									keyboardType="number-pad"
									accessibilityLabel={priceLabel}
								/>
								{/* The currency on the yellow tag every price wears. */}
								<View
									style={[styles.currencyTag, { backgroundColor: C.sun }]}
									importantForAccessibility="no-hide-descendants"
								>
									<Text style={[styles.currency, { color: C.sunForeground }]}>
										{t("common.currency", { defaultValue: "XAF" })}
									</Text>
								</View>
							</View>
							<FieldIssueText issue={issueAt(visibleIssues, "price")} />
							<PriceUnitChips
								kind={categoryPreset.categoryType}
								value={priceUnit}
								onChange={setPriceUnit}
								colors={{
									textColor,
									mutedColor,
									primary: primaryColor,
									border: borderColor,
								}}
							/>
						</View>
					)}

					{/* Tags */}
					{availableTags.length > 0 && (
						<View style={styles.fieldGroup}>
							<FieldLabel
								label={t("create.tagsFieldLabel", { defaultValue: "Tags" })}
								mutedColor={mutedColor}
							/>
							<TagPicker
								selectedIds={selectedTagIds}
								onChangeIds={setSelectedTagIds}
								availableTags={availableTags}
								inputBg={inputBg}
								borderColor={borderColor}
								textColor={textColor}
								mutedColor={mutedColor}
								primaryColor={primaryColor}
							/>
						</View>
					)}

					{/* Location */}
					<View style={styles.fieldGroup}>
						<FieldLabel
							label={t("edit.locationLabel")}
							required
							mutedColor={mutedColor}
						/>
						<CityPicker
							value={location}
							onSelect={(place: Place) => {
								setLocation(place.name);
								setCoordinates(
									place.lat != null && place.lng != null
										? { lat: place.lat, lng: place.lng }
										: null,
								);
							}}
							onClear={() => {
								setLocation("");
								setCoordinates(null);
							}}
							inputBg={inputBg}
							borderColor={
								issueAt(visibleIssues, "location") ? C.destructive : borderColor
							}
							textColor={textColor}
							mutedColor={mutedColor}
						/>
						<FieldIssueText issue={issueAt(visibleIssues, "location")} />
					</View>

					{/* Duration */}
					<View style={styles.fieldGroup}>
						<FieldLabel
							label={t("edit.durationLabel")}
							mutedColor={mutedColor}
						/>
						<View style={styles.pillRow} accessibilityRole="radiogroup">
							{DURATIONS.map((d) => {
								const active = duration === d;
								return (
									<Pressable
										key={d}
										onPress={() => setDuration(d)}
										accessibilityRole="radio"
										accessibilityState={{ checked: active }}
										accessibilityLabel={`${d} ${t("edit.days")}`}
										style={[
											styles.durationPill,
											{
												backgroundColor: active ? fill : inputBg,
												borderColor: active ? fill : borderColor,
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
											{t("edit.days")}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				</SectionCard>

				{/* \u2500\u2500 Publication \u2500\u2500 */}
				<SectionCard
					icon="paper-plane-outline"
					title={t("edit.statusSection")}
					{...sharedSection}
				>
					{/* Current status badge */}
					{listing?.status &&
						(() => {
							const s = listing.status as string;
							// Sniffing the French translation to pick a language was both a
							// t() bypass and wrong for every other status, which stayed
							// French in English.
							const statusLabel: Record<string, string> = {
								draft: t("listings.statusDraft", {
									defaultValue: "Brouillon",
								}),
								pending: t("listings.statusPending"),
								published: t("listings.statusPublished"),
								rejected: t("listings.statusRejected"),
								// A flat is let and a job filled, not sold.
								sold: t(
									`listingKind.closedAs.${listingKindRules(listing?.kind).closedAs}`,
								),
								expired: t("listings.statusExpired"),
							};
							return (
								<View style={styles.statusBlock}>
									<View style={styles.statusRow}>
										<Text style={[styles.fieldLabel, { color: mutedColor }]}>
											{t("edit.statusCurrentLabel")}
										</Text>
										<StatusTag
											label={statusLabel[s] ?? s}
											tone={STATUS_TONE[s] ?? "neutral"}
										/>
									</View>
								</View>
							);
						})()}

					{/* Status options */}
					<View style={styles.statusOptions} accessibilityRole="radiogroup">
						{(
							[
								{
									value: "draft" as const,
									label: t("edit.statusDraft"),
									desc: t("edit.statusDraftDesc"),
									icon: "document-outline" as const,
								},
								{
									value: "pending" as const,
									label: t("edit.statusPending"),
									desc: t("edit.statusPendingDesc"),
									icon: "send-outline" as const,
								},
							] satisfies Array<{
								value: "draft" | "pending";
								label: string;
								desc: string;
								icon: "document-outline" | "send-outline";
							}>
						).map((opt) => {
							const active = nextStatus === opt.value;
							return (
								<Pressable
									key={opt.value}
									onPress={() => setNextStatus(opt.value)}
									accessibilityRole="radio"
									accessibilityState={{ checked: active }}
									accessibilityLabel={`${opt.label}. ${opt.desc}`}
									style={[
										styles.statusOption,
										{
											borderColor: active ? primaryColor : borderColor,
											backgroundColor: active ? C.primaryTint : cardBg,
										},
									]}
								>
									<View
										style={[
											styles.radio,
											{ borderColor: active ? primaryColor : mutedColor },
										]}
									>
										{active && (
											<View
												style={[
													styles.radioDot,
													{ backgroundColor: primaryColor },
												]}
											/>
										)}
									</View>
									<View style={styles.statusOptionText}>
										<Text
											style={[styles.statusOptionLabel, { color: textColor }]}
										>
											{opt.label}
										</Text>
										<Text
											style={[styles.statusOptionDesc, { color: mutedColor }]}
										>
											{opt.desc}
										</Text>
									</View>
									<Ionicons
										name={opt.icon}
										size={18}
										color={active ? primaryColor : mutedColor}
										importantForAccessibility="no"
									/>
								</Pressable>
							);
						})}
					</View>
				</SectionCard>

				{/* Submit */}
				<AnimatedPressable
					// Goes through the same guard as the header button — this one used
					// to save straight past the validation.
					onPress={handleSavePress}
					disabled={isPending}
					scaleTo={0.97}
					accessibilityRole="button"
					accessibilityLabel={t("edit.save")}
					accessibilityState={{ busy: isPending, disabled: isPending }}
					style={[
						styles.submitBtn,
						{ backgroundColor: fill, opacity: isPending ? 0.7 : 1 },
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<>
							<Ionicons
								name="checkmark-circle-outline"
								size={20}
								color="#ffffff"
							/>
							<Text style={styles.submitText}>{t("edit.save")}</Text>
						</>
					)}
				</AnimatedPressable>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	backBtn: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	saveBtn: {
		minHeight: 38,
		minWidth: 44,
		borderRadius: 10,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	saveBtnText: {
		color: "#ffffff",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},

	scroll: { padding: 16, gap: 12, paddingBottom: 48 },

	/* Section card */
	sectionCard: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 10,
	},
	sectionIconBox: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: {
		...TextStyles.h3,
		flexShrink: 1,
	},
	sectionBody: {
		paddingHorizontal: 16,
		paddingBottom: 16,
		gap: 14,
	},

	/* Fields */
	fieldGroup: { gap: 6 },
	categoryValue: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	attrSection: { gap: 14 },
	groupHeading: {
		...TextStyles.h4,
	},
	attrUnit: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		marginLeft: 8,
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
	fieldLabel: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	hint: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 19,
	},
	input: {
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
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
		alignSelf: "flex-end",
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 6,
	},
	rowInput: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.body,
		paddingVertical: 6,
	},
	currencyTag: {
		borderRadius: 7,
		paddingHorizontal: 8,
		paddingVertical: 3,
		marginLeft: 8,
	},
	currency: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
	},
	priceInput: {
		flex: 1,
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
		fontVariant: ["tabular-nums"],
		paddingVertical: 6,
	},

	/* Status */
	statusBlock: { gap: 10 },
	statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		padding: 12,
	},
	noticeBody: { flex: 1, gap: 4 },
	noticeTitle: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	noticeText: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	statusOptions: { gap: 10 },
	statusOption: {
		minHeight: 64,
		borderRadius: 12,
		borderWidth: 1.5,
		padding: 14,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	radio: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	radioDot: { width: 10, height: 10, borderRadius: 5 },
	statusOptionText: { flex: 1, gap: 2 },
	statusOptionLabel: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	statusOptionDesc: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },

	/* Pills */
	pillRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44,
		borderRadius: 22,
		borderWidth: 1,
		paddingHorizontal: 16,
	},
	pillText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},

	/* Duration */
	durationPill: {
		flex: 1,
		minHeight: 56,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
		borderWidth: 1,
		paddingVertical: 8,
	},
	durationNum: {
		fontSize: 20,
		fontFamily: Fonts.displayBold,
		lineHeight: 24,
		fontVariant: ["tabular-nums"],
	},
	durationUnit: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyMedium,
	},

	/* Images: the create form's tile, laid out as a strip. */
	imageList: {
		gap: 10,
		paddingVertical: 4,
	},
	imageWrap: {
		width: 100,
		height: 100,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	mainBadge: {
		position: "absolute",
		bottom: 6,
		left: 6,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	mainBadgeText: {
		color: "#ffffff",
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyBold,
	},
	makeMainBtn: {
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
	// The same ink disc as on the create form and an uploading photo.
	removeImageBtn: {
		position: "absolute",
		top: 6,
		right: 6,
		backgroundColor: "rgba(18, 22, 58, 0.7)",
		borderRadius: 14,
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	addImageBtn: {
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
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	addImageText: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	uploadingNote: { marginTop: 4 },

	/* Submit */
	submitBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		paddingVertical: 14,
		marginTop: 4,
	},
	submitText: {
		color: "#ffffff",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
});
