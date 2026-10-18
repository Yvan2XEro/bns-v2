// Visitor traffic against a deployed stack, to watch the autoscaler react.
//   k6 run -e DOMAIN=buynsellem.lan loadtest/traffic.js
//   k6 run -e DOMAIN=buynsellem.lan -e PEAK=300 loadtest/traffic.js
// Each virtual user opens the home page, searches, and loads the app config
// the clients fetch first, with a pause between steps like a person would.
import { check, group, sleep } from "k6";
import http from "k6/http";

const domain = __ENV.DOMAIN || "buynsellem.lan";
const web = `https://${domain}`;
const api = `https://api.${domain}`;
const peak = Number(__ENV.PEAK || 150);
const queries = [
	"iphone",
	"voiture",
	"chaussures",
	"frigo",
	"ordinateur",
	"robe",
];

export const options = {
	// A private domain's certificate is signed by the cluster's own CA.
	insecureSkipTLSVerify: true,
	stages: [
		{ duration: "1m", target: Math.round(peak / 3) }, // warm-up
		{ duration: "3m", target: peak }, // climb: the HPA should add pods
		{ duration: "4m", target: peak }, // hold
		{ duration: "2m", target: 0 }, // fall: pods go after five calm minutes
	],
	thresholds: {
		http_req_failed: ["rate<0.01"],
		http_req_duration: ["p(95)<1500"],
	},
};

export default function () {
	group("home", () => {
		const res = http.get(`${web}/`, { tags: { page: "home" } });
		check(res, { "home 200": (r) => r.status === 200 });
	});
	sleep(1 + Math.random() * 2);

	group("search", () => {
		const q = queries[Math.floor(Math.random() * queries.length)];
		const res = http.get(`${api}/api/public/search?q=${q}&limit=20`, {
			tags: { page: "search" },
		});
		check(res, { "search 200": (r) => r.status === 200 });
	});
	sleep(1 + Math.random() * 2);

	group("config", () => {
		const res = http.get(`${api}/api/public/config`, {
			tags: { page: "config" },
		});
		check(res, { "config 200": (r) => r.status === 200 });
	});
	sleep(1);
}
