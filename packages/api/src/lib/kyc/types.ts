export interface KycSession {
	sessionRef: string;
	url: string;
	expiresAt: Date;
}

export interface KycResult {
	status: "pending" | "approved" | "declined" | "review" | "abandoned";
	documentType: "national_id" | "passport" | "residence_permit" | null;
	documentCountry: string | null;
	/** Transient: hashed by the job, then discarded. Never stored. */
	documentNumber: string | null;
	documentExpiresAt: Date | null;
	givenNames: string | null;
	familyName: string | null;
	/** Transient: reduced to `adult`, then discarded. Never stored. */
	dateOfBirth: Date | null;
	livenessPassed: boolean;
	/** 0-100: matches `VerificationRequests.kyc.faceMatchScore`'s declared range. */
	faceMatchScore: number | null;
	/** Allow-listed vendor warning codes only; see each adapter's own filter. */
	warnings: string[];
	reviewUrl: string | null;
}

export interface KycProvider {
	id: "didit" | "smileid";
	createSession(input: {
		reference: string;
		locale: "fr" | "en";
		returnUrl: string;
	}): Promise<KycSession>;
	verifyWebhook(
		rawBody: string,
		headers: Headers,
	): Promise<{
		providerEventId: string;
		type: string;
		sessionRef: string;
	}>;
	fetchResult(sessionRef: string): Promise<KycResult>;
	deleteSessionData(sessionRef: string): Promise<void>;
}
