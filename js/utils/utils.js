
import prng from "../utils/prng.js";
import * as T from "../data/types.js";

/**
 * Returns a value within a range of values between a defined minimum bound and a maximum bound.
 * @param {number} value 
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

/**
 * Generate a random number following a normal (Gaussian) distribution.
 * @param {number} mean - *[default: 0]* mean value.
 * @param {number} stdev - *[default: 1]* standard deviation (width of scatter).
 * @returns {number}
 */
export function gaussianRandom(mean = 0, stdev = 1) {
	// Box-Muller transform
	let u = 0, v = 0;
	while (u === 0) u = prng(); // avoiding zero
	while (v === 0) v = prng();

	const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
	return z * stdev + mean;
}

/**
 * Get a random normally distributed number within the specified range.
 * 
 * Uses Box-Muller + clamping to approximate normal distribution in range.
 * 
 * @param {number} min - *[default 0]* minimal range value
 * @param {number} max - *[default 1]* maximal range value
 * @returns {number} [min, max], exp. value (mean) = (min + max) / 2
 */
export function randomRangeGaussian(min = 0, max = 1) {
    const gaussian = gaussianRandom(3, 1); // mean = 3, stdev = 1 -> ~99.73% of values are in [0, 6] range
    const clamped = clamp(gaussian, 0, 6); // truncating the rest of ~0.27% values
    const normalized = clamped / 6; // normalizing to [0, 1]

    return min + (max - min) * normalized;
}

/**
 * Generates a seed string from the current time moment, the CPU performance metric, and a random value.
 * 
 * @returns {string}
 */
export function generateFallbackSeed() {
	const time = Date.now();
	const perf = performance.now();
	const random = Math.random() * 1000000;

	return `${time}-${perf}-${random}`;
}

export function parseColor(colorStr) {
	if (colorStr.startsWith('#')) {
		let hex = colorStr.slice(1); // Removing # character

		if (hex.length === 3) {
			hex = hex.split('').map(c => c + c).join(''); // Reformatting #rgb to #rrggbb
		}

		if (hex.length === 6) hex += 'ff'; // If the color is w/o alpha, adding it

		const num = parseInt(hex.slice(0, 8), 16);
		return {
			r: (num >> 24) & 255,
			g: (num >> 16) & 255,
			b: (num >> 8) & 255,
			a: num & 255
		};
	}

	return { r: 255, g: 255, b: 255, a: 255 };
}

/**
 * 
 * @param {T.Value} value 
 * @param {string} unitStd 
 * @param {string[]} allowedUnits 
 * @param {number} threshold 
 */
export function getFittingValue(value, unitStd, allowedUnits, threshold = 0.1) {
	const inputStd = value.as(unitStd);
	const comparationUnit = new T.Value(threshold, unitStd);

	let lastUnit = allowedUnits[0];
	for (const iterUnit of allowedUnits) {
		comparationUnit.unit = iterUnit;

		if (inputStd > comparationUnit.as(unitStd)) {
			lastUnit = iterUnit;
		}
		else {
			comparationUnit.unit = lastUnit;
			break;
		}
	}

	const fittingUnit = comparationUnit.unit;
	const fittingUnitName = T.unitNames.get(fittingUnit);
	const convertedValue = new T.Value(inputStd, unitStd).as(fittingUnit);

	return { value: convertedValue, unit: fittingUnitName };
}

export function radToDeg(rad){
	return rad * (180.0 / Math.PI);
}
