import { z } from "zod";
import { ERROR_CODES } from "@/src/lib/apiError";

export const phoneSchema = z.object({
	phone: z.string().trim().min(8).max(20),
});
export type PhoneFormValues = z.infer<typeof phoneSchema>;

export const codeSchema = z.object({
	code: z.string().regex(/^\d{6}$/),
});
export type CodeFormValues = z.infer<typeof codeSchema>;

export const CODE_ERROR_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.phoneCodeInvalid,
	ERROR_CODES.phoneCodeExpired,
	ERROR_CODES.phoneTooManyAttempts,
]);
