import type { GlobalConfig } from "payload";

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
	],
};
