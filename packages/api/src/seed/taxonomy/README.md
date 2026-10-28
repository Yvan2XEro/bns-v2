# Taxonomy extension

What the category tree gains beyond `seed/seedCategories.ts`: 167 categories
(6 new roots), their attributes, attributes, options and search aliases for
the categories already there, and 16 tags. Applied at boot by the
`taxonomy-extension` task (`services/taxonomyImport.ts`), which only adds:
an existing slug is left as it is, and a second run changes nothing.

## Files

- `categories.json` — new categories, each parent before its children:
  `slug`, `parentSlug`, `name`/`description` in `fr` and `en`,
  `searchAliases`, `icon` (a Lucide name the website maps in
  `web/src/components/category-icon.tsx`), optional `listingForm`, and
  `attributes` (bilingual names, option labels, groups).
  An optional `image` (`url`, `source`, `license`) gives the category its
  picture; only CC0 or public-domain pictures are accepted (tested).
- `existing.json` — what the categories already there gain: `attributes`,
  `optionAdditions` (written like the values they join), `aliases`, and
  `tagCategoryAdditions` (categories added to an existing tag).
- `tags.json` — new tags, with the categories they are offered in.

## Where it comes from

Researched by an AI agent across African (Jiji, Jumia, CoinAfrique,
Glotelho…), classified (Leboncoin, OLX, Avito…) and e-commerce marketplaces
(Amazon, eBay…), then cleaned before import:

- descriptions written in both languages from each category's content;
- attributes a category already inherits from an ancestor removed;
- payment tags removed ("cash on delivery", "Mobile Money accepted",
  "instalments"): the platform's checkout makes those promises, not a tag;
  "delivery in town" folded into the existing "delivery" tag;
- added car brands written like the existing ones ("Geely", not "geely"),
  on `brand` (the agent named it `make`);
- three icons that do not exist in Lucide replaced.

`tests/int/taxonomy-import.int.spec.ts` checks that it all links up with the
seed (parents, depth ≤ 3, both languages, no inherited duplicate, existing
targets) and that the import is complete and idempotent.

## Pictures

None yet: the free (CC0 / public domain) pictures found on Wikimedia Commons
were not fit for a storefront. Adding `image` to a category later is enough:
the task's fingerprint changes, it runs again and gives each category
without a picture the one it now names.
