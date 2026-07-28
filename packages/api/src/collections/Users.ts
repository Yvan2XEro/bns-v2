import { randomUUID } from "node:crypto";
import type { CollectionConfig } from "payload";
import { anyone } from "@/access/anyone";
import type { AuthProvider } from "../auth/oauth/types";
import { deleteUserRelatedData } from "../services/accountDeletion";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

function ensureAuthProviders(data: Record<string, unknown>) {
	const authProvider =
		(data.authProvider as AuthProvider | undefined) ?? "local";
	const providerAccountId =
		(typeof data.providerAccountId === "string" && data.providerAccountId) ||
		`local_${randomUUID()}`;

	const authProviders = Array.isArray(data.authProviders)
		? data.authProviders
		: [
				{
					provider: authProvider,
					providerAccountId,
				},
			];

	return {
		authProvider,
		authProviders,
		providerAccountId,
	};
}

export const Users: CollectionConfig = {
	slug: "users",
	admin: {
		useAsTitle: "email",
		defaultColumns: ["email", "name", "role", "rating", "createdAt"],
	},
	auth: true,
	access: {
		create: anyone,
		read: anyone,
		admin: ({ req }) =>
			req.user?.role === "admin" || req.user?.role === "moderator",
	},
	hooks: {
		beforeChange: [
			({ req, data, operation, originalDoc }) => {
				// DEBUG — remove once root cause is confirmed
				if (req.context?.oauthFlow) {
					req.payload.logger.info({
						msg: "[oauth] beforeChange",
						operation,
						"data.avatar": data.avatar,
						dataAvatarType: typeof data.avatar,
						"originalDoc.avatar": originalDoc?.avatar,
						originalDocAvatarType: typeof originalDoc?.avatar,
						avatarInData: "avatar" in data,
					});
				}

				if (
					data.avatar &&
					typeof data.avatar === "object" &&
					"id" in (data.avatar as object)
				) {
					data.avatar = (data.avatar as { id: string }).id;
				}

				const user = req.user as { role?: string } | undefined;
				const isAdmin = user?.role === "admin";
				const isOAuthFlow = req.context?.oauthFlow === true;
				const isPhoneVerificationFlow =
					req.context?.phoneVerificationFlow === true;

				if (operation === "create") {
					const authData = ensureAuthProviders(data as Record<string, unknown>);
					data.authProvider = authData.authProvider;
					data.authProviders = authData.authProviders;
					data.providerAccountId = authData.providerAccountId;

					if (!isAdmin) {
						data.role = "user";
						data.verified = undefined;
						data.rating = undefined;
						data.totalReviews = undefined;
					}
				}

				if (operation === "update") {
					const isRatingUpdate = req.context?.ratingUpdate === true;
					if (!isAdmin) {
						data.email = originalDoc.email;
						data.role = originalDoc?.role;
						data.verified = originalDoc.verified;
						if (!isRatingUpdate) {
							data.rating = originalDoc?.rating;
							data.totalReviews = originalDoc.totalReviews;
						}
					}

					if (!isAdmin && !isPhoneVerificationFlow) {
						data.pendingPhone = originalDoc.pendingPhone;
						data.phone = originalDoc.phone;
						data.phoneVerificationAttempts =
							originalDoc.phoneVerificationAttempts;
						data.phoneVerificationCodeHash =
							originalDoc.phoneVerificationCodeHash;
						data.phoneVerificationExpiresAt =
							originalDoc.phoneVerificationExpiresAt;
						data.phoneVerificationLastSentAt =
							originalDoc.phoneVerificationLastSentAt;
						data.phoneVerifiedAt = originalDoc.phoneVerifiedAt;
					}

					if (!isAdmin && !isOAuthFlow) {
						data.authProvider = originalDoc.authProvider;
						data.authProviders = originalDoc.authProviders;
						data.providerAccountId = originalDoc.providerAccountId;
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, previousDoc }) => {
				if (!isNotificationProviderConfigured()) return;

				try {
					const { syncNotificationSubscriber, triggerNotificationEvent } =
						await import("../hooks/notificationEvents");

					const avatarUrl =
						typeof doc.avatar === "object" && doc.avatar?.url
							? doc.avatar.url
							: undefined;

					await syncNotificationSubscriber({
						subscriberId: doc.id as string,
						email: doc.email,
						name: doc.name,
						avatar: avatarUrl,
					});

					// Notify user when they become verified
					if (
						operation === "update" &&
						doc.verified &&
						previousDoc &&
						!previousDoc.verified
					) {
						await triggerNotificationEvent({
							event: "user-verified",
							subscriberId: doc.id as string,
							payload: { name: doc.name },
						});
					}
				} catch (error) {
					console.error("[notifications] Failed to sync subscriber:", error);
				}
			},
		],
		beforeDelete: [
			async ({ req, id }) => {
				const user = await req.payload.findByID({
					collection: "users",
					id,
					depth: 0,
					overrideAccess: true,
				});

				await deleteUserRelatedData(
					req.payload as unknown as Parameters<typeof deleteUserRelatedData>[0],
					{
						authProviders: user.authProviders as
							| Array<{
									provider?: string;
									providerAccountId?: string;
									refreshToken?: string;
							  }>
							| undefined,
						id: user.id,
					},
				);
			},
		],
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "avatar",
			type: "upload",
			relationTo: "media",
		},
		{
			name: "role",
			type: "select",
			hasMany: false,
			options: [
				{ label: "User", value: "user" },
				{ label: "Moderator", value: "moderator" },
				{ label: "Admin", value: "admin" },
			],
			defaultValue: "user",
			required: true,
			saveToJWT: true,
		},
		{
			name: "authProvider",
			type: "select",
			defaultValue: "local",
			options: [
				{ label: "Local", value: "local" },
				{ label: "Google", value: "google" },
				{ label: "Apple", value: "apple" },
				{ label: "Facebook", value: "facebook" },
			],
			required: true,
		},
		{
			name: "providerAccountId",
			type: "text",
			index: true,
			required: true,
		},
		{
			name: "authProviders",
			type: "array",
			fields: [
				{
					name: "provider",
					type: "select",
					options: [
						{ label: "Local", value: "local" },
						{ label: "Google", value: "google" },
						{ label: "Apple", value: "apple" },
						{ label: "Facebook", value: "facebook" },
					],
					required: true,
				},
				{
					name: "providerAccountId",
					type: "text",
					required: true,
				},
				{
					name: "refreshToken",
					type: "text",
					access: {
						read: () => false,
					},
				},
			],
		},
		{
			name: "rating",
			type: "number",
			min: 0,
			max: 5,
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "totalReviews",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "bio",
			type: "textarea",
		},
		{
			name: "phone",
			type: "text",
		},
		{
			name: "pendingPhone",
			type: "text",
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "phoneVerifiedAt",
			type: "date",
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "phoneVerificationCodeHash",
			type: "text",
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "phoneVerificationExpiresAt",
			type: "date",
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "phoneVerificationAttempts",
			type: "number",
			defaultValue: 0,
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "phoneVerificationLastSentAt",
			type: "date",
			access: {
				read: () => false,
			},
			admin: {
				readOnly: true,
			},
		},
		{
			name: "location",
			type: "text",
		},
		{
			name: "verified",
			type: "checkbox",
			defaultValue: false,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
