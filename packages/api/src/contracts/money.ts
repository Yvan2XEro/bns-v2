export interface Money {
	amount: number;
	currency: string;
}

export interface MoneyFormat {
	locale: "fr" | "en";
	symbol: string;
	position: "before" | "after";
	groupSeparator: string;
	decimalSeparator: string;
	minorUnit: number;
}

const SPACE_CLASS = /^\s$/;
const GROUPS = /\B(?=(\d{3})+(?!\d))/g;

function render(
	amount: number,
	minorUnit: number,
	groupSeparator: string,
	decimalSeparator: string,
): { sign: string; digits: string } {
	const abs = Math.trunc(Math.abs(amount));
	const base = 10 ** minorUnit;
	const major = String(Math.trunc(abs / base)).replace(GROUPS, groupSeparator);
	const minor =
		minorUnit > 0
			? `${decimalSeparator}${String(abs % base).padStart(minorUnit, "0")}`
			: "";
	return { sign: amount < 0 ? "-" : "", digits: `${major}${minor}` };
}

export function formatMoney(amount: number, format: MoneyFormat): string {
	const { sign, digits } = render(
		amount,
		format.minorUnit,
		format.groupSeparator,
		format.decimalSeparator,
	);
	// The spec's MoneyFormat carries no joiner: a space-class group separator
	// (fr's U+202F) is reused, anything else joins with a plain space.
	const join = SPACE_CLASS.test(format.groupSeparator)
		? format.groupSeparator
		: " ";
	return format.position === "before"
		? `${sign}${format.symbol}${join}${digits}`
		: `${sign}${digits}${join}${format.symbol}`;
}

/** M9: explicit, ugly, never a silent FCFA — "XAF 1 410" (code first, plain-space groups). */
export function formatMoneyFallback(
	amount: number,
	currencyCode: string,
	minorUnit: number,
): string {
	const { sign, digits } = render(amount, minorUnit, " ", ".");
	return `${sign}${currencyCode} ${digits}`;
}
