import { describe, expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import fr from "~/../messages/fr.json";
import {
	emptyState,
	emptyVariant,
	type FieldIssue,
	type ProductFormState,
} from "~/lib/product-form";
import { ProductDeliverySection } from "./product-delivery-section";
import { VariantTable } from "./variant-table";

function render(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
			{node}
		</NextIntlClientProvider>,
	);
}

const state: ProductFormState = {
	...emptyState(),
	variants: [{ ...emptyVariant(), price: "1000", sku: "TAKEN" }],
};

const inputNamed = (html: string, name: string) =>
	html.match(
		new RegExp(`<input[^>]*name="${name.replace(/\./g, "\\.")}"[^>]*>`),
	)?.[0] ?? "";

const only =
	(issue: FieldIssue) =>
	(path: string): FieldIssue | null =>
		path === issue.path ? issue : null;

function Table({ issue }: { issue: FieldIssue }) {
	const { control, register, setValue } = useForm<ProductFormState>({
		defaultValues: state,
	});
	return (
		<VariantTable
			control={control}
			register={register}
			setValue={setValue}
			showCost={false}
			issueAt={only(issue)}
		/>
	);
}

function Delivery({ issue }: { issue: FieldIssue }) {
	const { register } = useForm<ProductFormState>({ defaultValues: state });
	return <ProductDeliverySection register={register} issueAt={only(issue)} />;
}

describe("a refused value is highlighted on its own field", () => {
	test("a SKU taken in the shop marks the SKU input and says why", () => {
		const html = render(
			<Table issue={{ path: "variants.0.sku", rule: "taken" }} />,
		);
		expect(inputNamed(html, "variants.0.sku")).toContain('aria-invalid="true"');
		expect(inputNamed(html, "variants.0.price")).toContain(
			'aria-invalid="false"',
		);
		expect(html).toContain(fr.ProductIssues.taken);
		expect(html).toContain("data-field-issue");
	});

	test("handlingHours above the cap is marked under its input", () => {
		const html = render(
			<Delivery
				issue={{ path: "handlingHours", rule: "max", params: { max: 720 } }}
			/>,
		);
		expect(inputNamed(html, "handlingHours")).toContain('aria-invalid="true"');
		expect(inputNamed(html, "warrantyMonths")).toContain(
			'aria-invalid="false"',
		);
		expect(html).toContain("Au plus 720.");
	});
});
