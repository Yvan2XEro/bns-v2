import bwipjs from "bwip-js/node";
import type { Payload } from "payload";
import QRCode from "qrcode";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { getPurchaseOrderView } from "./purchaseOrders";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

type SlipLanguage = "fr" | "en";

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return entities[character] ?? character;
	});
}

function formatXaf(amount: number): string {
	const formatted = new Intl.NumberFormat("fr-FR", {
		maximumFractionDigits: 0,
	}).format(amount);
	return `${formatted.replace(/[\u00a0\u202f]/g, " ")} XAF`;
}

function assetUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const base = process.env.PAYLOAD_PUBLIC_SERVER_URL;
		const url = base ? new URL(value, base) : new URL(value);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function copy(language: SlipLanguage) {
	return language === "fr"
		? {
				label: "Étiquette de livraison",
				slip: "Bon de préparation",
				order: "Commande fournisseur",
				to: "Destinataire",
				phone: "Téléphone",
				district: "Quartier",
				landmark: "Repère",
				items: "Articles",
				quantity: "Qté",
				collect: "À encaisser à la livraison",
				paid: "Payé en ligne",
				shippedFrom: "Expédié depuis",
				seller: "Vendu par",
				reseller: "Revendeur",
				instructions: "Instructions de livraison",
				noGps: "Position GPS non renseignée",
			}
		: {
				label: "Shipping label",
				slip: "Packing slip",
				order: "Supplier order",
				to: "Recipient",
				phone: "Phone",
				district: "District",
				landmark: "Landmark",
				items: "Items",
				quantity: "Qty",
				collect: "Collect on delivery",
				paid: "Paid online",
				shippedFrom: "Shipped from",
				seller: "Sold by",
				reseller: "Reseller",
				instructions: "Delivery instructions",
				noGps: "GPS location not provided",
			};
}

