const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can resolve workspace packages
config.watchFolders = [monorepoRoot];

// Reanimated 4 ships source files alongside compiled output.
// Force Metro to resolve the compiled lib instead of src/.
config.resolver.resolverMainFields = [
	"react-native",
	"browser",
	"main",
	"module",
];

// Look for node_modules in both the project and monorepo root
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
