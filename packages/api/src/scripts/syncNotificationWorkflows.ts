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
					body: 'Le boost de "{{payload.listingTitle}}" a expire. Reboostez pour plus de visibilite.',
					redirect: redirect("/boost/{{payload.listingId}}"),
					primaryAction: action("Rebooster", "/boost/{{payload.listingId}}"),
					data: { listingId: "{{payload.listingId}}" },
				}),
				pushStep("Push", "push", {
					subject: "Boost expire",
					body: 'Le boost de "{{payload.listingTitle}}" a expire. Reboostez pour plus de visibilite.',
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
];

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

main().catch((error) => {
	console.error("[notifications] Failed to sync workflows:", error);
	process.exit(1);
});
