import { createHash, randomInt } from "node:crypto";
import type { Payload } from "payload";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import type { User } from "@/payload-types";
import { sendSms } from "./smsProvider";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const OTP_MESSAGE_SENDER = "BuyNSellem";

type PhoneVerificationUser = User & {
	pendingPhone?: null | string;
	phoneVerificationAttempts?: null | number;
	phoneVerificationCodeHash?: null | string;
	phoneVerificationExpiresAt?: null | string;
	phoneVerificationLastSentAt?: null | string;
	phoneVerifiedAt?: null | string;
};

type PhoneVerificationStatus = {
	expiresAt: null | string;
	hasPendingVerification: boolean;
	isPhoneVerified: boolean;
	pendingPhone: null | string;
	phone: null | string;
	phoneVerifiedAt: null | string;
	resendAvailableAt: null | string;
};

export class PhoneVerificationError extends Error {
	status: number;
	/** Shared client-facing code; see src/lib/errors.ts. */
	code: ErrorCode;

	constructor(
		message: string,
		status = 400,
		code: ErrorCode = ERROR_CODES.badRequest,
	) {
		super(message);
		this.name = "PhoneVerificationError";
		this.status = status;
		this.code = code;
	}
}

function normalizePhoneNumber(input: string): string {
	const trimmed = input.trim();
	const digitsOnly = trimmed.replace(/[^\d+]/g, "");
	const normalized = digitsOnly.startsWith("+")
		? `+${digitsOnly.slice(1).replace(/\D/g, "")}`
		: digitsOnly.replace(/\D/g, "");

	if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
		throw new PhoneVerificationError(
			"Phone number must use international format like +2376XXXXXXXX",
			400,
			ERROR_CODES.phoneInvalid,
		);
	}

	return normalized;
}

function hashVerificationCode(
	userId: string,
	phone: string,
	code: string,
): string {
	return createHash("sha256")
		.update(`${process.env.PAYLOAD_SECRET}:${userId}:${phone}:${code}`)
		.digest("hex");
}

function buildVerificationCode(): string {
	return randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH).toString();
}

function clearVerificationFields() {
	return {
		pendingPhone: null,
		phoneVerificationAttempts: 0,
		phoneVerificationCodeHash: null,
		phoneVerificationExpiresAt: null,
		phoneVerificationLastSentAt: null,
	};
}

function getResendAvailableAt(lastSentAt?: null | string): null | string {
	if (!lastSentAt) {
		return null;
	}

	return new Date(
		new Date(lastSentAt).getTime() + OTP_RESEND_COOLDOWN_MS,
	).toISOString();
}

function getStatus(user: PhoneVerificationUser): PhoneVerificationStatus {
	return {
		expiresAt: user.phoneVerificationExpiresAt || null,
		hasPendingVerification: Boolean(
			user.pendingPhone &&
				user.phoneVerificationCodeHash &&
				user.phoneVerificationExpiresAt,
		),
		isPhoneVerified: Boolean(user.phone && user.phoneVerifiedAt),
		pendingPhone: user.pendingPhone || null,
		phone: user.phone || null,
		phoneVerifiedAt: user.phoneVerifiedAt || null,
		resendAvailableAt: getResendAvailableAt(user.phoneVerificationLastSentAt),
	};
}

async function persistVerificationState(
	payload: Payload,
	user: PhoneVerificationUser,
	data: Partial<PhoneVerificationUser>,
) {
	return (await payload.update({
		collection: "users",
		context: { phoneVerificationFlow: true },
		data,
		id: user.id,
		overrideAccess: true,
	})) as PhoneVerificationUser;
}

export function getPhoneVerificationStatus(user: PhoneVerificationUser) {
	return getStatus(user);
}

export async function startPhoneVerification(
	payload: Payload,
	user: PhoneVerificationUser,
	rawPhone: string,
) {
	const phone = normalizePhoneNumber(rawPhone);
	const now = Date.now();

	if (user.phone === phone && user.phoneVerifiedAt) {
		return getStatus(user);
	}

	if (user.phoneVerificationLastSentAt) {
		const lastSentAt = new Date(user.phoneVerificationLastSentAt).getTime();
		if (
			!Number.isNaN(lastSentAt) &&
			now - lastSentAt < OTP_RESEND_COOLDOWN_MS
		) {
			throw new PhoneVerificationError(
				"Please wait before requesting another code",
				429,
				ERROR_CODES.phoneCooldown,
			);
		}
	}

	const code = buildVerificationCode();
	const expiresAt = new Date(now + OTP_TTL_MS).toISOString();

	await sendSms(payload, {
		from: OTP_MESSAGE_SENDER,
		message: `Your Buy'N'Sellem verification code is ${code}. It expires in 10 minutes.`,
		to: phone,
	});

	const nextUser = await persistVerificationState(payload, user, {
		pendingPhone: phone,
		phoneVerificationAttempts: 0,
		phoneVerificationCodeHash: hashVerificationCode(user.id, phone, code),
		phoneVerificationExpiresAt: expiresAt,
		phoneVerificationLastSentAt: new Date(now).toISOString(),
	});

	return getStatus(nextUser);
}

export async function verifyPhoneVerificationCode(
	payload: Payload,
	user: PhoneVerificationUser,
	rawCode: string,
) {
	const code = rawCode.trim();
	const pendingPhone = user.pendingPhone;

	if (!pendingPhone || !user.phoneVerificationCodeHash) {
		throw new PhoneVerificationError(
			"No phone verification is pending",
			400,
			ERROR_CODES.phoneCodeExpired,
		);
	}

	if (!/^\d{6}$/.test(code)) {
		throw new PhoneVerificationError(
			"Verification code must contain 6 digits",
			400,
			ERROR_CODES.phoneCodeInvalid,
		);
	}

	const attempts = user.phoneVerificationAttempts || 0;
	if (attempts >= MAX_OTP_ATTEMPTS) {
		throw new PhoneVerificationError(
			"Too many invalid attempts. Request a new code",
			429,
			ERROR_CODES.phoneTooManyAttempts,
		);
	}

	if (
		!user.phoneVerificationExpiresAt ||
		new Date(user.phoneVerificationExpiresAt).getTime() < Date.now()
	) {
		await persistVerificationState(payload, user, clearVerificationFields());
		throw new PhoneVerificationError(
			"Verification code has expired. Request a new one",
			400,
			ERROR_CODES.phoneCodeExpired,
		);
	}

	const expectedHash = hashVerificationCode(user.id, pendingPhone, code);
	if (expectedHash !== user.phoneVerificationCodeHash) {
		const nextAttempts = attempts + 1;
		await persistVerificationState(payload, user, {
			phoneVerificationAttempts: nextAttempts,
			...(nextAttempts >= MAX_OTP_ATTEMPTS
				? {
						phoneVerificationCodeHash: null,
						phoneVerificationExpiresAt: null,
					}
				: {}),
		});

		throw new PhoneVerificationError(
			nextAttempts >= MAX_OTP_ATTEMPTS
				? "Too many invalid attempts. Request a new code"
				: "Invalid verification code",
			nextAttempts >= MAX_OTP_ATTEMPTS ? 429 : 400,
			nextAttempts >= MAX_OTP_ATTEMPTS
				? ERROR_CODES.phoneTooManyAttempts
				: ERROR_CODES.phoneCodeInvalid,
		);
	}

	const verifiedAt = new Date().toISOString();
	const nextUser = await persistVerificationState(payload, user, {
		...clearVerificationFields(),
		phone: pendingPhone,
		phoneVerifiedAt: verifiedAt,
	});

	return getStatus(nextUser);
}
