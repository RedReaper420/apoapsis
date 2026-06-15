import prng from "../utils/prng.js";

export function generate() {
	const syllables = ["aer", "bel", "cor", "dae", "ex", "ga", "hal", "ion", "jar", "kry", "lum", "mar", "nov", "ori", "pyr", "qua", "ras", "sol", "tan", "umi", "val", "xyn", "yor", "zen"];
	const len = prng() > 0.4 ? 2 : 3;
	let name = "";
	for (let i = 0; i < len; i++) {
		name += syllables[Math.floor(prng() * syllables.length)];
	}
	return name.charAt(0).toUpperCase() + name.slice(1);
}
