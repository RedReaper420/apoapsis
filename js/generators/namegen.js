import prng from "../utils/prng.js";

export function generate() {
	return "PH_" + prng.int32();
}
