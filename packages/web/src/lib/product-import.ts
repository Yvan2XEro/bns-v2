import type { Category, ProductInput } from "~/types";
import { parseAmount } from "./product-form";

export const IMPORT_MAX_ROWS = 200;

/** Header aliases, lower-cased and without accents: French first, as the template writes them. */
const COLUMNS = {
	title: ["titre", "title", "nom", "name"],
	category: ["categorie", "category"],
	price: ["prix", "price"],
	sku: ["sku", "reference"],
	stock: ["stock", "quantite", "quantity"],
	cost: ["cout", "cost", "cout unitaire"],
	condition: ["etat", "condition"],
	description: ["description"],
} as const;
type Column = keyof typeof COLUMNS;

const CONDITIONS: Record<string, NonNullable<ProductInput["condition"]>> = {
	new: "new",
	neuf: "new",
	like_new: "like_new",
	"comme neuf": "like_new",
	good: "good",
	bon: "good",
	"bon etat": "good",
	fair: "fair",
	correct: "fair",
	poor: "poor",
	use: "poor",
};

export const IMPORT_TEMPLATE =
	"titre;categorie;prix;sku;stock;cout;etat;description\n";

/** An error is a message key under `CatalogueStock.import.errors`. */
export interface ImportRow {
	line: number;
	title: string;
	input: ProductInput | null;
	errors: string[];
}

export interface ImportParse {
	rows: ImportRow[];
	/** File-level problems, as message keys. */
	fileErrors: string[];
}

const fold = (value: string) =>
	value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** RFC 4180 with the separator Excel picked: `;` in French locales, `,` elsewhere. */
export function parseCsv(text: string): string[][] {
	const source = text.replace(/^﻿/, "");
	const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
	const separator =
		(firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
			? ";"
			: ",";
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (quoted) {
			if (char === '"' && source[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (char === '"') {
				quoted = false;
			} else {
				cell += char;
			}
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === separator) {
			row.push(cell);
			cell = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[i + 1] === "\n") i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += char;
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function resolveCategory(value: string, categories: Category[]): string | null {
	const wanted = fold(value);
	if (!wanted) return null;
	const leafName = fold(value.split(/[›>/]/).pop() ?? value);
	const match =
		categories.find((c) => c.id === value.trim()) ??
		categories.find((c) => fold(c.slug ?? "") === wanted) ??
		categories.find((c) => fold(c.name) === wanted) ??
		categories.find((c) => fold(c.name) === leafName);
	return match ? match.id : null;
}

/**
 * Turns a file into one draft product per line, each with a single variant.
 * Nothing here is trusted by the server: every row still goes through the
 * product-create route and its own validation, so this only spares the
 * seller a round trip for the mistakes visible in the file itself.
 */
export function parseProductImport(
	text: string,
	categories: Category[],
	options: { includeCost: boolean },
): ImportParse {
	const [header, ...lines] = parseCsv(text);
	if (!header) return { rows: [], fileErrors: ["empty"] };

	const index = {} as Record<Column, number>;
	const folded = header.map(fold);
	for (const column of Object.keys(COLUMNS) as Column[]) {
		index[column] = folded.findIndex((name) =>
			(COLUMNS[column] as readonly string[]).includes(name),
		);
	}
	const fileErrors: string[] = [];
	if (index.title < 0 || index.category < 0 || index.price < 0) {
		fileErrors.push("missingColumns");
	}
	if (lines.length === 0) fileErrors.push("empty");
	if (lines.length > IMPORT_MAX_ROWS) fileErrors.push("tooManyRows");
	if (fileErrors.length > 0) return { rows: [], fileErrors };

	const seenSkus = new Set<string>();
	const rows = lines.map((cells, position): ImportRow => {
		const cell = (column: Column) =>
			index[column] >= 0 ? (cells[index[column]] ?? "").trim() : "";
		const errors: string[] = [];

		const title = cell("title");
		if (title.length < 3 || title.length > 120) errors.push("title");

		const categoryValue = cell("category");
		const category = resolveCategory(categoryValue, categories);
		if (!category) errors.push("category");

		const price = parseAmount(cell("price"));
		if (price === null || price <= 0) errors.push("price");

		const stockText = cell("stock");
		const stock = stockText === "" ? 0 : parseAmount(stockText);
		if (stock === null) errors.push("stock");

		const costText = cell("cost");
		const cost = costText === "" ? null : parseAmount(costText);
		if (costText !== "" && cost === null) errors.push("cost");

		const conditionText = fold(cell("condition"));
		const condition = conditionText ? CONDITIONS[conditionText] : undefined;
		if (conditionText && !condition) errors.push("condition");

		const sku = cell("sku");
		if (sku.length > 60) errors.push("sku");
		else if (sku) {
			const key = sku.toLowerCase();
			if (seenSkus.has(key)) errors.push("duplicateSku");
			seenSkus.add(key);
		}

		const description = cell("description");
		if (description.length > 5000) errors.push("description");

		const input: ProductInput | null =
			errors.length === 0 && category && price !== null && stock !== null
				? {
						title,
						category,
						description: description || null,
						...(condition ? { condition } : {}),
						status: "draft",
						options: [],
						variants: [
							{
								optionValues: {},
								sku: sku || null,
								price,
								trackInventory: true,
								initialStock: stock,
								...(options.includeCost && cost !== null ? { cost } : {}),
							},
						],
					}
				: null;
		return { line: position + 2, title, input, errors };
	});
	return { rows, fileErrors };
}
