import type * as components from "@novu/api/models/components";
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

function objectSchema(
	properties: Record<string, JsonSchema>,
	required: string[],
): JsonSchema {
	return {
		type: "object",
		additionalProperties: false,
		properties,
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
					subject: "Annonce publiee",
					body: 'Votre annonce "{{payload.listingTitle}}" est maintenant en ligne.',
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action(
						"Voir l'annonce",
						"/listing/{{payload.listingId}}",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Annonce publiee",
					body: 'Votre annonce "{{payload.listingTitle}}" est maintenant en ligne.',
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
					reason: stringProperty("Rejection reason"),
				},
				["listingId", "listingTitle", "reason"],
			),
			preferences: preferences({ inApp: true, push: true }),
			steps: [
				inAppStep("In-App", "in-app", {
					subject: "Annonce refusee",
					body: 'Votre annonce "{{payload.listingTitle}}" a ete refusee. Raison : {{payload.reason}}',
					redirect: redirect("/listing/{{payload.listingId}}/edit"),
					primaryAction: action(
						"Modifier l'annonce",
						"/listing/{{payload.listingId}}/edit",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Annonce refusee",
					body: 'Votre annonce "{{payload.listingTitle}}" a ete refusee. Raison : {{payload.reason}}',
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
					subject: "Mise a jour de votre annonce",
					body: 'Le statut de "{{payload.listingTitle}}" est passe a {{payload.newStatus}}.',
					redirect: redirect("/listing/{{payload.listingId}}"),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Mise a jour de votre annonce",
					body: 'Le statut de "{{payload.listingTitle}}" est passe a {{payload.newStatus}}.',
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
					subject: "Annonce expiree",
					body: 'Votre annonce "{{payload.listingTitle}}" a expire. Republiez-la pour continuer a vendre.',
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action("Renouveler", "/listing/{{payload.listingId}}"),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Annonce expiree",
					body: 'Votre annonce "{{payload.listingTitle}}" a expire. Republiez-la pour continuer a vendre.',
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
					subject: "Boost expire",
					body: 'Le boost de "{{payload.listingTitle}}" a expire.',
					redirect: redirect("/listing/{{payload.listingId}}"),
					primaryAction: action(
						"Voir l'annonce",
						"/listing/{{payload.listingId}}",
					),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Boost expire",
					body: 'Le boost de "{{payload.listingTitle}}" a expire.',
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
					subject: "Message de {{payload.senderName}}",
					body: "{{payload.messagePreview}}",
					redirect: redirect("/messages/{{payload.conversationId}}"),
					primaryAction: action(
						"Repondre",
						"/messages/{{payload.conversationId}}",
					),
					data: { conversationId: "{{payload.conversationId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Message de {{payload.senderName}}",
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
					subject: "Nouvel avis de {{payload.reviewerName}}",
					body: "{{payload.reviewerName}} vous a laisse {{payload.rating}} etoile(s) {{payload.comment}}",
				}),
				pushStep("Push", "push", {
					subject: "Nouvel avis de {{payload.reviewerName}}",
					body: "{{payload.reviewerName}} vous a laisse {{payload.rating}} etoile(s) {{payload.comment}}",
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
					subject:
						'{{payload.matchCount}} nouvelle(s) annonce(s) pour "{{payload.searchName}}"',
					body: 'De nouvelles annonces correspondent a votre alerte "{{payload.searchName}}".',
					redirect: redirect("{{payload.searchUrl}}"),
					primaryAction: action("Voir les annonces", "{{payload.searchUrl}}"),
				}),
				pushStep("Push", "push", {
					subject:
						'{{payload.matchCount}} nouvelle(s) annonce(s) pour "{{payload.searchName}}"',
					body: 'De nouvelles annonces correspondent a votre alerte "{{payload.searchName}}".',
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
					subject: "Compte verifie",
					body: "Felicitations {{payload.name}} ! Votre compte est maintenant verifie.",
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
					subject: "Votre boutique est en ligne",
					body: '"{{payload.shopName}}" est ouverte. Partagez {{payload.shopUrl}} sur WhatsApp et Facebook.',
					redirect: redirect("/seller"),
					primaryAction: action("Ouvrir ma boutique", "/seller"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Votre boutique est en ligne",
					body: '"{{payload.shopName}}" est ouverte. Ajoutez votre premier produit.',
				}),
				emailStep("Email", "email", {
					subject: "Votre boutique {{payload.shopName}} est en ligne",
					body: "Bienvenue ! Votre page publique : {{payload.shopUrl}}. Ajoutez vos produits et partagez le lien.",
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
					subject: "Boutique suspendue",
					body: '"{{payload.shopName}}" est suspendue ({{payload.reason}}). Vos produits ne sont plus visibles.',
					redirect: redirect("/seller"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Boutique suspendue",
					body: '"{{payload.shopName}}" est suspendue par la moderation.',
				}),
				emailStep("Email", "email", {
					subject: "Votre boutique {{payload.shopName}} est suspendue",
					body: "Motif : {{payload.reason}}. Fin prevue : {{payload.until}}. Contactez le support pour toute question.",
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
					subject: "Boutique retablie",
					body: '"{{payload.shopName}}" est de nouveau en ligne.',
					redirect: redirect("/seller"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Boutique retablie",
					body: '"{{payload.shopName}}" est de nouveau en ligne.',
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
					subject: "Stock faible",
					body: '"{{payload.productTitle}}" {{payload.variantLabel}} : plus que {{payload.available}} en stock.',
					redirect: redirect("/seller/catalogue/{{payload.productId}}"),
					primaryAction: action(
						"Reapprovisionner",
						"/seller/catalogue/{{payload.productId}}",
					),
					data: { productId: "{{payload.productId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Stock faible",
					body: '"{{payload.productTitle}}" : plus que {{payload.available}} en stock.',
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
					subject:
						"Informations complementaires requises / Additional information required",
					body: '"{{payload.shopName}}" : {{payload.message}}',
					redirect: redirect("/seller/verification"),
					primaryAction: action("Repondre / Respond", "/seller/verification"),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject:
						"Informations complementaires requises / Additional information required",
					body: '"{{payload.shopName}}" : {{payload.message}}',
				}),
				emailStep("Email", "email", {
					subject:
						"Verification de {{payload.shopName}} : informations requises",
					body: "Un modérateur a besoin d'informations supplémentaires pour continuer la vérification de {{payload.shopName}}. / A reviewer needs more information to continue verifying {{payload.shopName}}.<br/><br/>{{payload.message}}",
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
					subject: "Verification approuvee / Verification approved",
					body: '"{{payload.shopName}}" a atteint le niveau {{payload.level}}. Debloque : {{payload.unlocks}}.',
					redirect: redirect("/seller/verification"),
					primaryAction: action("Voir / View", "/seller/verification"),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: "Verification approuvee / Verification approved",
					body: '"{{payload.shopName}}" a atteint le niveau {{payload.level}}.',
				}),
				emailStep("Email", "email", {
					subject: "{{payload.shopName}} : verification approuvee",
					body: "Felicitations, {{payload.shopName}} a atteint le niveau {{payload.level}} et debloque : {{payload.unlocks}}. / Congratulations, {{payload.shopName}} has reached level {{payload.level}} and unlocked: {{payload.unlocks}}.",
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
					subject: "Verification refusee / Verification rejected",
					body: '"{{payload.shopName}}" : {{payload.sellerMessage}}',
					redirect: redirect("/seller/verification"),
					primaryAction: action(
						"Voir les details / View details",
						"/seller/verification",
					),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: "Verification refusee / Verification rejected",
					body: '"{{payload.shopName}}" : {{payload.sellerMessage}}',
				}),
				emailStep("Email", "email", {
					subject: "{{payload.shopName}} : verification refusee",
					body: "Motif : {{payload.sellerMessage}}. Nouvelle demande possible a partir du {{payload.cooldownUntil}}. / Reason: {{payload.sellerMessage}}. A new request is allowed starting {{payload.cooldownUntil}}.",
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
					subject: "Verification revoquee / Verification revoked",
					body: '"{{payload.shopName}}" a perdu sa verification ({{payload.reasonCode}}).',
					redirect: redirect("/seller/verification"),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: "Verification revoquee / Verification revoked",
					body: '"{{payload.shopName}}" a perdu sa verification ({{payload.reasonCode}}).',
				}),
				emailStep("Email", "email", {
					subject: "{{payload.shopName}} : verification revoquee",
					body: "Votre verification a ete revoquee. Motif : {{payload.reasonCode}}. / Your verification has been revoked. Reason: {{payload.reasonCode}}.",
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
					subject: "Verification bientot expiree / Verification expiring soon",
					body: '"{{payload.shopName}}" : {{payload.daysUntil}} jour(s) avant expiration.',
					redirect: redirect("/seller/verification"),
					primaryAction: action("Renouveler / Renew", "/seller/verification"),
					data: { shopName: "{{payload.shopName}}" },
				}),
				pushStep("Push", "push", {
					subject: "Verification bientot expiree / Verification expiring soon",
					body: '"{{payload.shopName}}" : {{payload.daysUntil}} jour(s) avant expiration.',
				}),
				emailStep("Email", "email", {
					subject: "{{payload.shopName}} : verification bientot expiree",
					body: "La verification de {{payload.shopName}} expire dans {{payload.daysUntil}} jour(s). / {{payload.shopName}}'s verification expires in {{payload.daysUntil}} day(s).",
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
					subject:
						"{{payload.inviterName}} vous invite a rejoindre {{payload.shopName}} / {{payload.inviterName}} invites you to join {{payload.shopName}}",
					body: '<p>{{payload.inviterName}} vous invite a rejoindre l\'equipe de {{payload.shopName}} sur BuyNSellem comme {{payload.role}}.</p><p><a href="{{payload.inviteUrl}}">Rejoindre {{payload.shopName}}</a></p><p>Ce lien expire dans 7 jours.</p><hr/><p>{{payload.inviterName}} invites you to join {{payload.shopName}}\'s team on BuyNSellem as {{payload.role}}.</p><p><a href="{{payload.inviteUrl}}">Join {{payload.shopName}}</a></p><p>This link expires in 7 days.</p>',
				}),
				inAppStep("In-App", "in-app", {
					subject: "Invitation a rejoindre {{payload.shopName}}",
					body: "{{payload.inviterName}} vous invite comme {{payload.role}}.",
					redirect: redirect("{{payload.inviteUrl}}"),
					primaryAction: action("Voir l'invitation", "{{payload.inviteUrl}}"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Invitation a rejoindre {{payload.shopName}}",
					body: "{{payload.inviterName}} vous invite comme {{payload.role}}.",
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
					subject: "{{payload.memberName}} a rejoint {{payload.shopName}}",
					body: "{{payload.memberName}} a accepte l'invitation comme {{payload.role}}.",
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "{{payload.memberName}} a rejoint {{payload.shopName}}",
					body: "{{payload.memberName}} a accepte l'invitation comme {{payload.role}}.",
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
					subject: "Invitation refusee",
					body: "{{payload.maskedTarget}} a refuse de rejoindre {{payload.shopName}}.",
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
					subject: "Retire de {{payload.shopName}}",
					body: "Vous n'etes plus membre de l'equipe de {{payload.shopName}}.",
					redirect: redirect("/account"),
				}),
				pushStep("Push", "push", {
					subject: "Retire de {{payload.shopName}}",
					body: "Vous n'etes plus membre de l'equipe de {{payload.shopName}}.",
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
					subject: "Nouveau role chez {{payload.shopName}}",
					body: "Vous etes maintenant {{payload.role}} chez {{payload.shopName}}.",
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Nouveau role chez {{payload.shopName}}",
					body: "Vous etes maintenant {{payload.role}} chez {{payload.shopName}}.",
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
					subject: "Equipe suspendue",
					body: '"{{payload.shopName}}" est suspendue : l\'equipe ne peut plus y acceder.',
					redirect: redirect("/seller/team"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Equipe suspendue",
					body: '"{{payload.shopName}}" est suspendue : l\'equipe ne peut plus y acceder.',
				}),
				emailStep("Email", "email", {
					subject: "{{payload.shopName}} : equipe suspendue",
					body: '"{{payload.shopName}}" est suspendue. L\'equipe ne peut plus y acceder tant que la suspension dure.',
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
					subject: "Nouveau message de {{payload.buyerName}}",
					body: "{{payload.messagePreview}}",
					redirect: redirect("/seller/messages/{{payload.conversationId}}"),
					primaryAction: action(
						"Repondre",
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
					subject: "Commande {{payload.orderNumber}}",
					body: "Commande {{payload.orderNumber}} enregistree chez {{payload.shopName}} : {{payload.total}} FCFA. / Order {{payload.orderNumber}} recorded with {{payload.shopName}}: {{payload.total}} XAF.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande {{payload.orderNumber}}",
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
					subject: "Appel requis",
					body: "Commande {{payload.orderNumber}} : confirmez par appel avant de l'accepter. / Order {{payload.orderNumber}}: confirm by phone call before accepting it.",
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action("Ouvrir", "/seller/orders/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Appel requis",
					body: "Commande {{payload.orderNumber}} : confirmez par appel.",
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
					subject: "Delai d'acceptation",
					body: "Commande {{payload.orderNumber}} : il vous reste peu de temps pour l'accepter. / Order {{payload.orderNumber}}: you have little time left to accept it.",
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						"Accepter",
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Delai d'acceptation",
					body: "Commande {{payload.orderNumber}} : acceptez-la avant {{payload.acceptBy}}.",
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
					subject: "Commande acceptee",
					body: "{{payload.shopName}} a accepte votre commande {{payload.orderNumber}}. / {{payload.shopName}} accepted your order {{payload.orderNumber}}.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande acceptee",
					body: "{{payload.shopName}} a accepte votre commande {{payload.orderNumber}}.",
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
					subject: "Commande expediee",
					body: "Votre commande {{payload.orderNumber}} est en route. / Your order {{payload.orderNumber}} is on its way.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande expediee",
					body: "Votre commande {{payload.orderNumber}} est en route.",
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
					subject: "Commande livree",
					body: "Votre commande {{payload.orderNumber}} a ete livree. / Your order {{payload.orderNumber}} has been delivered.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					primaryAction: action("Noter", "{{payload.reviewUrl}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande livree",
					body: "Votre commande {{payload.orderNumber}} a ete livree.",
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
					subject: "Commande annulee",
					body: "Votre commande {{payload.orderNumber}} a ete annulee. / Your order {{payload.orderNumber}} has been cancelled.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande annulee",
					body: "Votre commande {{payload.orderNumber}} a ete annulee.",
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
					subject: "Livraison echouee",
					body: "La livraison de la commande {{payload.orderNumber}} a echoue. / Delivery of order {{payload.orderNumber}} failed.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Livraison echouee",
					body: "La livraison de la commande {{payload.orderNumber}} a echoue.",
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
					subject: "Livraison declaree",
					body: "La commande {{payload.orderNumber}} a ete signalee comme livree sans code verifie. / Order {{payload.orderNumber}} was reported delivered without a verified code.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Livraison declaree",
					body: "La commande {{payload.orderNumber}} a ete signalee comme livree sans code verifie.",
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
					subject: "Retractation demandee",
					body: "Une demande de retractation a ete ouverte pour la commande {{payload.orderId}}. / A withdrawal request was opened for order {{payload.orderId}}.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Retractation demandee",
					body: "Une demande de retractation a ete ouverte, dossier {{payload.caseNumber}}.",
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
					subject: "Donnez votre avis",
					body: "Donnez votre avis sur {{payload.shopName}}. / Share your review of {{payload.shopName}}.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					primaryAction: action("Noter", "/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Donnez votre avis",
					body: "Donnez votre avis sur {{payload.shopName}}.",
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
					subject: "Livraison en attente",
					body: "Commande {{payload.orderNumber}} : expediee le {{payload.shippedAt}} et toujours en transit. Confirmez la remise ou signalez un echec. / Order {{payload.orderNumber}}: shipped on {{payload.shippedAt}} and still in transit. Confirm the handover or report a failure.",
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action("Ouvrir", "/seller/orders/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Livraison en attente",
					body: "Commande {{payload.orderNumber}} : toujours en transit, a cloturer avant {{payload.staleAt}}.",
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
					subject: "Facture de commission",
					body: "Facture {{payload.invoiceNumber}} emise : {{payload.totalDue}} FCFA. / Commission invoice {{payload.invoiceNumber}} issued: {{payload.totalDue}} XAF.",
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					primaryAction: action(
						"Payer",
						"/seller/billing/{{payload.invoiceId}}",
					),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Facture de commission",
					body: "Facture {{payload.invoiceNumber}} : {{payload.totalDue}} FCFA a regler avant {{payload.dueAt}}.",
				}),
				emailStep("Email", "email", {
					subject:
						"Facture de commission {{payload.invoiceNumber}} / Commission invoice {{payload.invoiceNumber}}",
					body: "Facture {{payload.invoiceNumber}} : {{payload.totalDue}} FCFA, a regler avant {{payload.dueAt}}. / Invoice {{payload.invoiceNumber}}: {{payload.totalDue}} XAF, due {{payload.dueAt}}.",
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
					subject: "Facture en retard",
					body: "Facture {{payload.invoiceNumber}} : statut {{payload.stage}}. / Invoice {{payload.invoiceNumber}}: status {{payload.stage}}.",
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					primaryAction: action(
						"Payer",
						"/seller/billing/{{payload.invoiceId}}",
					),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Facture en retard",
					body: "Facture {{payload.invoiceNumber}} : statut {{payload.stage}}.",
				}),
				emailStep("Email", "email", {
					subject: "Facture {{payload.invoiceNumber}} : {{payload.stage}}",
					body: "Facture {{payload.invoiceNumber}}, statut {{payload.stage}}. / Invoice {{payload.invoiceNumber}}, status {{payload.stage}}.",
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
					subject: "Facture reglee",
					body: "Facture {{payload.invoiceNumber}} reglee. / Invoice {{payload.invoiceNumber}} settled.",
					redirect: redirect("/seller/billing/{{payload.invoiceId}}"),
					data: { invoiceId: "{{payload.invoiceId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Facture reglee",
					body: "Facture {{payload.invoiceNumber}} reglee.",
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
					subject: "Conversation assignee",
					body: "{{payload.assignedByName}} vous a assigne une conversation sur {{payload.shopName}}.",
					redirect: redirect("/seller/messages/{{payload.conversationId}}"),
					primaryAction: action(
						"Ouvrir",
						"/seller/messages/{{payload.conversationId}}",
					),
					data: { conversationId: "{{payload.conversationId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Conversation assignee",
					body: "{{payload.assignedByName}} vous a assigne une conversation sur {{payload.shopName}}.",
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
					subject: "Paiement reçu",
					body: "Paiement de {{payload.amount}} {{payload.currency}} reçu pour la commande {{payload.orderNumber}}. La boutique doit maintenant l'accepter. / Payment of {{payload.amount}} {{payload.currency}} received for order {{payload.orderNumber}}. The shop now has to accept it.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Paiement reçu",
					body: "Commande {{payload.orderNumber}} payée : {{payload.amount}} {{payload.currency}}. / Order {{payload.orderNumber}} paid: {{payload.amount}} {{payload.currency}}.",
				}),
				emailStep("Email", "email", {
					subject:
						"Paiement reçu, commande {{payload.orderNumber}} / Payment received, order {{payload.orderNumber}}",
					body: "Paiement de {{payload.amount}} {{payload.currency}} reçu pour la commande {{payload.orderNumber}}. La boutique doit maintenant l'accepter. / Payment of {{payload.amount}} {{payload.currency}} received for order {{payload.orderNumber}}. The shop now has to accept it.",
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
					subject: "Paiement non abouti",
					body: "Le paiement de la commande {{payload.orderNumber}} n'a pas abouti ; la commande est annulée. / Payment for order {{payload.orderNumber}} did not go through; the order is cancelled.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Paiement non abouti",
					body: "Commande {{payload.orderNumber}} annulée : paiement non abouti. / Order {{payload.orderNumber}} cancelled: payment did not go through.",
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
					subject: "Commande payée",
					body: "Commande {{payload.orderNumber}} payée ({{payload.amount}} {{payload.currency}}). Acceptez-la avant le {{payload.acceptBy}}. / Order {{payload.orderNumber}} paid ({{payload.amount}} {{payload.currency}}). Accept it by {{payload.acceptBy}}.",
					redirect: redirect("/seller/orders/{{payload.orderId}}"),
					primaryAction: action(
						"Accepter / Accept",
						"/seller/orders/{{payload.orderId}}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Commande payée",
					body: "Commande {{payload.orderNumber}} payée, à accepter avant le {{payload.acceptBy}}. / Order {{payload.orderNumber}} paid, accept by {{payload.acceptBy}}.",
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
					subject: "Action requise",
					body: "Le compte de paiement de {{payload.shopName}} demande une action ({{payload.requirementsCount}} élément(s) requis). Complétez-le pour continuer à recevoir des paiements protégés. / The payment account for {{payload.shopName}} needs attention ({{payload.requirementsCount}} item(s) required). Complete it to keep receiving protected payments.",
					redirect: redirect("/seller/payments/setup"),
					primaryAction: action(
						"Compléter / Complete",
						"/seller/payments/setup",
					),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject:
						"Action requise sur votre compte de paiement / Action needed on your payment account",
					body: "Le compte de paiement de {{payload.shopName}} demande une action ({{payload.requirementsCount}} élément(s) requis). Complétez-le dans l'application pour continuer à recevoir des paiements protégés. / The payment account for {{payload.shopName}} needs attention ({{payload.requirementsCount}} item(s) required). Complete it in the app to keep receiving protected payments.",
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
					subject: "Compte de versement actif",
					body: "Votre compte de versement {{payload.accountNumberMasked}} est actif. / Your payout account {{payload.accountNumberMasked}} is active.",
					redirect: redirect("/seller/payments/setup"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: "Compte de versement actif / Payout account active",
					body: "Votre compte de versement {{payload.accountNumberMasked}} est actif : vos versements y seront envoyés. / Your payout account {{payload.accountNumberMasked}} is active: your payouts will be sent there.",
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
					subject: "Compte de versement non activé",
					body: "Votre compte de versement {{payload.accountNumberMasked}} n'a pas pu être activé automatiquement : le nom ne correspond pas à votre identité vérifiée. Consultez le détail dans l'application. / Your payout account {{payload.accountNumberMasked}} could not be activated automatically: the name does not match your verified identity. See the details in the app.",
					redirect: redirect("/seller/payments/setup"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject:
						"Compte de versement non activé / Payout account not activated",
					body: "Votre compte de versement {{payload.accountNumberMasked}} n'a pas pu être activé automatiquement : le nom ne correspond pas à votre identité vérifiée. Consultez le détail dans l'application. / Your payout account {{payload.accountNumberMasked}} could not be activated automatically: the name does not match your verified identity. See the details in the app.",
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
					subject: "Compte de versement modifié",
					body: "Versements suspendus jusqu'au {{payload.holdUntil}}. Ce n'était pas vous ? Ouvrez cette notification. / Payouts held until {{payload.holdUntil}}. Not you? Open this notification.",
				}),
				emailStep("Email", "email", {
					subject: "Compte de versement modifié / Payout account changed",
					body: "Le compte de versement de votre boutique a été remplacé par {{payload.accountNumberMasked}}. Les versements sont suspendus jusqu'au {{payload.holdUntil}}. Ce n'était pas vous ? {{payload.notMeUrl}} / Your shop's payout account was replaced by {{payload.accountNumberMasked}}. Payouts are held until {{payload.holdUntil}}. Not you? {{payload.notMeUrl}}",
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
					subject: "Versements suspendus",
					body: "Les versements de {{payload.shopName}} sont suspendus (motif : {{payload.reasonCategory}}). / Payouts for {{payload.shopName}} are on hold (reason: {{payload.reasonCategory}}).",
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: "Versements suspendus / Payouts on hold",
					body: "Les versements de {{payload.shopName}} sont suspendus (motif : {{payload.reasonCategory}}). Le détail est dans l'application. / Payouts for {{payload.shopName}} are on hold (reason: {{payload.reasonCategory}}). The details are in the app.",
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
					subject: "Versements rétablis",
					body: "La suspension des versements de {{payload.shopName}} est levée. / The payout hold on {{payload.shopName}} is lifted.",
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: "Versements rétablis / Payouts resumed",
					body: "La suspension des versements de {{payload.shopName}} est levée. / The payout hold on {{payload.shopName}} is lifted.",
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
					subject: "Versement envoyé",
					body: "Versement de {{payload.amount}} {{payload.currency}} envoyé sur votre compte de versement. / Payout of {{payload.amount}} {{payload.currency}} sent to your payout account.",
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Versement envoyé",
					body: "{{payload.amount}} {{payload.currency}} envoyés sur votre compte. / {{payload.amount}} {{payload.currency}} sent to your account.",
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
					subject: "Versement échoué",
					body: "Le versement de {{payload.amount}} {{payload.currency}} a échoué ; il sera retenté au prochain cycle. Vérifiez votre compte de versement. / The payout of {{payload.amount}} {{payload.currency}} failed; it will be retried at the next run. Check your payout account.",
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Versement échoué",
					body: "Versement de {{payload.amount}} {{payload.currency}} échoué, nouvel essai au prochain cycle. / Payout of {{payload.amount}} {{payload.currency}} failed, retried at the next run.",
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
					subject: "Remboursement lancé",
					body: "Remboursement de {{payload.amount}} {{payload.currency}} lancé pour la commande {{payload.orderNumber}}. / Refund of {{payload.amount}} {{payload.currency}} started for order {{payload.orderNumber}}.",
					redirect: redirect("{{payload.orderPath}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Remboursement lancé",
					body: "Commande {{payload.orderNumber}} : remboursement de {{payload.amount}} {{payload.currency}} lancé. / Order {{payload.orderNumber}}: refund of {{payload.amount}} {{payload.currency}} started.",
				}),
				emailStep("Email", "email", {
					subject:
						"Remboursement lancé, commande {{payload.orderNumber}} / Refund started, order {{payload.orderNumber}}",
					body: "Remboursement de {{payload.amount}} {{payload.currency}} lancé pour la commande {{payload.orderNumber}}. / Refund of {{payload.amount}} {{payload.currency}} started for order {{payload.orderNumber}}.",
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
					subject: "Remboursement effectué",
					body: "Remboursement de {{payload.amount}} {{payload.currency}} effectué pour la commande {{payload.orderNumber}}. / Refund of {{payload.amount}} {{payload.currency}} completed for order {{payload.orderNumber}}.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Remboursement effectué",
					body: "Commande {{payload.orderNumber}} : {{payload.amount}} {{payload.currency}} remboursés. / Order {{payload.orderNumber}}: {{payload.amount}} {{payload.currency}} refunded.",
				}),
				emailStep("Email", "email", {
					subject:
						"Remboursement effectué, commande {{payload.orderNumber}} / Refund completed, order {{payload.orderNumber}}",
					body: "Remboursement de {{payload.amount}} {{payload.currency}} effectué pour la commande {{payload.orderNumber}}. / Refund of {{payload.amount}} {{payload.currency}} completed for order {{payload.orderNumber}}.",
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
					subject: "Remboursement en échec",
					body: "Le remboursement de {{payload.amount}} {{payload.currency}} pour la commande {{payload.orderNumber}} a échoué. Notre équipe s'en occupe. / The refund of {{payload.amount}} {{payload.currency}} for order {{payload.orderNumber}} failed. Our team is handling it.",
					redirect: redirect("/purchases/{{payload.orderId}}"),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Remboursement en échec",
					body: "Commande {{payload.orderNumber}} : le remboursement a échoué, notre équipe s'en occupe. / Order {{payload.orderNumber}}: the refund failed, our team is handling it.",
				}),
				emailStep("Email", "email", {
					subject:
						"Remboursement en échec, commande {{payload.orderNumber}} / Refund failed, order {{payload.orderNumber}}",
					body: "Le remboursement de {{payload.amount}} {{payload.currency}} pour la commande {{payload.orderNumber}} a échoué. Notre équipe s'en occupe et revient vers vous. / The refund of {{payload.amount}} {{payload.currency}} for order {{payload.orderNumber}} failed. Our team is handling it and will get back to you.",
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
					subject: "Paiement protégé suspendu",
					body: "Une somme de {{payload.amount}} {{payload.currency}} due par {{payload.shopName}} n'a pas pu être récupérée ; le paiement protégé est suspendu. / An amount of {{payload.amount}} {{payload.currency}} owed by {{payload.shopName}} could not be recovered; protected payment is suspended.",
					redirect: redirect("/seller/payments"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				emailStep("Email", "email", {
					subject: "Paiement protégé suspendu / Protected payment suspended",
					body: "Une somme de {{payload.amount}} {{payload.currency}} due par {{payload.shopName}} n'a pas pu être récupérée ; le paiement protégé est suspendu. Contactez-nous pour le rétablir. / An amount of {{payload.amount}} {{payload.currency}} owed by {{payload.shopName}} could not be recovered; protected payment is suspended. Contact us to restore it.",
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
					subject:
						"[Paiements] {{payload.openMismatches}} écart(s) ouvert(s) / [Payments] {{payload.openMismatches}} open mismatch(es)",
					body: "Le rapprochement {{payload.runId}} laisse {{payload.openMismatches}} écart(s) ouvert(s) à traiter. / Reconciliation run {{payload.runId}} left {{payload.openMismatches}} open mismatch(es) to resolve.",
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
					subject:
						"[Paiements] Compte connecté perdu : {{payload.shopName}} / [Payments] Connected account lost: {{payload.shopName}}",
					body: "Le compte connecté de {{payload.shopName}} ({{payload.shopId}}) est passé à {{payload.status}}. Les encaissements sont bloqués par une suspension. / The connected account of {{payload.shopName}} ({{payload.shopId}}) became {{payload.status}}. Charges are blocked by a hold.",
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
					subject:
						"[Paiements] Remboursement en échec {{payload.refundId}} / [Payments] Refund failed {{payload.refundId}}",
					body: "Le remboursement {{payload.refundId}} ({{payload.amount}} {{payload.currency}}, commande {{payload.orderId}}) a échoué deux fois : {{payload.failureReason}}. Écart {{payload.mismatchId}} à traiter. / Refund {{payload.refundId}} ({{payload.amount}} {{payload.currency}}, order {{payload.orderId}}) failed twice: {{payload.failureReason}}. Mismatch {{payload.mismatchId}} awaits you.",
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
					subject: "Echec de livraison / Delivery attempt failed",
					body: "La livraison a echoue ({{payload.reason}}). Il reste {{payload.attemptsLeft}} tentative(s). / Delivery failed ({{payload.reason}}). {{payload.attemptsLeft}} attempt(s) remain.",
					redirect: redirect(
						"{% if payload.audience == 'shop' %}/seller/orders/{{payload.orderId}}{% else %}/purchases/{{payload.orderId}}{% endif %}",
					),
					data: { orderId: "{{payload.orderId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Echec de livraison / Delivery failed",
					body: "La livraison a echoue. Choisissez un nouveau creneau. / Delivery failed. Choose another time slot.",
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
					subject: "Nouvelle tentative / Redelivery scheduled",
					body: "Une nouvelle tentative est programmee pour {{payload.date}} ({{payload.window}}). / A new delivery attempt is scheduled for {{payload.date}} ({{payload.window}}).",
					redirect: redirect(
						"{% if payload.audience == 'rider' %}/rider/shipment/{{payload.shipmentId}}{% else %}/seller/orders/{{payload.orderId}}{% endif %}",
					),
					data: { shipmentId: "{{payload.shipmentId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Nouvelle tentative / Redelivery scheduled",
					body: "Nouvel horaire de livraison confirme. / New delivery slot confirmed.",
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
					subject: "Colis en retour / Shipment return initiated",
					body: "La livraison de la commande {{payload.orderNumber}} a échoué ({{payload.reason}}). Le colis est en cours de retour à la boutique. / Delivery for order {{payload.orderNumber}} failed ({{payload.reason}}). The parcel is being returned to the shop.",
					redirect: redirect("/seller/orders"),
					data: { shipmentId: "{{payload.shipmentId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Colis en retour / Shipment return initiated",
					body: "La commande {{payload.orderNumber}} est en cours de retour à la boutique. / Order {{payload.orderNumber}} is being returned to the shop.",
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
					subject:
						"Finalisez vos options de livraison / Complete delivery setup",
					body: "Vérifiez les horaires de retrait et les options de livraison de votre boutique. / Review your shop's pickup hours and delivery options.",
					redirect: redirect("/seller/delivery"),
					primaryAction: action("Configurer / Configure", "/seller/delivery"),
					data: { shopId: "{{payload.shopId}}" },
				}),
				pushStep("Push", "push", {
					subject:
						"Finalisez vos options de livraison / Complete delivery setup",
					body: "Vérifiez les paramètres de livraison de votre boutique. / Review your shop's delivery settings.",
				}),
			],
		},
	},
];

const casePayloadProperties = {
	caseId: stringProperty("Return or dispute identifier"),
	caseNumber: stringProperty("Human-readable case number"),
	caseTitle: stringProperty("Short bilingual notification title"),
	message: stringProperty("Bilingual notification body"),
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
		subject: "Nouvelle demande de revente / New resale request",
		body: "{{payload.otherShopName}} souhaite revendre vos produits. / {{payload.otherShopName}} wants to resell your products. {{payload.message}}",
	},
	{
		workflowId: "resale-link-decided",
		name: "Resale link decided",
		properties: {
			...resaleLinkBaseProperties,
			action: stringProperty('"approved" or "declined"'),
		},
		required: ["linkId", "shopId", "otherShopName", "action"],
		subject: "Demande de revente mise à jour / Resale request updated",
		body: "Votre demande auprès de {{payload.otherShopName}} est {{payload.action}}. / Your request to {{payload.otherShopName}} was {{payload.action}}.",
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
		subject: "Accès de revente modifié / Resale access updated",
		body: "Votre accès aux produits de {{payload.otherShopName}} est {{payload.action}}. Motif : {{payload.reason}}. / Your access to {{payload.otherShopName}} products is {{payload.action}}. Reason: {{payload.reason}}.",
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
					primaryAction: action("Ouvrir / Open", redirectUrl),
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
	const title = "{{payload.caseTitle}}";
	const body = "{{payload.message}}";
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
				primaryAction: action("Ouvrir / Open", redirectUrl),
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

async function main() {
	const dryRun = process.argv.includes("--dry-run");

	if (!isNotificationProviderConfigured()) {
		console.error(
			"[notifications] NOVU_SECRET_KEY is required to sync notification workflows.",
		);
		process.exit(1);
	}

	let created = 0;
	let updated = 0;

	for (const spec of workflowSpecs) {
		const result = await syncWorkflow(spec, dryRun);
		if (result === "created") created += 1;
		if (result === "updated") updated += 1;

		console.log(
			`[notifications] ${dryRun ? "would sync" : "synced"} workflow "${spec.definition.workflowId}" (${result})`,
		);
	}

	console.log(
		`[notifications] ${dryRun ? "dry run complete" : "sync complete"}: ${created} created, ${updated} updated.`,
	);
}

// Guarded: a test imports this module for `WORKFLOWS` alone, and must not
// trigger a live sync (or the `process.exit` below) just by doing so.
if (import.meta.main) {
	main().catch((error) => {
		console.error("[notifications] Failed to sync workflows:", error);
		process.exit(1);
	});
}
