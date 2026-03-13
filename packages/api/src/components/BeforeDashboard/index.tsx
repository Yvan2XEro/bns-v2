import { Banner } from "@payloadcms/ui/elements/Banner";
import type React from "react";

import { SeedButton } from "./SeedButton";

const BeforeDashboard: React.FC = () => {
	return (
		<div style={{ marginBottom: "1.5rem" }}>
			<Banner type="success">
				<h4 style={{ margin: 0 }}>BNS Admin Dashboard</h4>
			</Banner>
			<ul style={{ listStyle: "decimal", marginTop: "1rem" }}>
				<li>
					<SeedButton />
					{
						" to populate the database with categories, subcategories, attributes, and images."
					}
				</li>
			</ul>
		</div>
	);
};

export default BeforeDashboard;
