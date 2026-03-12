"use client";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { CategoryAttribute } from "~/types";

interface AttributeFieldsProps {
	attributes: CategoryAttribute[];
	values: Record<string, string>;
	onChange: (slug: string, value: string) => void;
	categoryName?: string;
}

export function AttributeFields({
	attributes,
	values,
	onChange,
	categoryName,
}: AttributeFieldsProps) {
	if (attributes.length === 0) return null;

	return (
		<div className="space-y-4">
			{categoryName && (
				<h3 className="font-semibold text-lg">{categoryName} Details</h3>
			)}
			<div className="grid gap-4 md:grid-cols-2">
				{attributes.map((attr) => (
					<div key={attr.slug} className="space-y-2">
						<Label>
							{attr.name}
							{attr.required && <span className="text-destructive"> *</span>}
						</Label>
						{attr.type === "select" && attr.options ? (
							<Select
								value={values[attr.slug] || ""}
								onValueChange={(v) => onChange(attr.slug, v)}
								required={attr.required ?? undefined}
							>
								<SelectTrigger>
									<SelectValue placeholder={`Select ${attr.name}`} />
								</SelectTrigger>
								<SelectContent>
									{attr.options.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : attr.type === "boolean" ? (
							<Select
								value={values[attr.slug] || ""}
								onValueChange={(v) => onChange(attr.slug, v)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="true">Yes</SelectItem>
									<SelectItem value="false">No</SelectItem>
								</SelectContent>
							</Select>
						) : (
							<Input
								type={attr.type === "number" ? "number" : "text"}
								placeholder={attr.name}
								value={values[attr.slug] || ""}
								onChange={(e) => onChange(attr.slug, e.target.value)}
								required={attr.required ?? undefined}
							/>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
