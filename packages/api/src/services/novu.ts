import { Novu } from "@novu/node";

let novu: Novu | null = null;

export function getNovu(): Novu {
	if (novu) return novu;

	const secretKey = process.env.NOVU_SECRET_KEY;
	if (!secretKey) {
		throw new Error("NOVU_SECRET_KEY environment variable is not set");
	}

	novu = new Novu(secretKey);
	return novu;
}
