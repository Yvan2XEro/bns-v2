"use client";

import { useTranslations } from "next-intl";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	type AttributeIssue,
	type CategoryAttributeSpec,
	groupCategoryAttributes,
	validateAttributeValue,
} from "~/lib/category-form";
import { asFallbackTranslator, translateOr } from "~/lib/translate-or";

/**
 * Renders the category-supplied attributes of a listing form.
 *
 * Every attribute type in the contract is handled: `text` and `number` as
 * inputs, `select` as a dropdown over the supplied options, `boolean` as a
 * yes/no dropdown, and `date` as a native date input. Attribute names, option
 * labels, units and group headings are category-authored data and are rendered
 * verbatim; every string the component itself contributes goes through
 * next-intl.
 *
 * Lives under `lib/` rather than `components/listing/` because the existing
 * scope; it is a plain client component and can be moved later.
 */
interface CategoryAttributeFieldsProps {
	attributes: CategoryAttributeSpec[];
	values: Record<string, string>;
	onChange: (slug: string, value: string) => void;
	/**
	 * Reveal "this field is required" messages. Format errors (min/max/not a
	 * number) always show, since they mean the user typed something invalid.
	 */
	showRequiredErrors?: boolean;
}

export function CategoryAttributeFields({
	attributes,
	values,
	onChange,
	showRequiredErrors = false,
}: CategoryAttributeFieldsProps) {
	const t = asFallbackTranslator(useTranslations("Listing"));

	if (attributes.length === 0) return null;

	const groups = groupCategoryAttributes(attributes);

	function issueMessage(issue: AttributeIssue): string | null {
		switch (issue.kind) {
			case "required":
				return showRequiredErrors
					? translateOr(t, "attributeRequired", "Ce champ est obligatoire.")
					: null;
			case "notANumber":
				return translateOr(
					t,
					"attributeInvalidNumber",
					"Saisissez un nombre valide.",
				);
			case "min":
				return translateOr(t, "attributeMin", "Minimum : {min}.", {
					min: issue.limit,
				});
			case "max":
				return translateOr(t, "attributeMax", "Maximum : {max}.", {
					max: issue.limit,
				});
			default:
				return null;
		}
	}

	function renderField(attribute: CategoryAttributeSpec) {
		const value = values[attribute.slug] ?? "";
		const issue = validateAttributeValue(attribute, value);
		const message = issue ? issueMessage(issue) : null;
		const errorId = message ? `attr-${attribute.slug}-error` : undefined;
		const placeholder = translateOr(
			t,
			"selectAttribute",
			"Sélectionner : {name}",
			{ name: attribute.name },
		);

		let control: React.ReactNode;

		if (attribute.type === "select") {
			control = (
				<Select
					value={value}
					onValueChange={(next) => onChange(attribute.slug, next)}
				>
					<SelectTrigger
						id={`attr-${attribute.slug}`}
						aria-describedby={errorId}
					>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						{attribute.options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		} else if (attribute.type === "boolean") {
			control = (
				<Select
					value={value}
					onValueChange={(next) => onChange(attribute.slug, next)}
				>
					<SelectTrigger
						id={`attr-${attribute.slug}`}
						aria-describedby={errorId}
					>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="true">{t("yes")}</SelectItem>
						<SelectItem value="false">{t("no")}</SelectItem>
					</SelectContent>
				</Select>
			);
		} else {
			const inputType =
				attribute.type === "number"
					? "number"
					: attribute.type === "date"
						? "date"
						: "text";
			// `unit` is a display suffix only: the value stays exactly what the
			// user typed, and min/max are surfaced as a message rather than
			// silently clamping the input.
			const showUnit = Boolean(attribute.unit) && attribute.type !== "date";
			control = (
				<div className="relative">
					<Input
						id={`attr-${attribute.slug}`}
						type={inputType}
						className={showUnit ? "pr-12" : undefined}
						placeholder={attribute.type === "date" ? undefined : attribute.name}
						value={value}
						min={attribute.min}
						max={attribute.max}
						aria-invalid={message ? true : undefined}
						aria-describedby={errorId}
						onChange={(e) => onChange(attribute.slug, e.target.value)}
					/>
					{showUnit && (
						<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm">
							{attribute.unit}
						</span>
					)}
				</div>
			);
		}

		return (
			<div key={attribute.slug} className="space-y-2">
				<Label htmlFor={`attr-${attribute.slug}`}>
					{attribute.name}
					{attribute.required && <span className="text-destructive"> *</span>}
				</Label>
				{control}
				{message && (
					<p id={errorId} className="text-destructive text-xs">
						{message}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{groups.map((group) => (
				<div key={group.group ?? "__ungrouped__"} className="space-y-3">
					{group.group && (
						<h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							{group.group}
						</h4>
					)}
					<div className="grid gap-4 md:grid-cols-2">
						{group.attributes.map(renderField)}
					</div>
				</div>
			))}
		</div>
	);
}
