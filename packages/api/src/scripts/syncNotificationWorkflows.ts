import type * as components from "@novu/api/models/components";
import {
	LISTING_REJECTION_LABELS,
	LISTING_REJECTION_REASONS,
} from "../contracts/listingRejection";
import {
	localized,
	localizedField,
	NOTIFICATION_LOCALES,
	type NotificationLocale,
} from "../contracts/notificationLocale";
import { NOVU_CLOUD_API_URL, novuApiUrl } from "../contracts/novuEndpoints";
import { fingerprintOf } from "../lib/deployTasks";
import {
	getNotificationProvider,
	isNotificationProviderConfigured,
} from "../services/notificationProvider";

type ManagedWorkflowStep = Exclude<components.Steps, { type: "throttle" }>;

type ChannelConfig = {
	email?: boolean;
	inApp?: boolean;
	push?: boolean;
};

type WorkflowSpec = {
	channels: ChannelConfig;
	definition: Omit<components.CreateWorkflowDto, "steps"> & {
		steps: ManagedWorkflowStep[];
	};
};

type JsonSchema = {
	[k: string]: unknown;
};

function bool(value: boolean): components.ChannelPreferenceDto {
	return { enabled: value };
}

function preferences(
	channels: ChannelConfig,
): components.PreferencesRequestDto {
	return {
		user: {
			all: { enabled: true, readOnly: false },
			channels: {
				email: bool(Boolean(channels.email)),
				in_app: bool(Boolean(channels.inApp)),
				push: bool(Boolean(channels.push)),
				sms: bool(false),
				chat: bool(false),
			},
		},
		workflow: {
			all: { enabled: true, readOnly: false },
			channels: {
				email: bool(Boolean(channels.email)),
				in_app: bool(Boolean(channels.inApp)),
				push: bool(Boolean(channels.push)),
				sms: bool(false),
				chat: bool(false),
			},
		},
	};
}

/**
 * Every workflow also takes `locale`, which the API adds to each event from
 * the recipient's account: the templates pick their wording from it.
 */
function objectSchema(
	properties: Record<string, JsonSchema>,
	required: string[],
): JsonSchema {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			...properties,
			locale: {
				type: "string",
				enum: [...NOTIFICATION_LOCALES],
				description: "The recipient's language",
			},
		},
		required,
	};
}

function stringProperty(description?: string): JsonSchema {
	return description ? { type: "string", description } : { type: "string" };
}

function numberProperty(description?: string): JsonSchema {
	return description ? { type: "number", description } : { type: "number" };
}

function booleanProperty(description: string): JsonSchema {
	return { type: "boolean", description };
}

function nullableStringProperty(description: string): JsonSchema {
	return { type: ["string", "null"], description };
}

const paymentProperties = {
	orderId: stringProperty("Order identifier"),
	orderNumber: stringProperty("Order number"),
	amount: numberProperty("Amount charged, integer in the currency"),
	currency: stringProperty("ISO currency code"),
};
const PAYMENT_REQUIRED = ["orderId", "orderNumber", "amount", "currency"];

const payoutAccountProperties = {
	shopId: stringProperty("Shop identifier"),
	accountId: stringProperty("Payout account identifier"),
	method: stringProperty('"mtn_momo", "orange_money" or "bank"'),
	accountNumberMasked: stringProperty("Masked account number"),
};
const PAYOUT_ACCOUNT_REQUIRED = [
	"shopId",
	"accountId",
	"method",
	"accountNumberMasked",
];

/** The hold pair carries the reason category, never the hold's reason. */
const holdProperties = {
	shopId: stringProperty("Shop identifier"),
	shopName: stringProperty("Shop display name"),
	holdId: nullableStringProperty("Hold identifier"),
	scope: stringProperty('"shop" or "order"'),
	orderId: nullableStringProperty("Held order, for an order-scope hold"),
	reasonCategory: stringProperty('"security", "review" or "operations"'),
};
const HOLD_REQUIRED = [
	"shopId",
	"shopName",
	"holdId",
	"scope",
	"orderId",
	"reasonCategory",
];

const payoutProperties = {
	shopId: stringProperty("Shop identifier"),
	payoutId: stringProperty("Payout identifier"),
	amount: numberProperty("Payout amount"),
	currency: stringProperty("ISO currency code"),
};
const PAYOUT_REQUIRED = ["shopId", "payoutId", "amount", "currency"];

const refundProperties = {
	refundId: stringProperty("Refund identifier"),
	orderId: stringProperty("Order identifier"),
	orderNumber: stringProperty("Order number"),
	amount: numberProperty("Refund amount"),
	currency: stringProperty("ISO currency code"),
	reason: stringProperty("Refund reason"),
};
const REFUND_REQUIRED = [
	"refundId",
	"orderId",
	"orderNumber",
	"amount",
	"currency",
	"reason",
];

function redirect(url: string): components.RedirectDto {
	return { url };
}

function action(label: string, url: string): components.ActionDto {
	return {
		label,
		redirect: redirect(url),
	};
}

function inAppStep(
	name: string,
	stepId: string,
	controlValues: components.InAppControlDto,
): components.InAppStepUpsertDto {
	return {
		name,
		stepId,
		type: "in_app",
		controlValues,
	};
}

function pushStep(
	name: string,
	stepId: string,
	controlValues: Record<string, unknown>,
): components.PushStepUpsertDto {
	return {
		name,
		stepId,
		type: "push",
		controlValues,
	};
}

function emailStep(
	name: string,
	stepId: string,
	controlValues: components.EmailControlDto,
): components.EmailStepUpsertDto {
	return {
		name,
		stepId,
		type: "email",
		controlValues,
	};
}

/** The reason code, worded in `locale` (`{% case %}` over every code). */
function rejectionReasonText(locale: NotificationLocale): string {
	const branches = LISTING_REJECTION_REASONS.map(
		(code) => `{% when '${code}' %}${LISTING_REJECTION_LABELS[code][locale]}`,
	).join("");
	return `{% case payload.reasonCode %}${branches}{% else %}{{payload.reasonCode}}{% endcase %}`;
}

/** The moderator's words, when there are any, after the reason. */
const REJECTION_MESSAGE =
	"{% if payload.message != '' %} — {{payload.message}}{% endif %}";

const LISTING_REJECTED_BODY = localized({
	fr: `Votre annonce « {{payload.listingTitle}} » a été refusée. Motif : ${rejectionReasonText("fr")}${REJECTION_MESSAGE}.`,
	en: `Your listing "{{payload.listingTitle}}" was rejected. Reason: ${rejectionReasonText("en")}${REJECTION_MESSAGE}.`,
});

