import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

/**
 * The resist marks of ndop cloth — open lozenges strung on a line, a dot
 * between each — tiled behind the indigo shell. Purely decorative: it sits
 * under the content and never takes touches or the screen reader.
 */
export function NdopPattern({
	color = "#ffffff",
	opacity = 0.05,
}: {
	color?: string;
	opacity?: number;
}) {
	return (
		<View
			style={StyleSheet.absoluteFill}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Svg width="100%" height="100%">
				<Defs>
					<Pattern
						id="ndop"
						width={36}
						height={36}
						patternUnits="userSpaceOnUse"
					>
						<Path
							d="M18 6 L28 18 L18 30 L8 18 Z"
							stroke={color}
							strokeWidth={2}
							fill="none"
						/>
						<Path d="M0 18 H8 M28 18 H36" stroke={color} strokeWidth={2} />
						<Circle cx={18} cy={18} r={2.5} fill={color} />
						<Circle cx={0} cy={0} r={2} fill={color} />
						<Circle cx={36} cy={0} r={2} fill={color} />
						<Circle cx={0} cy={36} r={2} fill={color} />
						<Circle cx={36} cy={36} r={2} fill={color} />
					</Pattern>
				</Defs>
				<Rect width="100%" height="100%" fill="url(#ndop)" opacity={opacity} />
			</Svg>
		</View>
	);
}
