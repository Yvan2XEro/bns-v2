/** `GET /api/shops/:id/products?sort=` */
export const CATALOGUE_SORTS = ["updated", "title", "price", "stock"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/** `?provenance=`: absent means "own", the catalogue as it was before resale rows. */
export const CATALOGUE_PROVENANCES = ["own", "resale", "any"] as const;
export type CatalogueProvenance = (typeof CATALOGUE_PROVENANCES)[number];
