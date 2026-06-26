
import prng from "../utils/prng.js";

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
