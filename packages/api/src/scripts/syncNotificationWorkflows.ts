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
];

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
