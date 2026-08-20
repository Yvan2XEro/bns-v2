import { randomUUID } from "node:crypto";
import type { Access, CollectionConfig } from "payload";
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

const selfOrAdmin: Access = ({ req: { user } }) => {
	if (!user) return false;
	if ((user as { role?: string }).role === "admin") return true;

	return {
		id: {
			equals: user.id,
		},
	};
};

export const Users: CollectionConfig = {
	slug: "users",
	admin: {
		useAsTitle: "email",
		defaultColumns: ["email", "name", "role", "rating", "createdAt"],
	},
	// 4-day rolling session: the native /refresh-token endpoint re-issues a JWT
	// as long as the previous one is still within this window, so returning users
	// stay logged in. Beyond 4 days of inactivity they must re-authenticate.
	auth: {
		tokenExpiration: 345600,
	},
	access: {
		create: anyone,
		read: anyone,
		// Without explicit update/delete rules Payload falls back to
		// "any authenticated user", which let any signed-in account reset another
		// user's password (beforeChange pins email/role/phone but never password)
		// or delete them outright, triggering the full destructive cascade.
		// Server-side flows (OAuth, phone verification, rating sync, account
		// deletion) all pass overrideAccess and are unaffected.
		update: selfOrAdmin,
		delete: selfOrAdmin,
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
				// Seeding runs through the local API with no authenticated user, so
				// `isAdmin` is false and the guards below would strip the very roles
				// the seed is trying to create. `context` is server-side only — a REST
				// client cannot set it — so this is not a way to self-promote.
				const isSeed = req.context?.seed === true;
				const isPhoneVerificationFlow =
					req.context?.phoneVerificationFlow === true;

				if (operation === "create") {
					const authData = ensureAuthProviders(data as Record<string, unknown>);
					data.authProvider = authData.authProvider;
					data.authProviders = authData.authProviders;
					data.providerAccountId = authData.providerAccountId;

					if (!isAdmin && !isSeed) {
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
			// Free text the user typed into their profile ("Douala", "Bonabéri,
			// derrière la mairie", …). Existing accounts hold arbitrary strings
			// here, so its type never changes — the structured place lives in
			// `homeLocation` beside it, and the two are independent.
			name: "location",
			type: "text",
			admin: {
				description:
					"Free-text place shown on the public profile. Typed by the user; not derived from GPS.",
			},
		},
		{
			// The remembered location the mobile app pre-fills flows from: city
			// selection, listing creation, search defaults. Written by the client
			// (self-update is already allowed by `access.update`), so nothing here
			// is pinned in `beforeChange` — but nothing here is trusted either: it
			// is a convenience cache, never an authorisation input.
			name: "homeLocation",
			type: "group",
			admin: {
				description:
					"Structured place last confirmed by the user, kept in sync with the mobile app.",
			},
			fields: [
				{ name: "city", type: "text", index: true },
				{ name: "region", type: "text" },
				{ name: "country", type: "text" },
				{
					name: "countryCode",
					type: "text",
					maxLength: 2,
					admin: { description: "ISO 3166-1 alpha-2, uppercase." },
				},
				// No lat/lng here on purpose. The privacy policy states the profile
				// location is "a place name you enter, not GPS coordinates", and
				// that coordinates travel only with a single search request with no
				// history kept. Storing them would contradict both and would change
				// the App Privacy declaration. Coordinates stay on the device, which
				// is all the "listings near you" search needs.
				{
					name: "source",
					type: "select",
					options: [
						{ label: "Device", value: "device" },
						{ label: "Chosen by user", value: "manual" },
					],
				},
				{
					name: "updatedAt",
					type: "date",
					admin: {
						description:
							"Conflict resolution between the device copy and this one — last write wins.",
					},
				},
			],
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
