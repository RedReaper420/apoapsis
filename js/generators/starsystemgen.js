
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as stargen from "./stargen.js";

/**
 * Adds the generated star formation to the system (and to the stars array).
 * @param {types.System} system 
 * @param {types.Star} starFormation - a single or a binary star
 * @param {types.Star} origin - parent formation (simulation origin (null) or other star formation)
 * @param {Array<types.Star>} starsArray - stars array reference
 */
function appendStarFormation(system, starFormation, origin, starsArray) {
	if (origin === null) {
		// Appending the primary star formation to the system's origin
		starFormation.sma = new types.Value(0, types.units.Dist.m);
		system.bodies.push(starFormation);
	}
	else {
		// Appending the secondary star formation to the primary star formation
		starFormation.parentBody = origin;
		starFormation.sma = generateStarSeparation(origin.mass, starFormation.mass, false)
		origin.bodies.push(starFormation);
	}

	starsArray.push(starFormation);
}

/**
 * Get the SMA for binary star system.
 * @param {types.Value} primaryMass <types.units.Mass.X>
 * @param {types.Value} secondaryMass <types.units.Mass.X>
 * @param {boolean} isCloseOrbit - [default true] to make the binary orbit with close distances or not
 * @returns {types.Value} <types.units.Dist.X>
 */
function generateStarSeparation(primaryMass, secondaryMass, isCloseOrbit = true) {
	const totalMass = primaryMass.getValueAs(types.units.Mass.kg) + secondaryMass.getValueAs(types.units.Mass.kg);
	const period_rand = isCloseOrbit === true
		? prng.range(-1.5, 2.0)  // Close orbit: 11.5 days to 100 years period
		: prng.range(2.5, 4.5);  // Wide orbit: 316 years to 31623 years period
	const period = new types.Value(Math.pow(10, period_rand), types.units.Time.y).getValueAs(types.units.Time.s);
	
	const a = Math.pow( (consts.PHY_G * totalMass * period**2) / (4 * Math.PI**2), 1/3 ); // Kepler's 3rd law
	
	return new types.Value(a, types.units.Dist.m);
}

/**
 * Decides to make a binary star formation with a certain probability.
 * 
 * With the default 33.3% chance (@see {@link consts.UI_STAR_BINARY_CHANCE_VAL_DEF}), attempts for making the primary a binary, for adding a companion to the primary, and for making the companion a binary, are resulting in:
 * - 44.4% ✹
 * - 22.2% ✹✷
 * - 14.8% ✹ ··· ✷
 * - 7.41% ✹ ··· ✷✴
 * - 7.41% ✹✷ ··· ✷
 * - 3.70% ✹✷ ··· ✷✴
 * 
 * But actually, there's a bit greater amount of single stars on a wide orbit (@see {@link generateStarFormation}).
 * 
 * @returns {boolean}
 */
export function decideStarBinary(binaryChance) {
	return prng() < binaryChance;
}

/**
 * Generates a star formation (a single or a binary star) and adds it to the system.
 * @param {types.System} system 
 * @param {types.Star} origin - parent formation (simulation origin (null) or other star formation)
 * @param {Array<types.Star>} starsArray - stars array reference
 */
export function generateStarFormation(system, origin = null, starsArray) {
	if (decideStarBinary(system.settings.star_binary_chance) === false) {
		// Single star decided and generated
		const star = stargen.generateStar(system.settings, origin);
		appendStarFormation(system, star, origin, starsArray);
	}
	else {
		// Binary star decided
		let allow_binary = true;
		if (origin !== null) {
			if ((origin.mass.value / 2) < consts.PHY_STAR_MASS_MIN) {
				/*
				Can't generate stars with mass below minimal threshold (that would be brown dwarfs).
				If attempted to generate, the masses will be clamped to 0.08 M☉, resulting with combined binary mass of 0.16 M☉.
				The combined mass can get greater than the constraint's mass. So, to avoid that, making a single star instead.
				*/
				allow_binary = false;
			}
		}

		if (allow_binary) {
			// Binary star generated
			const primary = stargen.generateStar(system.settings, origin);
			const secondary = stargen.generateStar(system.settings, primary);
			const sma = generateStarSeparation(primary.mass, secondary.mass, true);

			const binary = new types.BinaryStar(primary, secondary, sma);
			appendStarFormation(system, binary, origin, starsArray);
		}
		else {
			// Single star generated (since binary is incompatible)
			const star = stargen.generateStar(system.settings, origin, 0.5);
			appendStarFormation(system, star, origin, starsArray);
		}
	}
}