export async function getPurchaseOrderPackingSlipHtml(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	language: SlipLanguage,
): Promise<string> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const supplierShopId = purchaseOrder
		? relationId(purchaseOrder.supplierShop)
		: null;
	if (!supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const { shop: supplier } = await requireShopPermission(
		payload,
		user,
		supplierShopId,
		"orders.process",
	);
	const view = await getPurchaseOrderView(payload, user, purchaseOrderId);
	const logoId = relationId(view.branding.logo);
	const logo = logoId
		? await payload
				.findByID({
					collection: "media",
					id: logoId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	const logoSrc = assetUrl(logo?.url);
	const text = copy(language);
	const point = view.delivery.gps;
	const mapUrl = point
		? `https://maps.google.com/?q=${point.lat},${point.lng}`
		: null;
	const qrSvg = mapUrl
		? await QRCode.toString(mapUrl, {
				type: "svg",
				errorCorrectionLevel: "M",
				margin: 1,
			})
		: "";
	const barcodeSvg = bwipjs.toSVG({
		bcid: "code128",
		text: view.number,
		scale: 2,
		height: 10,
		includetext: true,
		textxalign: "center",
	});
	const resellerName = escapeHtml(view.branding.name);
	const supplierName = escapeHtml(supplier.name);
	const orderNumber = escapeHtml(view.number);
	const recipientName = escapeHtml(view.delivery.recipientName);
	const phone = escapeHtml(view.delivery.phone);
	const city = escapeHtml(supplier.location?.city ?? "");
	const district = escapeHtml(view.delivery.district ?? "");
	const landmark = escapeHtml(view.delivery.landmark ?? "");
	const instructions = escapeHtml(view.delivery.instructions ?? "");
	const items = view.items
		.map(
			(item) =>
				`<tr><td>${escapeHtml(item.title)}${item.variantLabel ? ` <small>${escapeHtml(item.variantLabel)}</small>` : ""}</td><td>${escapeHtml(item.sku ?? "—")}</td><td>${item.quantity}</td></tr>`,
		)
		.join("");
	const sender = `${logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="">` : ""}<strong>${resellerName}</strong>${view.branding.phone ? `<span>${escapeHtml(view.branding.phone)}</span>` : ""}`;
	const gpsBlock = qrSvg
		? `<div class="qr" data-gps="${point?.lat},${point?.lng}">${qrSvg}<span>${escapeHtml(text.landmark)}</span></div>`
		: `<p class="muted">${escapeHtml(text.noGps)}</p>`;
	const collect =
		view.paymentMethod === "cod"
			? `<strong>${formatXaf(view.collectAmount)}</strong>`
			: `<strong>${escapeHtml(text.paid)}</strong>`;

	return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${orderNumber} · ${escapeHtml(text.slip)}</title><style>
@page label { size: 105mm 148mm; margin: 6mm; }
@page slip { size: 148mm 210mm; margin: 10mm; }
* { box-sizing: border-box; } body { margin: 0; color: #17252b; font: 12px/1.4 Arial, sans-serif; }
.page { break-after: page; page-break-after: always; } .label { page: label; } .slip { page: slip; }
.brand { display:flex; align-items:center; gap:8px; border-bottom:1px solid #ccd5d8; padding-bottom:8px; }
.brand span { display:block; color:#526268; } .logo { max-width:42px; max-height:42px; object-fit:contain; }
h1 { font-size:20px; margin:12px 0 4px; } h2 { font-size:14px; margin:14px 0 6px; }
.number { font-size:16px; font-weight:bold; letter-spacing:.04em; } .address { margin:12px 0; }
.address strong { display:block; font-size:16px; } .muted, small { color:#526268; }
.qr { width:90px; margin:8px auto; text-align:center; } .qr svg { width:80px; height:80px; }
table { width:100%; border-collapse:collapse; margin-top:8px; } th,td { text-align:left; padding:6px 4px; border-bottom:1px solid #dfe5e7; }
.total { margin-top:14px; padding:12px; background:#eef3f1; font-size:16px; display:flex; justify-content:space-between; }
.codes { margin:14px 0; } .codes svg { max-width:100%; height:auto; } .legal { border-top:1px solid #ccd5d8; margin-top:18px; padding-top:8px; }
@media screen { body { background:#dce3e4; } .page { background:#fff; margin:18px auto; padding:10mm; box-shadow:0 2px 14px #17252b22; } .label { width:105mm; min-height:148mm; } .slip { width:148mm; min-height:210mm; } }
@media print { .page { margin:0; box-shadow:none; } }
</style></head><body>
<section class="page label"><div class="brand">${sender}</div><h1>${escapeHtml(text.label)}</h1><div class="number">${orderNumber}</div><div class="address"><strong>${recipientName}</strong><span>${phone}</span><p>${district}${district && city ? ", " : ""}${city}</p><p>${landmark}</p></div>${gpsBlock}<p>${escapeHtml(text.shippedFrom)} ${city}</p><div class="codes" data-barcode="code128">${barcodeSvg}</div></section>
<section class="page slip"><div class="brand">${sender}</div><h1>${escapeHtml(text.slip)} · ${orderNumber}</h1><p>${escapeHtml(text.seller)} <strong>${supplierName}</strong> · ${escapeHtml(text.reseller)} <strong>${resellerName}</strong></p><p>${escapeHtml(text.shippedFrom)} <strong>${city}</strong></p><h2>${escapeHtml(text.to)}</h2><p><strong>${recipientName}</strong> · ${phone}</p><p>${district}${district && city ? ", " : ""}${city}${landmark ? ` · ${landmark}` : ""}</p>${instructions ? `<p><strong>${escapeHtml(text.instructions)}:</strong> ${instructions}</p>` : ""}<h2>${escapeHtml(text.items)}</h2><table><thead><tr><th>${escapeHtml(text.items)}</th><th>SKU</th><th>${escapeHtml(text.quantity)}</th></tr></thead><tbody>${items}</tbody></table><div class="total"><span>${escapeHtml(text.collect)}</span>${collect}</div><div class="legal"><p>${escapeHtml(text.seller)} ${supplierName}; ${escapeHtml(text.reseller)} ${resellerName}.</p></div><div class="codes">${barcodeSvg}</div></section></body></html>`;
}