const workflowSpecs: WorkflowSpec[] = [
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Listing Approved",
			description: "Notifies sellers when a listing becomes published.",
			workflowId: "listing-approved",
			tags: ["approved", "published"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					listingId: stringProperty("Listing identifier"),
					listingTitle: stringProperty("Listing title"),
				},
				["listingId", "listingTitle"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Annonce publiée",
						en: "Listing published",
					}),
					body: localized({
						fr: "Votre annonce « {{payload.listingTitle}} » est maintenant en ligne.",
						en: 'Your listing "{{payload.listingTitle}}" is now live.',
					}),
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action(
						localized({ fr: "Voir l'annonce", en: "View listing" }),
						"/listing/{{payload.listingId}}",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Annonce publiée",
						en: "Listing published",
					}),
					body: localized({
						fr: "Votre annonce « {{payload.listingTitle}} » est maintenant en ligne.",
						en: 'Your listing "{{payload.listingTitle}}" is now live.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Listing Rejected",
			description: "Notifies sellers when a listing is rejected by moderation.",
			workflowId: "listing-rejected",
			tags: ["rejected"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					listingId: stringProperty("Listing identifier"),
					listingTitle: stringProperty("Listing title"),
					reasonCode: stringProperty(
						"One of LISTING_REJECTION_REASONS (contracts/listingRejection.ts)",
					),
					message: stringProperty(
						"The moderator's own words, in their language; may be empty",
					),
				},
				["listingId", "listingTitle", "reasonCode", "message"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Annonce refusée", en: "Listing rejected" }),
					body: LISTING_REJECTED_BODY,
					redirect: redirect("/listing/{{payload.listingId}}/edit"),
					primaryAction: action(
						localized({ fr: "Modifier l'annonce", en: "Edit listing" }),
						"/listing/{{payload.listingId}}/edit",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Annonce refusée", en: "Listing rejected" }),
					body: LISTING_REJECTED_BODY,
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Listing Status Updated",
			description: "Notifies sellers when a listing changes to another status.",
			workflowId: "listing-status",
			tags: ["published"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					listingId: stringProperty("Listing identifier"),
					listingTitle: stringProperty("Listing title"),
					oldStatus: stringProperty("Previous listing status"),
					newStatus: stringProperty("New listing status"),
				},
				["listingId", "listingTitle", "oldStatus", "newStatus"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Mise à jour de votre annonce",
						en: "Your listing was updated",
					}),
					body: localized({
						fr: "Le statut de « {{payload.listingTitle}} » est passé à {{payload.newStatus}}.",
						en: 'The status of "{{payload.listingTitle}}" changed to {{payload.newStatus}}.',
					}),
					redirect: redirect("/listing/{{payload.listingId}}"),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Mise à jour de votre annonce",
						en: "Your listing was updated",
					}),
					body: localized({
						fr: "Le statut de « {{payload.listingTitle}} » est passé à {{payload.newStatus}}.",
						en: 'The status of "{{payload.listingTitle}}" changed to {{payload.newStatus}}.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Listing Expired",
			description: "Daily reminder when a listing expires.",
			workflowId: "listing-expired",
			tags: ["expired"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					listingId: stringProperty("Listing identifier"),
					listingTitle: stringProperty("Listing title"),
				},
				["listingId", "listingTitle"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Annonce expirée", en: "Listing expired" }),
					body: localized({
						fr: "Votre annonce « {{payload.listingTitle}} » a expiré. Republiez-la pour continuer à vendre.",
						en: 'Your listing "{{payload.listingTitle}}" has expired. Republish it to keep selling.',
					}),
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action(
						localized({ fr: "Renouveler", en: "Renew" }),
						"/listing/{{payload.listingId}}",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Annonce expirée", en: "Listing expired" }),
					body: localized({
						fr: "Votre annonce « {{payload.listingTitle}} » a expiré. Republiez-la pour continuer à vendre.",
						en: 'Your listing "{{payload.listingTitle}}" has expired. Republish it to keep selling.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Boost Expired",
			description: "Daily reminder when a boost expires.",
			workflowId: "boost-expired",
			tags: ["boost"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					listingId: stringProperty("Listing identifier"),
					listingTitle: stringProperty("Listing title"),
				},
				["listingId", "listingTitle"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Boost terminé", en: "Boost ended" }),
					body: localized({
						fr: "Le boost de « {{payload.listingTitle}} » est terminé.",
						en: 'The boost on "{{payload.listingTitle}}" has ended.',
					}),
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action(
						localized({ fr: "Voir l'annonce", en: "View listing" }),
						"/listing/{{payload.listingId}}",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Boost terminé", en: "Boost ended" }),
					body: localized({
						fr: "Le boost de « {{payload.listingTitle}} » est terminé.",
						en: 'The boost on "{{payload.listingTitle}}" has ended.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "New Message",
			description:
				"Notifies a recipient when a new conversation message arrives.",
			workflowId: "new-message",
			tags: ["message"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					senderName: stringProperty("Message sender display name"),
					messagePreview: stringProperty("Message preview"),
					conversationId: stringProperty("Conversation identifier"),
				},
				["senderName", "messagePreview", "conversationId"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Message de {{payload.senderName}}",
						en: "Message from {{payload.senderName}}",
					}),
					body: "{{payload.messagePreview}}",
					redirect: redirect("/messages/{{payload.conversationId}}"),
					primaryAction: action(
						localized({ fr: "Répondre", en: "Reply" }),
						"/messages/{{payload.conversationId}}",
					),
					data: { conversationId: "{{payload.conversationId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Message de {{payload.senderName}}",
						en: "Message from {{payload.senderName}}",
					}),
					body: "{{payload.messagePreview}}",
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "New Review",
			description: "Notifies a user when they receive a new review.",
			workflowId: "new-review",
			tags: ["review"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					reviewerName: stringProperty("Reviewer display name"),
					rating: numberProperty("Star rating"),
					comment: stringProperty("Optional review comment"),
				},
				["reviewerName", "rating"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Nouvel avis de {{payload.reviewerName}}",
						en: "New review from {{payload.reviewerName}}",
					}),
					body: localized({
						fr: "{{payload.reviewerName}} vous a laissé {{payload.rating}} étoile(s) {{payload.comment}}",
						en: "{{payload.reviewerName}} gave you {{payload.rating}} star(s) {{payload.comment}}",
					}),
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Nouvel avis de {{payload.reviewerName}}",
						en: "New review from {{payload.reviewerName}}",
					}),
					body: localized({
						fr: "{{payload.reviewerName}} vous a laissé {{payload.rating}} étoile(s) {{payload.comment}}",
						en: "{{payload.reviewerName}} gave you {{payload.rating}} star(s) {{payload.comment}}",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Search Alert",
			description: "Scheduled alert for new listings matching a saved search.",
			workflowId: "search-alert",
			tags: ["alert", "search"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					matchCount: numberProperty("Number of matching listings"),
					searchName: stringProperty("Saved search display name"),
					searchUrl: stringProperty("Internal or external search result URL"),
				},
				["matchCount", "searchName", "searchUrl"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "{{payload.matchCount}} nouvelle(s) annonce(s) pour « {{payload.searchName}} »",
						en: '{{payload.matchCount}} new listing(s) for "{{payload.searchName}}"',
					}),
					body: localized({
						fr: "De nouvelles annonces correspondent à votre alerte « {{payload.searchName}} ».",
						en: 'New listings match your alert "{{payload.searchName}}".',
					}),
					redirect: redirect("{{payload.searchUrl}}"),
					primaryAction: action(
						localized({ fr: "Voir les annonces", en: "View listings" }),
						"{{payload.searchUrl}}",
					),
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "{{payload.matchCount}} nouvelle(s) annonce(s) pour « {{payload.searchName}} »",
						en: '{{payload.matchCount}} new listing(s) for "{{payload.searchName}}"',
					}),
					body: localized({
						fr: "De nouvelles annonces correspondent à votre alerte « {{payload.searchName}} ».",
						en: 'New listings match your alert "{{payload.searchName}}".',
					}),
				}),
			],
		},
	},
	{
		// P2 replaced the `users.verified` checkbox with the derived shop-level
		// badges and no longer fires this trigger. It stays declared — never
		// deleted — because Novu resolves an in-app notification by the
		// workflow id it was sent under: removing the workflow would leave
		// every `user-verified` notification a P1 user already received
		// pointing at nothing. Safe to delete once no such notification can
		// still be unread, which P3 owns.
		channels: { push: true },
		definition: {
			name: "User Verified",
			description: "Push-only confirmation when an account becomes verified.",
			workflowId: "user-verified",
			tags: ["verified"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					name: stringProperty("User display name"),
				},
				["name"],
			),
			preferences: preferences({ push: true }),
			steps: [
				pushStep("Push", "push", {
					subject: localized({ fr: "Compte vérifié", en: "Account verified" }),
					body: localized({
						fr: "Félicitations {{payload.name}} ! Votre compte est maintenant vérifié.",
						en: "Congratulations {{payload.name}}! Your account is now verified.",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true },
		definition: {
			name: "Contact Form",
			description:
				"Email-only notification sent to the admin subscriber from the public contact form.",
			workflowId: "contact-form",
			tags: ["contact", "email"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					name: stringProperty("Sender name"),
					email: stringProperty("Sender email"),
					subject: stringProperty("Contact subject"),
					message: stringProperty("Contact message"),
				},
				["name", "email", "subject", "message"],
			),
			preferences: preferences({ email: true }),
			steps: [
				emailStep("Email", "email", {
					subject: "[Contact] {{payload.subject}}",
					body: [
						"<p><strong>De :</strong> {{payload.name}} ({{payload.email}})</p>",
						"<p><strong>Sujet :</strong> {{payload.subject}}</p>",
						"<hr />",
						"<p>{{payload.message}}</p>",
					].join(""),
					editorType: "html",
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Shop Created",
			description: "Welcomes a new shop owner with the link to share.",
			workflowId: "shop-created",
			tags: ["shop"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop name"),
					handle: stringProperty("Shop handle"),
					shopUrl: stringProperty("Public shop URL"),
				},
				["shopId", "shopName", "handle", "shopUrl"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Votre boutique est en ligne",
						en: "Your shop is live",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » est ouverte. Partagez {{payload.shopUrl}} sur WhatsApp et Facebook.",
						en: '"{{payload.shopName}}" is open. Share {{payload.shopUrl}} on WhatsApp and Facebook.',
					}),
					redirect: redirect("/seller"),
					primaryAction: action(
						localized({ fr: "Ouvrir ma boutique", en: "Open my shop" }),
						"/seller",
					),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Votre boutique est en ligne",
						en: "Your shop is live",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » est ouverte. Ajoutez votre premier produit.",
						en: '"{{payload.shopName}}" is open. Add your first product.',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Votre boutique {{payload.shopName}} est en ligne",
						en: "Your shop {{payload.shopName}} is live",
					}),
					body: localized({
						fr: "Bienvenue ! Votre page publique : {{payload.shopUrl}}. Ajoutez vos produits et partagez le lien.",
						en: "Welcome! Your public page: {{payload.shopUrl}}. Add your products and share the link.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Shop Suspended",
			description: "Tells the owner their shop was suspended by moderation.",
			workflowId: "shop-suspended",
			tags: ["shop", "moderation"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop name"),
					reason: stringProperty("Suspension reason code"),
					until: stringProperty("End date (ISO) or empty when indefinite"),
				},
				["shopId", "shopName", "reason", "until"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Boutique suspendue",
						en: "Shop suspended",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » est suspendue ({{payload.reason}}). Vos produits ne sont plus visibles.",
						en: '"{{payload.shopName}}" is suspended ({{payload.reason}}). Your products are no longer visible.',
					}),
					redirect: redirect("/seller"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Boutique suspendue",
						en: "Shop suspended",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » est suspendue par la modération.",
						en: '"{{payload.shopName}}" was suspended by moderation.',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Votre boutique {{payload.shopName}} est suspendue",
						en: "Your shop {{payload.shopName}} is suspended",
					}),
					body: localized({
						fr: "Motif : {{payload.reason}}. Fin prévue : {{payload.until}}. Contactez le support pour toute question.",
						en: "Reason: {{payload.reason}}. Planned end: {{payload.until}}. Contact support with any question.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Unsuspended",
			description: "Tells the owner their shop suspension was lifted.",
			workflowId: "shop-unsuspended",
			tags: ["shop", "moderation"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop name"),
				},
				["shopId", "shopName"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Boutique rétablie", en: "Shop restored" }),
					body: localized({
						fr: "« {{payload.shopName}} » est de nouveau en ligne.",
						en: '"{{payload.shopName}}" is live again.',
					}),
					redirect: redirect("/seller"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Boutique rétablie", en: "Shop restored" }),
					body: localized({
						fr: "« {{payload.shopName}} » est de nouveau en ligne.",
						en: '"{{payload.shopName}}" is live again.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Stock Low",
			description:
				"Alerts shop owners and managers when a variant reaches its low-stock threshold.",
			workflowId: "stock-low",
			tags: ["shop", "stock"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					productId: stringProperty("Product identifier"),
					productTitle: stringProperty("Product title"),
					variantLabel: stringProperty(
						"Variant label, empty for a default variant",
					),
					available: numberProperty("Units available"),
				},
				["shopId", "productId", "productTitle", "variantLabel", "available"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Stock faible", en: "Low stock" }),
					body: localized({
						fr: "« {{payload.productTitle}} » {{payload.variantLabel}} : plus que {{payload.available}} en stock.",
						en: '"{{payload.productTitle}}" {{payload.variantLabel}}: only {{payload.available}} left in stock.',
					}),
					redirect: redirect("/seller/catalogue/{{payload.productId}}"),
					primaryAction: action(
						localized({ fr: "Réapprovisionner", en: "Restock" }),
						"/seller/catalogue/{{payload.productId}}",
					),
					data: { productId: "{{payload.productId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Stock faible", en: "Low stock" }),
					body: localized({
						fr: "« {{payload.productTitle}} » : plus que {{payload.available}} en stock.",
						en: '"{{payload.productTitle}}": only {{payload.available}} left in stock.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Verification Needs Info",
			description:
				"Tells a seller a reviewer needs more from their verification request.",
			workflowId: "verification-needs-info",
			tags: ["verification"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopName: stringProperty("Shop display name"),
					reasonCode: stringProperty("Info-request reason code"),
					message: stringProperty("Reviewer's message to the seller"),
				},
				["shopName", "reasonCode", "message"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Informations complémentaires requises",
						en: "Additional information required",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.message}}",
						en: '"{{payload.shopName}}": {{payload.message}}',
					}),
					redirect: redirect("/seller/verification"),
					primaryAction: action(
						localized({ fr: "Répondre", en: "Respond" }),
						"/seller/verification",
					),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Informations complémentaires requises",
						en: "Additional information required",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.message}}",
						en: '"{{payload.shopName}}": {{payload.message}}',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Vérification de {{payload.shopName}} : informations requises",
						en: "{{payload.shopName}} verification: information required",
					}),
					body: localized({
						fr: "Un modérateur a besoin d'informations supplémentaires pour continuer la vérification de {{payload.shopName}}.<br/><br/>{{payload.message}}",
						en: "A reviewer needs more information to continue verifying {{payload.shopName}}.<br/><br/>{{payload.message}}",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Verification Approved",
			description: "Tells a seller their verification request was approved.",
			workflowId: "verification-approved",
			tags: ["verification", "approved"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopName: stringProperty("Shop display name"),
					level: numberProperty("The level just reached (2 or 3)"),
					unlocks: stringProperty(
						"Comma-separated capability keys this level unlocks",
					),
				},
				["shopName", "level", "unlocks"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Vérification approuvée",
						en: "Verification approved",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » a atteint le niveau {{payload.level}}. Débloqué : {{payload.unlocks}}.",
						en: '"{{payload.shopName}}" reached level {{payload.level}}. Unlocked: {{payload.unlocks}}.',
					}),
					redirect: redirect("/seller/verification"),
					primaryAction: action(
						localized({ fr: "Voir", en: "View" }),
						"/seller/verification",
					),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Vérification approuvée",
						en: "Verification approved",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » a atteint le niveau {{payload.level}}.",
						en: '"{{payload.shopName}}" reached level {{payload.level}}.',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.shopName}} : vérification approuvée",
						en: "{{payload.shopName}}: verification approved",
					}),
					body: localized({
						fr: "Félicitations, {{payload.shopName}} a atteint le niveau {{payload.level}} et débloque : {{payload.unlocks}}.",
						en: "Congratulations, {{payload.shopName}} has reached level {{payload.level}} and unlocked: {{payload.unlocks}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Verification Rejected",
			description: "Tells a seller their verification request was rejected.",
			workflowId: "verification-rejected",
			tags: ["verification", "rejected"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopName: stringProperty("Shop display name"),
					reasonCode: stringProperty("Rejection reason code"),
					sellerMessage: stringProperty("Reviewer's message to the seller"),
					cooldownUntil: stringProperty(
						"ISO date a new request is allowed, or empty",
					),
				},
				["shopName", "reasonCode", "sellerMessage", "cooldownUntil"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Vérification refusée",
						en: "Verification rejected",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.sellerMessage}}",
						en: '"{{payload.shopName}}": {{payload.sellerMessage}}',
					}),
					redirect: redirect("/seller/verification"),
					primaryAction: action(
						localized({ fr: "Voir les détails", en: "View details" }),
						"/seller/verification",
					),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Vérification refusée",
						en: "Verification rejected",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.sellerMessage}}",
						en: '"{{payload.shopName}}": {{payload.sellerMessage}}',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.shopName}} : vérification refusée",
						en: "{{payload.shopName}}: verification rejected",
					}),
					body: localized({
						fr: "Motif : {{payload.sellerMessage}}. Nouvelle demande possible à partir du {{payload.cooldownUntil}}.",
						en: "Reason: {{payload.sellerMessage}}. A new request is allowed starting {{payload.cooldownUntil}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Verification Revoked",
			description: "Tells a seller their verification was revoked.",
			workflowId: "verification-revoked",
			tags: ["verification", "revoked"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopName: stringProperty("Shop display name"),
					reasonCode: stringProperty("Revocation reason code"),
				},
				["shopName", "reasonCode"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Vérification révoquée",
						en: "Verification revoked",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » a perdu sa vérification ({{payload.reasonCode}}).",
						en: '"{{payload.shopName}}" lost its verification ({{payload.reasonCode}}).',
					}),
					redirect: redirect("/seller/verification"),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Vérification révoquée",
						en: "Verification revoked",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » a perdu sa vérification ({{payload.reasonCode}}).",
						en: '"{{payload.shopName}}" lost its verification ({{payload.reasonCode}}).',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.shopName}} : vérification révoquée",
						en: "{{payload.shopName}}: verification revoked",
					}),
					body: localized({
						fr: "Votre vérification a été révoquée. Motif : {{payload.reasonCode}}.",
						en: "Your verification has been revoked. Reason: {{payload.reasonCode}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Verification Expiring",
			description:
				"Warns a seller that their shop's verification level is about to expire.",
			workflowId: "verification-expiring",
			tags: ["verification", "expiring"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopName: stringProperty("Shop display name"),
					daysUntil: numberProperty("Days until the level lapses (30 or 7)"),
				},
				["shopName", "daysUntil"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Vérification bientôt expirée",
						en: "Verification expiring soon",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.daysUntil}} jour(s) avant expiration.",
						en: '"{{payload.shopName}}": {{payload.daysUntil}} day(s) before it expires.',
					}),
					redirect: redirect("/seller/verification"),
					primaryAction: action(
						localized({ fr: "Renouveler", en: "Renew" }),
						"/seller/verification",
					),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Vérification bientôt expirée",
						en: "Verification expiring soon",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » : {{payload.daysUntil}} jour(s) avant expiration.",
						en: '"{{payload.shopName}}": {{payload.daysUntil}} day(s) before it expires.',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.shopName}} : vérification bientôt expirée",
						en: "{{payload.shopName}}: verification expiring soon",
					}),
					body: localized({
						fr: "La vérification de {{payload.shopName}} expire dans {{payload.daysUntil}} jour(s).",
						en: "{{payload.shopName}}'s verification expires in {{payload.daysUntil}} day(s).",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true, inApp: true, push: true },
		definition: {
			name: "Shop Invitation",
			description: "Invites someone to join a shop's team.",
			workflowId: "shop-invitation",
			tags: ["shop", "team"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					inviterName: stringProperty("Who sent the invitation"),
					role: stringProperty("manager or staff"),
					inviteUrl: stringProperty("Absolute invitation link"),
				},
				["shopId", "shopName", "inviterName", "role", "inviteUrl"],
			),
			preferences: preferences({ email: true, inApp: true, push: true }),
			steps: [
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.inviterName}} vous invite à rejoindre {{payload.shopName}}",
						en: "{{payload.inviterName}} invites you to join {{payload.shopName}}",
					}),
					body: localized({
						fr: '<p>{{payload.inviterName}} vous invite à rejoindre l\'équipe de {{payload.shopName}} sur BuyNSellem comme {{payload.role}}.</p><p><a href="{{payload.inviteUrl}}">Rejoindre {{payload.shopName}}</a></p><p>Ce lien expire dans 7 jours.</p>',
						en: '<p>{{payload.inviterName}} invites you to join {{payload.shopName}}\'s team on BuyNSellem as {{payload.role}}.</p><p><a href="{{payload.inviteUrl}}">Join {{payload.shopName}}</a></p><p>This link expires in 7 days.</p>',
					}),
				}),
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Invitation à rejoindre {{payload.shopName}}",
						en: "Invitation to join {{payload.shopName}}",
					}),
					body: localized({
						fr: "{{payload.inviterName}} vous invite comme {{payload.role}}.",
						en: "{{payload.inviterName}} invites you as {{payload.role}}.",
					}),
					redirect: redirect("{{payload.inviteUrl}}"),
					primaryAction: action(
						localized({ fr: "Voir l'invitation", en: "View invitation" }),
						"{{payload.inviteUrl}}",
					),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Invitation à rejoindre {{payload.shopName}}",
						en: "Invitation to join {{payload.shopName}}",
					}),
					body: localized({
						fr: "{{payload.inviterName}} vous invite comme {{payload.role}}.",
						en: "{{payload.inviterName}} invites you as {{payload.role}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Invitation Accepted",
			description: "Tells the inviter and the owner someone joined the team.",
			workflowId: "shop-invitation-accepted",
			tags: ["shop", "team"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					memberName: stringProperty("The new member's display name"),
					role: stringProperty("manager or staff"),
				},
				["shopId", "shopName", "memberName", "role"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "{{payload.memberName}} a rejoint {{payload.shopName}}",
						en: "{{payload.memberName}} joined {{payload.shopName}}",
					}),
					body: localized({
						fr: "{{payload.memberName}} a accepté l'invitation comme {{payload.role}}.",
						en: "{{payload.memberName}} accepted the invitation as {{payload.role}}.",
					}),
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "{{payload.memberName}} a rejoint {{payload.shopName}}",
						en: "{{payload.memberName}} joined {{payload.shopName}}",
					}),
					body: localized({
						fr: "{{payload.memberName}} a accepté l'invitation comme {{payload.role}}.",
						en: "{{payload.memberName}} accepted the invitation as {{payload.role}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true },
		definition: {
			name: "Shop Invitation Declined",
			description: "Tells the inviter an invitation was declined.",
			workflowId: "shop-invitation-declined",
			tags: ["shop", "team"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					maskedTarget: stringProperty("Masked phone or email of the invitee"),
				},
				["shopId", "shopName", "maskedTarget"],
			),
			preferences: preferences({ inApp: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Invitation refusée",
						en: "Invitation declined",
					}),
					body: localized({
						fr: "{{payload.maskedTarget}} a refusé de rejoindre {{payload.shopName}}.",
						en: "{{payload.maskedTarget}} declined to join {{payload.shopName}}.",
					}),
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Member Removed",
			description: "Tells a member they were removed from a shop's team.",
			workflowId: "shop-member-removed",
			tags: ["shop", "team"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
				},
				["shopId", "shopName"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Retiré de {{payload.shopName}}",
						en: "Removed from {{payload.shopName}}",
					}),
					body: localized({
						fr: "Vous n'êtes plus membre de l'équipe de {{payload.shopName}}.",
						en: "You are no longer a member of {{payload.shopName}}'s team.",
					}),
					redirect: redirect("/account"),
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Retiré de {{payload.shopName}}",
						en: "Removed from {{payload.shopName}}",
					}),
					body: localized({
						fr: "Vous n'êtes plus membre de l'équipe de {{payload.shopName}}.",
						en: "You are no longer a member of {{payload.shopName}}'s team.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Member Role Changed",
			description: "Tells a member their role in a shop's team changed.",
			workflowId: "shop-member-role-changed",
			tags: ["shop", "team"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					role: stringProperty("The member's new role"),
				},
				["shopId", "shopName", "role"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Nouveau rôle chez {{payload.shopName}}",
						en: "New role at {{payload.shopName}}",
					}),
					body: localized({
						fr: "Vous êtes maintenant {{payload.role}} chez {{payload.shopName}}.",
						en: "You are now {{payload.role}} at {{payload.shopName}}.",
					}),
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Nouveau rôle chez {{payload.shopName}}",
						en: "New role at {{payload.shopName}}",
					}),
					body: localized({
						fr: "Vous êtes maintenant {{payload.role}} chez {{payload.shopName}}.",
						en: "You are now {{payload.role}} at {{payload.shopName}}.",
					}),
				}),
			],
		},
	},
	{
		// Fired once per recipient (the owner, then every active member), so a
		// single workflow has to serve both: it declares all three channels and
		// each subscriber's own preference decides whether the owner's copy
		// reaches them by email while a staff member's stays in-app only.
		channels: { email: true, inApp: true, push: true },
		definition: {
			name: "Shop Team Paused",
			description: "Tells the owner and team a shop was suspended or closed.",
			workflowId: "shop-team-paused",
			tags: ["shop", "team", "moderation"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
				},
				["shopId", "shopName"],
			),
			preferences: preferences({ email: true, inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Équipe suspendue", en: "Team suspended" }),
					body: localized({
						fr: "« {{payload.shopName}} » est suspendue : l'équipe ne peut plus y accéder.",
						en: '"{{payload.shopName}}" is suspended: the team can no longer access it.',
					}),
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Équipe suspendue", en: "Team suspended" }),
					body: localized({
						fr: "« {{payload.shopName}} » est suspendue : l'équipe ne peut plus y accéder.",
						en: '"{{payload.shopName}}" is suspended: the team can no longer access it.',
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "{{payload.shopName}} : équipe suspendue",
						en: "{{payload.shopName}}: team suspended",
					}),
					body: localized({
						fr: "« {{payload.shopName}} » est suspendue. L'équipe ne peut plus y accéder tant que la suspension dure.",
						en: '"{{payload.shopName}}" is suspended. The team cannot access it while the suspension lasts.',
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Inbox Message",
			description: "Tells the routed shop members a buyer wrote in.",
			workflowId: "shop-inbox-message",
			tags: ["shop", "inbox"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					conversationId: stringProperty("Conversation identifier"),
					buyerName: stringProperty("Buyer display name"),
					messagePreview: stringProperty("First 100 characters of the message"),
				},
				["shopId", "shopName", "conversationId", "buyerName", "messagePreview"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Nouveau message de {{payload.buyerName}}",
						en: "New message from {{payload.buyerName}}",
					}),
					body: "{{payload.messagePreview}}",
					redirect: redirect("/seller/messages/{{payload.conversationId}}"),
					primaryAction: action(
						localized({ fr: "Répondre", en: "Reply" }),
						"/seller/messages/{{payload.conversationId}}",
					),
					data: { conversationId: "{{payload.conversationId}}" },
				}),
				pushStep("Push", "push", {
					subject: "{{payload.shopName}} - {{payload.buyerName}}",
					body: "{{payload.messagePreview}}",
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Order Placed",
			description:
				"Tells the buyer their order was placed and the shop a new order arrived.",
			workflowId: "order-placed",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					shopName: stringProperty("Shop display name"),
					total: numberProperty("Order total, in XAF"),
					audience: stringProperty('"buyer" or "shop"'),
					confirmationRequired: stringProperty(
						'"none", "sms_code" or "seller_call"',
					),
				},
				[
					"orderId",
					"orderNumber",
					"shopName",
					"total",
					"audience",
					"confirmationRequired",
				],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Commande {{payload.orderNumber}}",
						en: "Order {{payload.orderNumber}}",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} enregistrée chez {{payload.shopName}} : {{payload.total}} FCFA.",
						en: "Order {{payload.orderNumber}} recorded with {{payload.shopName}}: {{payload.total}} XAF.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Commande {{payload.orderNumber}}",
						en: "Order {{payload.orderNumber}}",
					}),
					body: "{{payload.shopName}} - {{payload.total}} FCFA",
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Confirmation Needed",
			description:
				"Tells shop members a placed order needs a seller call before it can be accepted.",
			workflowId: "order-confirmation-needed",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					tier: stringProperty("Buyer phone risk tier"),
				},
				["orderId", "orderNumber", "tier"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Appel requis", en: "Call required" }),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : confirmez par appel avant de l'accepter.",
						en: "Order {{payload.orderNumber}}: confirm by phone call before accepting it.",
					}),
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Ouvrir", en: "Open" }),
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Appel requis", en: "Call required" }),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : confirmez par appel.",
						en: "Order {{payload.orderNumber}}: confirm by phone call.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Accept Reminder",
			description:
				"Reminds shop members twelve hours before the 48-hour accept deadline.",
			workflowId: "order-accept-reminder",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					acceptBy: stringProperty("Accept deadline, ISO date"),
				},
				["orderId", "orderNumber", "acceptBy"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Délai d'acceptation",
						en: "Acceptance deadline",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : il vous reste peu de temps pour l'accepter.",
						en: "Order {{payload.orderNumber}}: you have little time left to accept it.",
					}),
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Accepter", en: "Accept" }),
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Délai d'acceptation",
						en: "Acceptance deadline",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : acceptez-la avant {{payload.acceptBy}}.",
						en: "Order {{payload.orderNumber}}: accept it by {{payload.acceptBy}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Accepted",
			description: "Tells the buyer the shop accepted their order.",
			workflowId: "order-accepted",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					shopName: stringProperty("Shop display name"),
					etaText: stringProperty("Delivery ETA, free text"),
				},
				["orderId", "orderNumber", "shopName", "etaText"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Commande acceptée", en: "Order accepted" }),
					body: localized({
						fr: "{{payload.shopName}} a accepté votre commande {{payload.orderNumber}}.",
						en: "{{payload.shopName}} accepted your order {{payload.orderNumber}}.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Commande acceptée", en: "Order accepted" }),
					body: localized({
						fr: "{{payload.shopName}} a accepté votre commande {{payload.orderNumber}}.",
						en: "{{payload.shopName}} accepted your order {{payload.orderNumber}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Shipped",
			description: "Tells the buyer their order is on its way.",
			workflowId: "order-shipped",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					method: stringProperty('"seller_delivery" or "pickup"'),
					pickupPoint: stringProperty(
						"Pickup point, serialised, empty when not pickup",
					),
				},
				["orderId", "orderNumber", "method", "pickupPoint"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Commande expédiée", en: "Order shipped" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} est en route.",
						en: "Your order {{payload.orderNumber}} is on its way.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Commande expédiée", en: "Order shipped" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} est en route.",
						en: "Your order {{payload.orderNumber}} is on its way.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Delivered",
			description: "Tells the buyer and shop members an order was delivered.",
			workflowId: "order-delivered",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					withdrawalUntil: stringProperty("Withdrawal window end, ISO date"),
					reviewUrl: stringProperty("Where to leave a review"),
					audience: stringProperty('"buyer" or "shop"'),
				},
				["orderId", "orderNumber", "withdrawalUntil", "reviewUrl", "audience"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Commande livrée", en: "Order delivered" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} a été livrée.",
						en: "Your order {{payload.orderNumber}} has been delivered.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Noter", en: "Rate" }),
						"{{payload.reviewUrl}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Commande livrée", en: "Order delivered" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} a été livrée.",
						en: "Your order {{payload.orderNumber}} has been delivered.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Cancelled",
			description: "Tells the buyer and shop members an order was cancelled.",
			workflowId: "order-cancelled",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					by: stringProperty('"buyer", "seller", "staff" or "system"'),
					reason: stringProperty("Cancellation reason code"),
				},
				["orderId", "orderNumber", "by", "reason"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Commande annulée", en: "Order cancelled" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} a été annulée.",
						en: "Your order {{payload.orderNumber}} has been cancelled.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Commande annulée", en: "Order cancelled" }),
					body: localized({
						fr: "Votre commande {{payload.orderNumber}} a été annulée.",
						en: "Your order {{payload.orderNumber}} has been cancelled.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Delivery Failed",
			description:
				"Tells the buyer and shop members a delivery attempt failed for good.",
			workflowId: "order-delivery-failed",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					reason: stringProperty("Delivery failure reason code"),
				},
				["orderId", "orderNumber", "reason"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Livraison échouée",
						en: "Delivery failed",
					}),
					body: localized({
						fr: "La livraison de la commande {{payload.orderNumber}} a échoué.",
						en: "Delivery of order {{payload.orderNumber}} failed.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Livraison échouée",
						en: "Delivery failed",
					}),
					body: localized({
						fr: "La livraison de la commande {{payload.orderNumber}} a échoué.",
						en: "Delivery of order {{payload.orderNumber}} failed.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Delivery Declared",
			description:
				"Tells the buyer a delivery was declared without a verified handover code, and until when they can contest it.",
			workflowId: "order-delivery-declared",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					contestBy: stringProperty("Contest window end, ISO date"),
				},
				["orderId", "orderNumber", "contestBy"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Livraison déclarée",
						en: "Delivery declared",
					}),
					body: localized({
						fr: "La commande {{payload.orderNumber}} a été signalée comme livrée sans code vérifié.",
						en: "Order {{payload.orderNumber}} was reported delivered without a verified code.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Livraison déclarée",
						en: "Delivery declared",
					}),
					body: localized({
						fr: "La commande {{payload.orderNumber}} a été signalée comme livrée sans code vérifié.",
						en: "Order {{payload.orderNumber}} was reported delivered without a verified code.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Withdrawal Requested",
			description:
				"Tells the buyer and the shop's owner/manager a withdrawal case was opened.",
			workflowId: "order-withdrawal-requested",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					caseNumber: stringProperty("Return case number"),
					itemsCount: numberProperty("Number of items in the case"),
				},
				["orderId", "caseNumber", "itemsCount"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Rétractation demandée",
						en: "Withdrawal requested",
					}),
					body: localized({
						fr: "Une demande de rétractation a été ouverte pour la commande {{payload.orderId}}.",
						en: "A withdrawal request was opened for order {{payload.orderId}}.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Rétractation demandée",
						en: "Withdrawal requested",
					}),
					body: localized({
						fr: "Une demande de rétractation a été ouverte, dossier {{payload.caseNumber}}.",
						en: "A withdrawal request was opened, case {{payload.caseNumber}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Review Reminder",
			description:
				"Reminds the buyer to review the shop three days after delivery when they have not yet.",
			workflowId: "order-review-reminder",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					shopName: stringProperty("Shop display name"),
				},
				["orderId", "shopName"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Donnez votre avis", en: "Leave a review" }),
					body: localized({
						fr: "Donnez votre avis sur {{payload.shopName}}.",
						en: "Share your review of {{payload.shopName}}.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Noter", en: "Rate" }),
						"/purchases/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Donnez votre avis", en: "Leave a review" }),
					body: localized({
						fr: "Donnez votre avis sur {{payload.shopName}}.",
						en: "Share your review of {{payload.shopName}}.",
					}),
				}),
			],
		},
	},
	/**
	 * Not in the spec's notification catalogue: the spec gives the stale
	 * shipment its job (`failStaleOrders`) and its reminder, but no workflow
	 * row, so `triggerNotificationEvent("order-stale-reminder")` fired into
	 * nothing. This entry is added here with the shape of the fourteen the
	 * table does name; its payload is exactly what `notifyShop`
	 * (jobs/failStaleOrders.ts) sends, and like `order-accept-reminder` it
	 * reaches shop members only.
	 */
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Stale Reminder",
			description:
				"Nudges shop members about an order still in transit three days after shipping.",
			workflowId: "order-stale-reminder",
			tags: ["order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					orderNumber: stringProperty("Order number"),
					shippedAt: stringProperty("Shipping date, ISO date"),
					staleAt: stringProperty(
						"Date the order fails automatically, ISO date",
					),
				},
				["orderId", "orderNumber", "shippedAt", "staleAt"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Livraison en attente",
						en: "Delivery pending",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : expédiée le {{payload.shippedAt}} et toujours en transit. Confirmez la remise ou signalez un échec.",
						en: "Order {{payload.orderNumber}}: shipped on {{payload.shippedAt}} and still in transit. Confirm the handover or report a failure.",
					}),
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Ouvrir", en: "Open" }),
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Livraison en attente",
						en: "Delivery pending",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : toujours en transit, à clôturer avant {{payload.staleAt}}.",
						en: "Order {{payload.orderNumber}}: still in transit, to close by {{payload.staleAt}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Commission Invoice Issued",
			description:
				"Tells the shop's owner/manager a commission invoice was issued.",
			workflowId: "commission-invoice-issued",
			tags: ["commission"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					invoiceId: stringProperty("Invoice identifier"),
					invoiceNumber: stringProperty("Invoice number"),
					totalDue: numberProperty("Total due, in XAF"),
					dueAt: stringProperty("Due date, ISO date"),
				},
				["invoiceId", "invoiceNumber", "totalDue", "dueAt"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Facture de commission",
						en: "Commission invoice",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} émise : {{payload.totalDue}} FCFA.",
						en: "Commission invoice {{payload.invoiceNumber}} issued: {{payload.totalDue}} XAF.",
					}),
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					primaryAction: action(
						localized({ fr: "Payer", en: "Pay" }),
						"/seller/billing/{{payload.invoiceId}}",
					),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Facture de commission",
						en: "Commission invoice",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} : {{payload.totalDue}} FCFA à régler avant {{payload.dueAt}}.",
						en: "Invoice {{payload.invoiceNumber}}: {{payload.totalDue}} XAF due by {{payload.dueAt}}.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Facture de commission {{payload.invoiceNumber}}",
						en: "Commission invoice {{payload.invoiceNumber}}",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} : {{payload.totalDue}} FCFA, à régler avant {{payload.dueAt}}.",
						en: "Invoice {{payload.invoiceNumber}}: {{payload.totalDue}} XAF, due {{payload.dueAt}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Commission Invoice Overdue",
			description:
				"Warns the shop's owner/manager a commission invoice is due soon, overdue, or that orders were restricted.",
			workflowId: "commission-invoice-overdue",
			tags: ["commission"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					invoiceId: stringProperty("Invoice identifier"),
					invoiceNumber: stringProperty("Invoice number"),
					stage: stringProperty('"due_soon", "overdue" or "restricted"'),
				},
				["invoiceId", "invoiceNumber", "stage"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Facture en retard",
						en: "Invoice overdue",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} : statut {{payload.stage}}.",
						en: "Invoice {{payload.invoiceNumber}}: status {{payload.stage}}.",
					}),
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					primaryAction: action(
						localized({ fr: "Payer", en: "Pay" }),
						"/seller/billing/{{payload.invoiceId}}",
					),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Facture en retard",
						en: "Invoice overdue",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} : statut {{payload.stage}}.",
						en: "Invoice {{payload.invoiceNumber}}: status {{payload.stage}}.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Facture {{payload.invoiceNumber}} : {{payload.stage}}",
						en: "Invoice {{payload.invoiceNumber}}: {{payload.stage}}",
					}),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}}, statut {{payload.stage}}.",
						en: "Invoice {{payload.invoiceNumber}}, status {{payload.stage}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Commission Invoice Paid",
			description:
				"Tells the shop's owner/manager a commission invoice was settled.",
			workflowId: "commission-invoice-paid",
			tags: ["commission"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					invoiceId: stringProperty("Invoice identifier"),
					invoiceNumber: stringProperty("Invoice number"),
				},
				["invoiceId", "invoiceNumber"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Facture réglée", en: "Invoice settled" }),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} réglée.",
						en: "Invoice {{payload.invoiceNumber}} settled.",
					}),
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Facture réglée", en: "Invoice settled" }),
					body: localized({
						fr: "Facture {{payload.invoiceNumber}} réglée.",
						en: "Invoice {{payload.invoiceNumber}} settled.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shop Conversation Assigned",
			description: "Tells a member a conversation was assigned to them.",
			workflowId: "shop-conversation-assigned",
			tags: ["shop", "inbox"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					conversationId: stringProperty("Conversation identifier"),
					assignedByName: stringProperty("Who made the assignment"),
				},
				["shopId", "shopName", "conversationId", "assignedByName"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Conversation assignée",
						en: "Conversation assigned",
					}),
					body: localized({
						fr: "{{payload.assignedByName}} vous a assigné une conversation sur {{payload.shopName}}.",
						en: "{{payload.assignedByName}} assigned you a conversation at {{payload.shopName}}.",
					}),
					redirect: redirect("/seller/messages/{{payload.conversationId}}"),
					primaryAction: action(
						localized({ fr: "Ouvrir", en: "Open" }),
						"/seller/messages/{{payload.conversationId}}",
					),
					data: { conversationId: "{{payload.conversationId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Conversation assignée",
						en: "Conversation assigned",
					}),
					body: localized({
						fr: "{{payload.assignedByName}} vous a assigné une conversation sur {{payload.shopName}}.",
						en: "{{payload.assignedByName}} assigned you a conversation at {{payload.shopName}}.",
					}),
				}),
			],
		},
	},
	// --- P5 protected payment ------------------------------------------------
	// Buyer payment notices open the buyer's order screen and shop ones the
	// seller's; payouts open `/seller/payments`, account changes its setup.
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Payment Succeeded",
			description: "Tells the buyer their protected payment went through.",
			workflowId: "payment-succeeded",
			tags: ["payment"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(paymentProperties, PAYMENT_REQUIRED),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Paiement reçu", en: "Payment received" }),
					body: localized({
						fr: "Paiement de {{payload.amount}} {{payload.currency}} reçu pour la commande {{payload.orderNumber}}. La boutique doit maintenant l'accepter.",
						en: "Payment of {{payload.amount}} {{payload.currency}} received for order {{payload.orderNumber}}. The shop now has to accept it.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Paiement reçu", en: "Payment received" }),
					body: localized({
						fr: "Commande {{payload.orderNumber}} payée : {{payload.amount}} {{payload.currency}}.",
						en: "Order {{payload.orderNumber}} paid: {{payload.amount}} {{payload.currency}}.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Paiement reçu, commande {{payload.orderNumber}}",
						en: "Payment received, order {{payload.orderNumber}}",
					}),
					body: localized({
						fr: "Paiement de {{payload.amount}} {{payload.currency}} reçu pour la commande {{payload.orderNumber}}. La boutique doit maintenant l'accepter.",
						en: "Payment of {{payload.amount}} {{payload.currency}} received for order {{payload.orderNumber}}. The shop now has to accept it.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Payment Failed",
			description:
				"Tells the buyer the payment failed for good or expired, and the order was cancelled.",
			workflowId: "payment-failed",
			tags: ["payment"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...paymentProperties,
					status: stringProperty('"failed" or "expired"'),
					failureCode: nullableStringProperty(
						"Provider failure code, null on expiry",
					),
				},
				[...PAYMENT_REQUIRED, "status", "failureCode"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Paiement non abouti",
						en: "Payment failed",
					}),
					body: localized({
						fr: "Le paiement de la commande {{payload.orderNumber}} n'a pas abouti ; la commande est annulée.",
						en: "Payment for order {{payload.orderNumber}} did not go through; the order is cancelled.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Paiement non abouti",
						en: "Payment failed",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} annulée : paiement non abouti.",
						en: "Order {{payload.orderNumber}} cancelled: payment did not go through.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Order Paid",
			description:
				"Tells the shop's owner and managers an order was paid and must be accepted.",
			workflowId: "order-paid",
			tags: ["payment", "order"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...paymentProperties,
					acceptBy: stringProperty("Accept deadline, ISO date"),
				},
				[...PAYMENT_REQUIRED, "acceptBy"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Commande payée", en: "Order paid" }),
					body: localized({
						fr: "Commande {{payload.orderNumber}} payée ({{payload.amount}} {{payload.currency}}). Acceptez-la avant le {{payload.acceptBy}}.",
						en: "Order {{payload.orderNumber}} paid ({{payload.amount}} {{payload.currency}}). Accept it by {{payload.acceptBy}}.",
					}),
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						localized({ fr: "Accepter", en: "Accept" }),
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Commande payée", en: "Order paid" }),
					body: localized({
						fr: "Commande {{payload.orderNumber}} payée, à accepter avant le {{payload.acceptBy}}.",
						en: "Order {{payload.orderNumber}} paid, accept by {{payload.acceptBy}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payments Onboarding Action",
			description:
				"Tells the owner the connected payment account is restricted or has requirements due.",
			workflowId: "payments-onboarding-action",
			tags: ["payment", "account"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					status: stringProperty("Connected account status"),
					requirementsCount: numberProperty("Requirements due"),
				},
				["shopId", "shopName", "status", "requirementsCount"],
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Action requise", en: "Action needed" }),
					body: localized({
						fr: "Le compte de paiement de {{payload.shopName}} demande une action ({{payload.requirementsCount}} élément(s) requis). Complétez-le pour continuer à recevoir des paiements protégés.",
						en: "The payment account for {{payload.shopName}} needs attention ({{payload.requirementsCount}} item(s) required). Complete it to keep receiving protected payments.",
					}),
					redirect: redirect("/seller/payments/setup"),
					primaryAction: action(
						localized({ fr: "Compléter", en: "Complete" }),
						"/seller/payments/setup",
					),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Action requise sur votre compte de paiement",
						en: "Action needed on your payment account",
					}),
					body: localized({
						fr: "Le compte de paiement de {{payload.shopName}} demande une action ({{payload.requirementsCount}} élément(s) requis). Complétez-le dans l'application pour continuer à recevoir des paiements protégés.",
						en: "The payment account for {{payload.shopName}} needs attention ({{payload.requirementsCount}} item(s) required). Complete it in the app to keep receiving protected payments.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payout Account Activated",
			description: "Tells the owner their payout account is active.",
			workflowId: "payout-account-activated",
			tags: ["payout", "account"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				payoutAccountProperties,
				PAYOUT_ACCOUNT_REQUIRED,
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Compte de versement actif",
						en: "Payout account active",
					}),
					body: localized({
						fr: "Votre compte de versement {{payload.accountNumberMasked}} est actif.",
						en: "Your payout account {{payload.accountNumberMasked}} is active.",
					}),
					redirect: redirect("/seller/payments/setup"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Compte de versement actif",
						en: "Payout account active",
					}),
					body: localized({
						fr: "Votre compte de versement {{payload.accountNumberMasked}} est actif : vos versements y seront envoyés.",
						en: "Your payout account {{payload.accountNumberMasked}} is active: your payouts will be sent there.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payout Account Review",
			description:
				"Tells the owner the payout account name only partly matched (staff review) or did not match.",
			workflowId: "payout-account-review",
			tags: ["payout", "account"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...payoutAccountProperties,
					result: stringProperty('"partial" or "mismatch"'),
				},
				[...PAYOUT_ACCOUNT_REQUIRED, "result"],
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Compte de versement non activé",
						en: "Payout account not activated",
					}),
					body: localized({
						fr: "Votre compte de versement {{payload.accountNumberMasked}} n'a pas pu être activé automatiquement : le nom ne correspond pas à votre identité vérifiée. Consultez le détail dans l'application.",
						en: "Your payout account {{payload.accountNumberMasked}} could not be activated automatically: the name does not match your verified identity. See the details in the app.",
					}),
					redirect: redirect("/seller/payments/setup"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Compte de versement non activé",
						en: "Payout account not activated",
					}),
					body: localized({
						fr: "Votre compte de versement {{payload.accountNumberMasked}} n'a pas pu être activé automatiquement : le nom ne correspond pas à votre identité vérifiée. Consultez le détail dans l'application.",
						en: "Your payout account {{payload.accountNumberMasked}} could not be activated automatically: the name does not match your verified identity. See the details in the app.",
					}),
				}),
			],
		},
	},
	{
		// The SMS leg is sent by `notifyPayoutAccountChanged` through
		// `smsProvider`, not by Novu, so the channels here are push and email.
		channels: { push: true, email: true },
		definition: {
			name: "Payout Account Changed",
			description:
				"Warns the owner the payout account changed and payouts are held, with the not-me link.",
			workflowId: "payout-account-changed",
			tags: ["payout", "account", "security"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...payoutAccountProperties,
					holdUntil: stringProperty("Change hold end, ISO date"),
					notMeUrl: stringProperty('"This was not me" link'),
				},
				[...PAYOUT_ACCOUNT_REQUIRED, "holdUntil", "notMeUrl"],
			),
			preferences: preferences({ push: true, email: true }),
			steps: [
				pushStep("Push", "push", {
					subject: localized({
						fr: "Compte de versement modifié",
						en: "Payout account changed",
					}),
					body: localized({
						fr: "Versements suspendus jusqu'au {{payload.holdUntil}}. Ce n'était pas vous ? Ouvrez cette notification.",
						en: "Payouts held until {{payload.holdUntil}}. Not you? Open this notification.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Compte de versement modifié",
						en: "Payout account changed",
					}),
					body: localized({
						fr: "Le compte de versement de votre boutique a été remplacé par {{payload.accountNumberMasked}}. Les versements sont suspendus jusqu'au {{payload.holdUntil}}. Ce n'était pas vous ? {{payload.notMeUrl}}",
						en: "Your shop's payout account was replaced by {{payload.accountNumberMasked}}. Payouts are held until {{payload.holdUntil}}. Not you? {{payload.notMeUrl}}",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payout Hold Placed",
			description:
				"Tells the owner payouts are on hold, with the reason category only, never the rule.",
			workflowId: "payout-hold-placed",
			tags: ["payout", "hold"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...holdProperties,
					checkPayoutAccount: booleanProperty(
						"The owner can lift the cause by fixing the payout account",
					),
				},
				[...HOLD_REQUIRED, "checkPayoutAccount"],
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Versements suspendus",
						en: "Payouts on hold",
					}),
					body: localized({
						fr: "Les versements de {{payload.shopName}} sont suspendus (motif : {{payload.reasonCategory}}).",
						en: "Payouts for {{payload.shopName}} are on hold (reason: {{payload.reasonCategory}}).",
					}),
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Versements suspendus",
						en: "Payouts on hold",
					}),
					body: localized({
						fr: "Les versements de {{payload.shopName}} sont suspendus (motif : {{payload.reasonCategory}}). Le détail est dans l'application.",
						en: "Payouts for {{payload.shopName}} are on hold (reason: {{payload.reasonCategory}}). The details are in the app.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payout Hold Released",
			description: "Tells the owner a payout hold was released or expired.",
			workflowId: "payout-hold-released",
			tags: ["payout", "hold"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...holdProperties,
					cause: stringProperty('"released" or "expired"'),
				},
				[...HOLD_REQUIRED, "cause"],
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Versements rétablis",
						en: "Payouts resumed",
					}),
					body: localized({
						fr: "La suspension des versements de {{payload.shopName}} est levée.",
						en: "The payout hold on {{payload.shopName}} is lifted.",
					}),
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Versements rétablis",
						en: "Payouts resumed",
					}),
					body: localized({
						fr: "La suspension des versements de {{payload.shopName}} est levée.",
						en: "The payout hold on {{payload.shopName}} is lifted.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Payout Sent",
			description: "Tells the owner a payout reached their payout account.",
			workflowId: "payout-sent",
			tags: ["payout"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(payoutProperties, PAYOUT_REQUIRED),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Versement envoyé", en: "Payout sent" }),
					body: localized({
						fr: "Versement de {{payload.amount}} {{payload.currency}} envoyé sur votre compte de versement.",
						en: "Payout of {{payload.amount}} {{payload.currency}} sent to your payout account.",
					}),
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Versement envoyé", en: "Payout sent" }),
					body: localized({
						fr: "{{payload.amount}} {{payload.currency}} envoyés sur votre compte.",
						en: "{{payload.amount}} {{payload.currency}} sent to your account.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Payout Failed",
			description:
				"Tells the owner a payout failed and will be retried at the next run.",
			workflowId: "payout-failed",
			tags: ["payout"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(payoutProperties, PAYOUT_REQUIRED),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({ fr: "Versement échoué", en: "Payout failed" }),
					body: localized({
						fr: "Le versement de {{payload.amount}} {{payload.currency}} a échoué ; il sera retenté au prochain cycle. Vérifiez votre compte de versement.",
						en: "The payout of {{payload.amount}} {{payload.currency}} failed; it will be retried at the next run. Check your payout account.",
					}),
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Versement échoué", en: "Payout failed" }),
					body: localized({
						fr: "Versement de {{payload.amount}} {{payload.currency}} échoué, nouvel essai au prochain cycle.",
						en: "Payout of {{payload.amount}} {{payload.currency}} failed, retried at the next run.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Refund Initiated",
			description:
				"Tells the buyer, and the shop owner, that a refund was started.",
			workflowId: "refund-initiated",
			tags: ["refund"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					...refundProperties,
					audience: stringProperty('"buyer" or "shop"'),
					orderPath: stringProperty("The recipient's own order screen"),
				},
				[...REFUND_REQUIRED, "audience", "orderPath"],
			),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Remboursement lancé",
						en: "Refund started",
					}),
					body: localized({
						fr: "Remboursement de {{payload.amount}} {{payload.currency}} lancé pour la commande {{payload.orderNumber}}.",
						en: "Refund of {{payload.amount}} {{payload.currency}} started for order {{payload.orderNumber}}.",
					}),
					redirect: redirect("{{payload.orderPath}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Remboursement lancé",
						en: "Refund started",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : remboursement de {{payload.amount}} {{payload.currency}} lancé.",
						en: "Order {{payload.orderNumber}}: refund of {{payload.amount}} {{payload.currency}} started.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Remboursement lancé, commande {{payload.orderNumber}}",
						en: "Refund started, order {{payload.orderNumber}}",
					}),
					body: localized({
						fr: "Remboursement de {{payload.amount}} {{payload.currency}} lancé pour la commande {{payload.orderNumber}}.",
						en: "Refund of {{payload.amount}} {{payload.currency}} started for order {{payload.orderNumber}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Refund Completed",
			description: "Tells the buyer their refund was paid out.",
			workflowId: "refund-completed",
			tags: ["refund"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(refundProperties, REFUND_REQUIRED),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Remboursement effectué",
						en: "Refund completed",
					}),
					body: localized({
						fr: "Remboursement de {{payload.amount}} {{payload.currency}} effectué pour la commande {{payload.orderNumber}}.",
						en: "Refund of {{payload.amount}} {{payload.currency}} completed for order {{payload.orderNumber}}.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Remboursement effectué",
						en: "Refund completed",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : {{payload.amount}} {{payload.currency}} remboursés.",
						en: "Order {{payload.orderNumber}}: {{payload.amount}} {{payload.currency}} refunded.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Remboursement effectué, commande {{payload.orderNumber}}",
						en: "Refund completed, order {{payload.orderNumber}}",
					}),
					body: localized({
						fr: "Remboursement de {{payload.amount}} {{payload.currency}} effectué pour la commande {{payload.orderNumber}}.",
						en: "Refund of {{payload.amount}} {{payload.currency}} completed for order {{payload.orderNumber}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true, email: true },
		definition: {
			name: "Refund Failed",
			description:
				"Tells the buyer a refund failed after its retry and staff are handling it.",
			workflowId: "refund-failed",
			tags: ["refund"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(refundProperties, REFUND_REQUIRED),
			preferences: preferences({ inApp: true, push: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Remboursement en échec",
						en: "Refund failed",
					}),
					body: localized({
						fr: "Le remboursement de {{payload.amount}} {{payload.currency}} pour la commande {{payload.orderNumber}} a échoué. Notre équipe s'en occupe.",
						en: "The refund of {{payload.amount}} {{payload.currency}} for order {{payload.orderNumber}} failed. Our team is handling it.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Remboursement en échec",
						en: "Refund failed",
					}),
					body: localized({
						fr: "Commande {{payload.orderNumber}} : le remboursement a échoué, notre équipe s'en occupe.",
						en: "Order {{payload.orderNumber}}: the refund failed, our team is handling it.",
					}),
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Remboursement en échec, commande {{payload.orderNumber}}",
						en: "Refund failed, order {{payload.orderNumber}}",
					}),
					body: localized({
						fr: "Le remboursement de {{payload.amount}} {{payload.currency}} pour la commande {{payload.orderNumber}} a échoué. Notre équipe s'en occupe et revient vers vous.",
						en: "The refund of {{payload.amount}} {{payload.currency}} for order {{payload.orderNumber}} failed. Our team is handling it and will get back to you.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, email: true },
		definition: {
			name: "Payout Receivable Written Off",
			description:
				"Tells the owner an unrecovered receivable was written off and protected payment suspended.",
			workflowId: "payout-receivable-written-off",
			tags: ["payout", "hold"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					amount: numberProperty("Written-off amount"),
					currency: stringProperty("ISO currency code"),
					holdId: stringProperty("The suspending hold"),
				},
				["shopId", "shopName", "amount", "currency", "holdId"],
			),
			preferences: preferences({ inApp: true, email: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Paiement protégé suspendu",
						en: "Protected payment suspended",
					}),
					body: localized({
						fr: "Une somme de {{payload.amount}} {{payload.currency}} due par {{payload.shopName}} n'a pas pu être récupérée ; le paiement protégé est suspendu.",
						en: "An amount of {{payload.amount}} {{payload.currency}} owed by {{payload.shopName}} could not be recovered; protected payment is suspended.",
					}),
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: localized({
						fr: "Paiement protégé suspendu",
						en: "Protected payment suspended",
					}),
					body: localized({
						fr: "Une somme de {{payload.amount}} {{payload.currency}} due par {{payload.shopName}} n'a pas pu être récupérée ; le paiement protégé est suspendu. Contactez-nous pour le rétablir.",
						en: "An amount of {{payload.amount}} {{payload.currency}} owed by {{payload.shopName}} could not be recovered; protected payment is suspended. Contact us to restore it.",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true },
		definition: {
			name: "Payments Reconciliation Alert",
			description: "Tells admins a reconciliation run left open mismatches.",
			workflowId: "payments-reconciliation-alert",
			tags: ["payment", "staff"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					runId: stringProperty("Reconciliation run identifier"),
					openMismatches: numberProperty("Open mismatches after the run"),
				},
				["runId", "openMismatches"],
			),
			preferences: preferences({ email: true }),
			steps: [
				emailStep("Email", "email", {
					subject: localized({
						fr: "[Paiements] {{payload.openMismatches}} écart(s) ouvert(s)",
						en: "[Payments] {{payload.openMismatches}} open mismatch(es)",
					}),
					body: localized({
						fr: "Le rapprochement {{payload.runId}} laisse {{payload.openMismatches}} écart(s) ouvert(s) à traiter.",
						en: "Reconciliation run {{payload.runId}} left {{payload.openMismatches}} open mismatch(es) to resolve.",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true },
		definition: {
			name: "Payments Connected Account Lost",
			description:
				"Tells admins a shop's connected account was disabled or deauthorized and charges are blocked.",
			workflowId: "payments-connected-account-lost",
			tags: ["payment", "staff"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					shopName: stringProperty("Shop display name"),
					status: stringProperty('"disabled" or "deauthorized"'),
				},
				["shopId", "shopName", "status"],
			),
			preferences: preferences({ email: true }),
			steps: [
				emailStep("Email", "email", {
					subject: localized({
						fr: "[Paiements] Compte connecté perdu : {{payload.shopName}}",
						en: "[Payments] Connected account lost: {{payload.shopName}}",
					}),
					body: localized({
						fr: "Le compte connecté de {{payload.shopName}} ({{payload.shopId}}) est passé à {{payload.status}}. Les encaissements sont bloqués par une suspension.",
						en: "The connected account of {{payload.shopName}} ({{payload.shopId}}) became {{payload.status}}. Charges are blocked by a hold.",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true },
		definition: {
			name: "Payments Refund Staff Alert",
			description:
				"Tells admins a refund failed after its retry and a status mismatch awaits them.",
			workflowId: "payments-refund-staff-alert",
			tags: ["payment", "refund", "staff"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					refundId: stringProperty("Refund identifier"),
					orderId: stringProperty("Order identifier"),
					shopId: nullableStringProperty("Shop identifier"),
					amount: numberProperty("Refund amount"),
					currency: stringProperty("ISO currency code"),
					reason: stringProperty("Refund reason"),
					mismatchId: stringProperty("Open status_mismatch identifier"),
					failureReason: nullableStringProperty("Provider failure reason"),
				},
				[
					"refundId",
					"orderId",
					"shopId",
					"amount",
					"currency",
					"reason",
					"mismatchId",
					"failureReason",
				],
			),
			preferences: preferences({ email: true }),
			steps: [
				emailStep("Email", "email", {
					subject: localized({
						fr: "[Paiements] Remboursement en échec {{payload.refundId}}",
						en: "[Payments] Refund failed {{payload.refundId}}",
					}),
					body: localized({
						fr: "Le remboursement {{payload.refundId}} ({{payload.amount}} {{payload.currency}}, commande {{payload.orderId}}) a échoué deux fois : {{payload.failureReason}}. Écart {{payload.mismatchId}} à traiter.",
						en: "Refund {{payload.refundId}} ({{payload.amount}} {{payload.currency}}, order {{payload.orderId}}) failed twice: {{payload.failureReason}}. Mismatch {{payload.mismatchId}} awaits you.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shipment Attempt Failed",
			description:
				"Notifies the buyer and fulfilling shop when a delivery attempt fails.",
			workflowId: "shipment-attempt-failed",
			tags: ["shipment", "delivery"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					shipmentId: stringProperty("Shipment identifier"),
					reason: stringProperty("Delivery attempt failure reason"),
					attemptsLeft: numberProperty("Remaining delivery attempts"),
					rescheduleBy: stringProperty("Redelivery request deadline, ISO date"),
					audience: stringProperty('"buyer" or "shop"'),
				},
				[
					"orderId",
					"shipmentId",
					"reason",
					"attemptsLeft",
					"rescheduleBy",
					"audience",
				],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Échec de livraison",
						en: "Delivery attempt failed",
					}),
					body: localized({
						fr: "La livraison a échoué ({{payload.reason}}). Il reste {{payload.attemptsLeft}} tentative(s).",
						en: "Delivery failed ({{payload.reason}}). {{payload.attemptsLeft}} attempt(s) remain.",
					}),
					redirect: redirect(
						"{% if payload.audience == 'shop' %}/seller/orders/{{payload.orderId}}{% else %}/purchases/{{payload.orderId}}{% endif %}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Échec de livraison",
						en: "Delivery failed",
					}),
					body: localized({
						fr: "La livraison a échoué. Choisissez un nouveau créneau.",
						en: "Delivery failed. Choose another time slot.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shipment Redelivery Scheduled",
			description:
				"Notifies the fulfilling shop and assigned courier team about a redelivery slot.",
			workflowId: "shipment-redelivery-scheduled",
			tags: ["shipment", "delivery"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					shipmentId: stringProperty("Shipment identifier"),
					date: stringProperty("Scheduled delivery date, ISO date"),
					window: stringProperty('"morning", "afternoon" or "evening"'),
					audience: stringProperty('"shop" or "rider"'),
				},
				["orderId", "shipmentId", "date", "window", "audience"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Nouvelle tentative",
						en: "Redelivery scheduled",
					}),
					body: localized({
						fr: "Une nouvelle tentative est programmée pour {{payload.date}} ({{payload.window}}).",
						en: "A new delivery attempt is scheduled for {{payload.date}} ({{payload.window}}).",
					}),
					redirect: redirect(
						"{% if payload.audience == 'rider' %}/rider/shipment/{{payload.shipmentId}}{% else %}/seller/orders/{{payload.orderId}}{% endif %}",
					),
					data: { shipmentId: "{{payload.shipmentId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Nouvelle tentative",
						en: "Redelivery scheduled",
					}),
					body: localized({
						fr: "Nouvel horaire de livraison confirmé.",
						en: "New delivery slot confirmed.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shipment Return Initiated",
			description:
				"Notifies the fulfilling shop when a failed shipment is being returned.",
			workflowId: "shipment-return-initiated",
			tags: ["shipment", "delivery"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shipmentId: stringProperty("Shipment identifier"),
					orderNumber: stringProperty("Human-readable order number"),
					reason: stringProperty("Final delivery failure reason"),
					audience: stringProperty('"shop"'),
				},
				["shipmentId", "orderNumber", "reason", "audience"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Colis en retour",
						en: "Shipment return initiated",
					}),
					body: localized({
						fr: "La livraison de la commande {{payload.orderNumber}} a échoué ({{payload.reason}}). Le colis est en cours de retour à la boutique.",
						en: "Delivery for order {{payload.orderNumber}} failed ({{payload.reason}}). The parcel is being returned to the shop.",
					}),
					redirect: redirect("/seller/orders"),
					data: { shipmentId: "{{payload.shipmentId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Colis en retour",
						en: "Shipment return initiated",
					}),
					body: localized({
						fr: "La commande {{payload.orderNumber}} est en cours de retour à la boutique.",
						en: "Order {{payload.orderNumber}} is being returned to the shop.",
					}),
				}),
			],
		},
	},
	{
		channels: { email: true, push: true },
		definition: {
			name: "Shop Weekly Insights",
			description:
				"Sends shop owners and managers their seven-day summary every Monday.",
			workflowId: "shop-weekly-insights",
			tags: ["insights", "shop"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					from: stringProperty("First day of the summary, YYYY-MM-DD"),
					to: stringProperty("Last day of the summary, YYYY-MM-DD"),
					gmvDelivered: numberProperty("Delivered sales over the period, XAF"),
					ordersPlaced: numberProperty("Orders placed over the period"),
					ordersDelivered: numberProperty("Orders delivered over the period"),
					responseTime: stringProperty(
						'Median first-reply bucket ("m5", "m15", "h1", "h4", "h24", "over24h") or "none"',
					),
					topAction: stringProperty('First recommended action type or "none"'),
					topActionHref: stringProperty("Seller route of the top action"),
				},
				[
					"shopId",
					"from",
					"to",
					"gmvDelivered",
					"ordersPlaced",
					"ordersDelivered",
					"responseTime",
					"topAction",
					"topActionHref",
				],
			),
			preferences: preferences({ email: true, push: true }),
			steps: [
				emailStep("Email", "email", {
					subject: localized({
						fr: "Votre semaine sur BuyNSellem ({{payload.from}} - {{payload.to}})",
						en: "Your week on BuyNSellem ({{payload.from}} - {{payload.to}})",
					}),
					body: localized({
						fr: "Ventes livrées : {{payload.gmvDelivered}} FCFA, {{payload.ordersDelivered}} commande(s) livrée(s) sur {{payload.ordersPlaced}}. Voir le détail : /seller/insights",
						en: "Delivered sales: {{payload.gmvDelivered}} XAF, {{payload.ordersDelivered}} of {{payload.ordersPlaced}} order(s) delivered. Details: /seller/insights",
					}),
				}),
				pushStep("Push", "push", {
					subject: localized({ fr: "Votre semaine", en: "Your week" }),
					body: localized({
						fr: "{{payload.gmvDelivered}} FCFA livrés, {{payload.ordersPlaced}} commande(s).",
						en: "{{payload.gmvDelivered}} XAF delivered, {{payload.ordersPlaced}} order(s).",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shipment Pickup Reminder",
			description:
				"Reminds the buyer to collect an order before its pickup deadline.",
			workflowId: "shipment-pickup-reminder",
			tags: ["shipment", "delivery"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					orderId: stringProperty("Order identifier"),
					pickupDeadline: stringProperty("Pickup deadline, ISO date"),
				},
				["orderId", "pickupDeadline"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Retirez votre commande",
						en: "Collect your order",
					}),
					body: localized({
						fr: "Votre commande vous attend. Retirez-la avant le {{payload.pickupDeadline}}.",
						en: "Your order is waiting. Collect it before {{payload.pickupDeadline}}.",
					}),
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Retirez votre commande",
						en: "Collect your order",
					}),
					body: localized({
						fr: "Votre commande doit être retirée avant le {{payload.pickupDeadline}}.",
						en: "Your order must be collected before {{payload.pickupDeadline}}.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Shipment Late",
			description:
				"Tells the fulfilling shop's order managers a shipment is past its promised date.",
			workflowId: "shipment-late",
			tags: ["shipment", "delivery"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shipmentId: stringProperty("Shipment identifier"),
					orderNumber: stringProperty("Human-readable order number"),
				},
				["shipmentId", "orderNumber"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Livraison en retard",
						en: "Shipment late",
					}),
					body: localized({
						fr: "La commande {{payload.orderNumber}} dépasse la date de livraison promise.",
						en: "Order {{payload.orderNumber}} is past its promised delivery date.",
					}),
					redirect: redirect("/seller/orders"),
					data: { shipmentId: "{{payload.shipmentId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Livraison en retard",
						en: "Shipment late",
					}),
					body: localized({
						fr: "La commande {{payload.orderNumber}} est en retard.",
						en: "Order {{payload.orderNumber}} is late.",
					}),
				}),
			],
		},
	},
	{
		channels: { inApp: true, push: true },
		definition: {
			name: "Delivery Settings Incomplete",
			description:
				"Prompts the shop owner to finish migrating delivery settings.",
			workflowId: "delivery-settings-incomplete",
			tags: ["delivery", "shop-settings"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(
				{
					shopId: stringProperty("Shop identifier"),
					needsStructuredPickupHours: booleanProperty(
						"Pickup hours need to be entered in the structured editor",
					),
					noActiveOption: booleanProperty(
						"The shop has no active COD delivery option",
					),
				},
				["shopId", "needsStructuredPickupHours", "noActiveOption"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: localized({
						fr: "Finalisez vos options de livraison",
						en: "Complete delivery setup",
					}),
					body: localized({
						fr: "Vérifiez les horaires de retrait et les options de livraison de votre boutique.",
						en: "Review your shop's pickup hours and delivery options.",
					}),
					redirect: redirect("/seller/delivery"),
					primaryAction: action(
						localized({ fr: "Configurer", en: "Configure" }),
						"/seller/delivery",
					),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: localized({
						fr: "Finalisez vos options de livraison",
						en: "Complete delivery setup",
					}),
					body: localized({
						fr: "Vérifiez les paramètres de livraison de votre boutique.",
						en: "Review your shop's delivery settings.",
					}),
				}),
			],
		},
	},
];

/** `name_fr`, `name_en`…: one field per language (`localizedFields`). */
function perLocale(name: string, description: string) {
	return Object.fromEntries(
		NOTIFICATION_LOCALES.map((locale) => [
			`${name}_${locale}`,
			stringProperty(`${description}, in ${locale}`),
		]),
	);
}

const casePayloadProperties = {
	caseId: stringProperty("Return or dispute identifier"),
	caseNumber: stringProperty("Human-readable case number"),
	...perLocale("caseTitle", "Short notification title"),
	...perLocale("message", "Notification body"),
	audience: stringProperty('"buyer" or "shop"'),
};

const resaleLinkBaseProperties = {
	linkId: stringProperty("Resale link identifier"),
	shopId: stringProperty("Shop that should receive the notification"),
	otherShopName: stringProperty("Name of the other shop in the link"),
};

const resaleLinkWorkflowDefinitions = [
	{
		workflowId: "resale-link-requested",
		name: "Resale link requested",
		properties: {
			...resaleLinkBaseProperties,
			message: stringProperty("Reseller's request message"),
		},
		required: ["linkId", "shopId", "otherShopName", "message"],
		subject: localized({
			fr: "Nouvelle demande de revente",
			en: "New resale request",
		}),
		body: localized({
			fr: "{{payload.otherShopName}} souhaite revendre vos produits. {{payload.message}}",
			en: "{{payload.otherShopName}} wants to resell your products. {{payload.message}}",
		}),
	},
	{
		workflowId: "resale-link-decided",
		name: "Resale link decided",
		properties: {
			...resaleLinkBaseProperties,
			action: stringProperty('"approved" or "declined"'),
		},
		required: ["linkId", "shopId", "otherShopName", "action"],
		subject: localized({
			fr: "Demande de revente mise à jour",
			en: "Resale request updated",
		}),
		body: localized({
			fr: "Votre demande auprès de {{payload.otherShopName}} est {{payload.action}}.",
			en: "Your request to {{payload.otherShopName}} was {{payload.action}}.",
		}),
	},
	{
		workflowId: "resale-link-suspended",
		name: "Resale link suspended",
		properties: {
			...resaleLinkBaseProperties,
			action: stringProperty('"suspended" or "revoked"'),
			reason: stringProperty(
				"Reason category for the suspension or revocation",
			),
		},
		required: ["linkId", "shopId", "otherShopName", "action", "reason"],
		subject: localized({
			fr: "Accès de revente modifié",
			en: "Resale access updated",
		}),
		body: localized({
			fr: "Votre accès aux produits de {{payload.otherShopName}} est {{payload.action}}. Motif : {{payload.reason}}.",
			en: "Your access to {{payload.otherShopName}} products is {{payload.action}}. Reason: {{payload.reason}}.",
		}),
	},
] as const;

for (const workflow of resaleLinkWorkflowDefinitions) {
	const redirectUrl = "/seller/resale/links/{{payload.linkId}}";
	workflowSpecs.push({
		channels: { inApp: true, push: true },
		definition: {
			name: workflow.name,
			description: `Notifies a resale-link participant about ${workflow.name.toLowerCase()}.`,
			workflowId: workflow.workflowId,
			tags: ["resale", "resale-link"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(workflow.properties, [...workflow.required]),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: workflow.subject,
					body: workflow.body,
					redirect: redirect(redirectUrl),
					primaryAction: action(
						localized({ fr: "Ouvrir", en: "Open" }),
						redirectUrl,
					),
					data: { linkId: "{{payload.linkId}}" },
				}),
				pushStep("Push", "push", {
					subject: workflow.subject,
					body: workflow.body,
				}),
			],
		},
	});
}

const caseWorkflowDefinitions = [
	["return-requested", "Return requested", "in_app", "push", "email"],
	["return-instructions", "Return instructions", "in_app", "email"],
	["return-received", "Return received", "in_app", "push"],
	["return-inspected", "Return inspected", "in_app", "push"],
	["refund-proof-submitted", "Refund proof submitted", "in_app", "push"],
	["refund-overdue", "Refund overdue", "in_app", "push", "email"],
	["dispute-opened", "Dispute opened", "in_app", "push", "email"],
	["dispute-message", "Dispute update", "in_app", "push"],
	["dispute-deadline-reminder", "Dispute deadline reminder", "push", "email"],
	[
		"dispute-info-requested",
		"More information requested",
		"in_app",
		"push",
		"email",
	],
	["dispute-escalated", "Dispute under review", "in_app"],
	["dispute-resolved", "Dispute resolved", "in_app", "push", "email"],
	["dispute-review-overdue", "Dispute review overdue", "email"],
	["shop-strike-added", "Shop standing updated", "in_app", "email"],
] as const;

for (const [workflowId, name, ...channels] of caseWorkflowDefinitions) {
	const usesDisputeId = workflowId.startsWith("dispute-");
	const usesStrikeId = workflowId === "shop-strike-added";
	const idField = usesDisputeId
		? "disputeId"
		: usesStrikeId
			? "strikeId"
			: "returnId";
	const fields = {
		...casePayloadProperties,
		[idField]: stringProperty(`${name} identifier`),
	};
	const required = Object.keys(fields);
	const channelSet = new Set<string>(channels);
	const channelConfig: ChannelConfig = {
		inApp: channelSet.has("in_app"),
		push: channelSet.has("push"),
		email: channelSet.has("email"),
	};
	// The service writes every language; the recipient's is picked here.
	const title = localizedField("caseTitle");
	const body = localizedField("message");
	const redirectUrl = usesDisputeId
		? "/disputes/{{payload.disputeId}}"
		: usesStrikeId
			? "/seller/disputes"
			: "/returns/{{payload.returnId}}";
	const steps: ManagedWorkflowStep[] = [];
	if (channelConfig.inApp) {
		steps.push(
			inAppStep("In-App", "in-app", {
				subject: title,
				body,
				redirect: redirect(redirectUrl),
				primaryAction: action(
					localized({ fr: "Ouvrir", en: "Open" }),
					redirectUrl,
				),
				data: { caseId: `{{payload.${idField}}}` },
			}),
		);
	}
	if (channelConfig.push) {
		steps.push(pushStep("Push", "push", { subject: title, body }));
	}
	if (channelConfig.email) {
		steps.push(emailStep("Email", "email", { subject: title, body }));
	}
	workflowSpecs.push({
		channels: channelConfig,
		definition: {
			name,
			description: `Notifies the relevant parties about ${name.toLowerCase()}.`,
			workflowId,
			tags: ["cases", usesDisputeId ? "disputes" : "returns"],
			active: true,
			validatePayload: true,
			isTranslationEnabled: false,
			payloadSchema: objectSchema(fields, required),
			preferences: preferences(channelConfig),
			steps,
		},
	});
}

/** The finished workflow definitions, e.g. for a test asserting on their shape. */
export const WORKFLOWS = workflowSpecs.map((spec) => spec.definition);

function toUpdateDefinition(
	spec: WorkflowSpec,
	existing: components.WorkflowResponseDto,
): components.UpdateWorkflowDto {
	return {
		name: spec.definition.name,
		description: spec.definition.description,
		tags: spec.definition.tags,
		active: spec.definition.active,
		validatePayload: spec.definition.validatePayload,
		payloadSchema: spec.definition.payloadSchema,
		isTranslationEnabled: spec.definition.isTranslationEnabled,
		workflowId: spec.definition.workflowId,
		steps: spec.definition.steps,
		preferences: spec.definition.preferences ?? preferences(spec.channels),
		origin: existing.origin,
		severity: existing.severity,
	};
}

async function syncWorkflow(
	spec: WorkflowSpec,
	dryRun: boolean,
): Promise<"created" | "updated"> {
	const novu = getNotificationProvider();

	const existing = await novu.workflows
		.get(spec.definition.workflowId)
		.then((response) => response.result)
		.catch((error) => {
			if (error && typeof error === "object" && "statusCode" in error) {
				if (error.statusCode === 404) return null;
			}
			throw error;
		});

	if (!existing) {
		if (!dryRun) {
			await novu.workflows.create(spec.definition);
		}
		return "created";
	}

	if (!dryRun) {
		await novu.workflows.update(
			toUpdateDefinition(spec, existing),
			spec.definition.workflowId,
		);
	}

	return "updated";
}

/**
 * An SDK error with its cause: a network failure reads "Unable to make
 * request" and keeps the reason (DNS, refused, TLS) in `cause`.
 */
/** The SDK's failures to reach Novu at all, as opposed to a refused call. */
function isNetworkError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "ConnectionError" || error.name === "RequestTimeoutError")
	);
}

function describeError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const cause =
		error.cause instanceof Error ? error.cause.message : error.cause;
	return cause ? `${error.message} (${String(cause)})` : error.message;
}

/**
 * Changes whenever a workflow definition does, or the Novu instance and
 * application they are synced to, so a deploy re-syncs only then.
 */
export function notificationWorkflowsFingerprint(
	env: Record<string, string | undefined> = {},
): string {
	return fingerprintOf({
		workflows: workflowSpecs,
		target: [
			novuApiUrl(env) ?? NOVU_CLOUD_API_URL,
			env.NOVU_APPLICATION_IDENTIFIER?.trim() ?? "",
		],
	});
}

/**
 * Creates or updates every workflow in Novu. Idempotent: an existing workflow
 * is fetched first and updated in place. Run at API boot by the deploy tasks
 * whenever the fingerprint above changes, and by hand through `main` below.
 */
export async function syncNotificationWorkflows(
	options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<{ created: number; updated: number }> {
	const dryRun = options.dryRun === true;
	const log = options.log ?? console.log;
	let created = 0;
	let updated = 0;

	// One refused workflow (Novu's plan limit, a bad template) must not leave
	// every workflow after it unsynced: carry on, then name the failures.
	const failed: string[] = [];
	for (const spec of workflowSpecs) {
		const id = spec.definition.workflowId;
		let result: "created" | "updated";
		try {
			result = await syncWorkflow(spec, dryRun);
		} catch (error) {
			// Unreachable instance: every other workflow would wait out the same
			// failure, so stop at the first one and say where Novu was sought.
			if (isNetworkError(error)) {
				throw new Error(
					`Novu unreachable at ${novuApiUrl(process.env) ?? NOVU_CLOUD_API_URL}: ${describeError(error)}`,
				);
			}
			failed.push(`${id}: ${describeError(error)}`);
			continue;
		}
		if (result === "created") created += 1;
		if (result === "updated") updated += 1;

		log(
			`[notifications] ${dryRun ? "would sync" : "synced"} workflow "${id}" (${result})`,
		);
	}

	log(
		`[notifications] ${dryRun ? "dry run complete" : "sync complete"}: ${created} created, ${updated} updated, ${failed.length} failed.`,
	);
	if (failed.length > 0) {
		// Thrown, so the boot task retries on the next boot.
		throw new Error(
			`${failed.length} of ${workflowSpecs.length} workflows not synced — no notification is sent for these:\n${failed.join("\n")}`,
		);
	}
	return { created, updated };
}

async function main() {
	if (!isNotificationProviderConfigured()) {
		console.error(
			"[notifications] NOVU_SECRET_KEY is required to sync notification workflows.",
		);
		process.exit(1);
	}
	await syncNotificationWorkflows({
		dryRun: process.argv.includes("--dry-run"),
	});
}

// Guarded: a test imports this module for `WORKFLOWS` alone, and must not
// trigger a live sync (or the `process.exit` below) just by doing so.
if (import.meta.main) {
	main().catch((error) => {
		console.error("[notifications] Failed to sync workflows:", error);
		process.exit(1);
	});
}
