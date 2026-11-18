/**
 * HTML for printable documents, written as tagged templates that escape
 * every interpolated value — a shop or a product is free to name itself
 * `<script>`. A nested fragment (`html\`…\``) or a list of them goes in as
 * markup; anything else as text.
 */

const SAFE = Symbol("safe-html");

export interface SafeHtml {
	readonly [SAFE]: true;
	readonly value: string;
}

const safe = (value: string): SafeHtml => ({ [SAFE]: true, value });

function isSafe(value: unknown): value is SafeHtml {
	return typeof value === "object" && value !== null && SAFE in value;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

type Interpolation =
	| SafeHtml
	| string
	| number
	| null
	| undefined
	| false
	| readonly Interpolation[];

function render(value: Interpolation): string {
	if (value === null || value === undefined || value === false) return "";
	if (Array.isArray(value)) return value.map(render).join("");
	if (isSafe(value)) return value.value;
	return escapeHtml(String(value));
}

export function html(
	strings: TemplateStringsArray,
	...values: Interpolation[]
): SafeHtml {
	let out = strings[0] ?? "";
	values.forEach((value, index) => {
		out += render(value) + (strings[index + 1] ?? "");
	});
	return safe(out);
}

/** Markup the caller vouches for: the document's own CSS and script. */
export function trusted(markup: string): SafeHtml {
	return safe(markup);
}
