
import prng from "../utils/prng.js";
import * as types from "../data/types.js";

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
 * @param {number} mean - [default 0] mean value.
 * @param {number} stdev - [default 1] standard deviation (width of scatter).
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
 * @param {number} min - [default 0] minimal range value
 * @param {number} max - [default 1] maximal range value
 * @returns {number} [min, max], mean = (min + max) / 2
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
		let hex = colorStr.slice(1);
		if (hex.length === 3) {
			hex = hex.split('').map(c => c + c).join('');
		}
		const num = parseInt(hex.slice(0, 6), 16);
		return {
			r: (num >> 16) & 255,
			g: (num >> 8) & 255,
			b: num & 255
		};
	}

	return { r: 255, g: 255, b: 255 };
}

/**
 * 
 * @param {types.Value} value 
 * @param {string} unitStd 
 * @param {array[string]} allowedUnits 
 * @param {number} threshold 
 */
export function getFittingValue(value, unitStd, allowedUnits, threshold = 0.1) {
	const inputStd = value.getValueAs(unitStd);
	const comparationUnit = new types.Value(threshold, unitStd);

	let lastUnit = allowedUnits[0];
	for (const iterUnit of allowedUnits) {
		comparationUnit.unit = iterUnit;

		if (inputStd > comparationUnit.getValueAs(unitStd)) {
			lastUnit = iterUnit;
		}
		else {
			comparationUnit.unit = lastUnit;
			break;
		}
	}

	const fittingUnit = comparationUnit.unit;
	const fittingUnitName = types.unitNames.get(fittingUnit);
	const convertedValue = new types.Value(inputStd, unitStd).getValueAs(fittingUnit);

	return { value: convertedValue, unit: fittingUnitName };
}

export function radToDeg(rad){
	return rad * (180.0 / Math.PI);
}
