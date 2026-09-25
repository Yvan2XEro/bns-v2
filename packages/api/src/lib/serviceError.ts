import { APIError } from "payload";
import { type ErrorCode, fallbackMessage } from "./errors";

/**
 * Business failure raised by a service; routes turn it into `errorResponse`.
 *
 * The message defaults to the code's English fallback rather than the raw code,
 * so a stack trace or a log line reads as a sentence. Clients never see it:
 * `errorResponse` builds the body from `code` alone, and the one place a
 * message does reach a client (`CodedAPIError`) uses the same fallback.
 *
 * Services subclass this to keep their own `instanceof` name, which is what the
 * routes match on to decide that a failure is a business one.
 */
export class ServiceError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number, message?: string) {
		super(message ?? fallbackMessage(code));
		this.name = "ServiceError";
		this.code = code;
		this.status = status;
	}
}

/**
 * Same failure raised from a collection hook. Payload serialises `data` into
 * `errors[0].data`, which is where both clients read the code.
 */
export class CodedAPIError extends APIError {
	constructor(code: ErrorCode, status: number) {
		super(fallbackMessage(code), status, { code }, true);
	}
}
