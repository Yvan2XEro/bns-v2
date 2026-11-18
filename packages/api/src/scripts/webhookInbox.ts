import { appendFileSync } from "node:fs";

export interface InboxDelivery {
	rawBody: string;
	headers: Record<string, string>;
	receivedAt: string;
}

export const formatInboxLine = (delivery: InboxDelivery): string =>
	`${JSON.stringify(delivery)}\n`;

export function parseInboxLine(line: string): InboxDelivery {
	const parsed: unknown = JSON.parse(line);
	if (typeof parsed !== "object" || parsed === null)
		throw new Error("inbox line is not an object");
	const { rawBody, headers, receivedAt } = parsed as Record<string, unknown>;
	if (
		typeof rawBody !== "string" ||
		typeof receivedAt !== "string" ||
		typeof headers !== "object" ||
		headers === null
	)
		throw new Error("inbox line is not a delivery");
	return { rawBody, headers: headers as Record<string, string>, receivedAt };
}

export const parseInbox = (contents: string): InboxDelivery[] =>
	contents
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map(parseInboxLine);

/** Lines are appended whole and the body is kept raw: the signature covers its exact bytes. */
function main() {
	const file = process.env.NOTCHPAY_WEBHOOK_INBOX;
	if (!file) throw new Error("set NOTCHPAY_WEBHOOK_INBOX to the inbox file");
	const server = Bun.serve({
		port: Number(process.env.PORT ?? 8787),
		async fetch(request) {
			const rawBody = await request.text();
			appendFileSync(
				file,
				formatInboxLine({
					rawBody,
					headers: Object.fromEntries(request.headers),
					receivedAt: new Date().toISOString(),
				}),
			);
			return new Response("ok");
		},
	});
	console.log(`webhook inbox on :${server.port} -> ${file}`);
}

if (import.meta.main) main();
