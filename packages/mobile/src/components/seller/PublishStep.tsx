import type { Dispatch, SetStateAction } from "react";
import { View } from "react-native";
import type { ProductFormState } from "@/src/lib/productForm";
import type { ProductStatus } from "@/src/types/api";
import { PublishDeliveryCard } from "./PublishDeliveryCard";
import { PublishStatusCard } from "./PublishStatusCard";
import { PublishSummaryCard } from "./PublishSummaryCard";

export function PublishStep({
	form,
	setForm,
	statuses,
	onEditInfo,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	/** Creation offers active/draft; the editor adds archived ("Masqué"). */
	statuses: ProductStatus[];
	onEditInfo?: () => void;
	readOnly?: boolean;
}) {
	return (
		<View style={{ gap: 14 }}>
			{onEditInfo ? (
				<PublishSummaryCard form={form} onEditInfo={onEditInfo} />
			) : null}
			<PublishStatusCard
				form={form}
				setForm={setForm}
				statuses={statuses}
				readOnly={readOnly}
			/>
			<PublishDeliveryCard form={form} setForm={setForm} readOnly={readOnly} />
		</View>
	);
}
