import { APIError } from "payload";
import { type ErrorCode, fallbackMessage } from "./errors";

/** Business failure raised by a service; routes turn it into `errorResponse`. */
export class ServiceError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number, message?: string) {
		super(message ?? code);
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
