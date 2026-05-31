
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
 * @param {number} mean - mean value (usually 0).
 * @param {number} stdev - standard deviation (width of scatter).
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
