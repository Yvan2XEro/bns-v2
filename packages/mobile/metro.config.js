const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Reanimated 4 ships source files alongside compiled output.
// Force Metro to resolve the compiled lib instead of src/.
config.resolver.resolverMainFields = [
	"react-native",
	"browser",
	"main",
	"module",
];

module.exports = config;
