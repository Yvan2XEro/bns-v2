import type { GlobalConfig } from "payload";
import { assertAuthorised } from "../lib/verificationSettings";

const isAdmin = ({ req }: { req: { user?: { role?: string } | null } }) =>
	req.user?.role === "admin";

export const AppSettings: GlobalConfig = {
	slug: "app-settings",
	label: "App Settings",
	access: {
		read: isAdmin,
		update: isAdmin,
	},
	admin: {
		group: "Configuration",
	},
	hooks: {
		beforeChange: [
			({ data }) => {
				const refusal = assertAuthorised(
					(data as { verification?: Record<string, unknown> }).verification ??
						{},
					process.env,
				);
				if (refusal) throw new Error(refusal);
				return data;
			},
		],
	},
	fields: [
		{
			name: "auth",
			type: "group",
			label: "Authentication",
			fields: [
				{
					name: "enabledProviders",
					type: "select",
					hasMany: true,
					label: "Enabled OAuth providers",
					defaultValue: ["google", "apple", "facebook"],
					options: [
						{ label: "Google", value: "google" },
						{ label: "Apple", value: "apple" },
						{ label: "Facebook", value: "facebook" },
					],
				},
				{
					name: "enableLocalAuth",
					type: "checkbox",
					label: "Enable email / password authentication",
					defaultValue: true,
				},
			],
		},
		{
			name: "sms",
			type: "group",
			label: "SMS",
			fields: [
				{
					name: "provider",
					type: "select",
					defaultValue: "avlytext",
					options: [
						{ label: "AvlyText", value: "avlytext" },
						{ label: "MTarget", value: "mtarget" },
						{
							label: "Console (development only — logs instead of sending)",
							value: "console",
						},
					],
					required: true,
				},
				{
					name: "defaultSender",
					type: "text",
					label: "Default sender",
				},
				{
					name: "avlytext",
					type: "group",
					fields: [
						{
							name: "apiKey",
							type: "text",
							label: "API key",
						},
						{
							name: "sender",
							type: "text",
							label: "Sender override",
						},
					],
				},
				{
					name: "mtarget",
					type: "group",
					fields: [
						{
							name: "apiKey",
							type: "text",
							label: "API key",
						},
						{
							name: "sender",
							type: "text",
							label: "Sender override",
						},
					],
				},
			],
		},
		{
			name: "shops",
			type: "group",
			label: "Shops",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					label: "Allow shop creation",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide shop entry points and POST /api/shops returns shop.disabled. Existing shop pages keep resolving.",
					},
				},
				{
					name: "maxPerUser",
					type: "number",
					label: "Shops per user",
					defaultValue: 1,
					min: 1,
					max: 10,
				},
			],
		},
		{
			name: "verification",
			type: "group",
			label: "Verification",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					label: "Allow verification requests",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide verification entry points and the seller write routes return verification.disabled. Existing requests stay readable, reviewers keep deciding, and the retention job keeps running.",
					},
				},
				{
					name: "kycProvider",
					type: "select",
					defaultValue: "didit",
					options: [
						{ label: "Didit", value: "didit" },
						{ label: "Smile ID", value: "smileid" },
					],
					required: true,
				},
				{
					name: "autoApproveIdentity",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"Off at launch: every identity decision is taken by a person. On, a level-2 request the vendor approved with no review signal is approved automatically.",
					},
				},
				{
					name: "authorisation",
					type: "group",
					label: "Law 2024/017 authorisation",
					admin: {
						description:
							"Recorded in the processing register. Verification cannot be enabled until all four are set.",
					},
					fields: [
						{ name: "reference", type: "text" },
						{ name: "grantedAt", type: "date" },
						{
							name: "transfersAuthorised",
							type: "checkbox",
							defaultValue: false,
						},
						{
							name: "consentVersion",
							type: "text",
							admin: {
								description:
									'The consent text version the clients must send back, e.g. "kyc-2026-10-v1".',
							},
						},
					],
				},
			],
		},
	],
};
