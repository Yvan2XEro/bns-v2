import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { BoostPayments } from "./collections/BoostPayments";
import { Categories } from "./collections/Categories";
import { Conversations } from "./collections/Conversations";
import { Favorites } from "./collections/Favorites";
import { Listings } from "./collections/Listings";
import { Media } from "./collections/Media";
import { Messages } from "./collections/Messages";
import { Reports } from "./collections/Reports";
import { Reviews } from "./collections/Reviews";
import { Users } from "./collections/Users";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
	admin: {
		user: Users.slug,
		importMap: {
			baseDir: path.resolve(dirname),
		},
		components: {
			beforeDashboard: ["@/components/BeforeDashboard"],
		},
	},
	collections: [
		Users,
		Media,
		Listings,
		Categories,
		Favorites,
		Conversations,
		Messages,
		Reviews,
		Reports,
		BoostPayments,
	],
	editor: lexicalEditor(),
	secret: process.env.PAYLOAD_SECRET || "default-secret-change-me",
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: mongooseAdapter({
		url: process.env.DATABASE_URI || "",
	}),
	sharp,
	plugins: [],
	cors: ["*", ...(process.env.PAYLOAD_ALLOWED_ORIGINS?.split(",") || [])],
});
