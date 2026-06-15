
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as stargen from "./stargen.js";

/**
 * Adds the generated star formation to the system (and to the stars array).
 * 
 * @param {types.System} system - The core system instance containing global settings.
 * @param {types.Star|types.BinaryStar} starFormation - The single star or binary pair being appended.
 * @param {types.Star|types.BinaryStar|null} parentFormation - The parent gravitational center, or null if it's the system's origin.
 * @param {Array<types.Star|types.BinaryStar>} starsArray - Reference to the list tracking all stars.
 */
function appendStarFormation(system, starFormation, parentFormation, starsArray) {
	if (parentFormation === null) {
		// Appending the primary star formation to the system's origin
		starFormation.sma = new types.Value(0, types.units.Dist.m);
		system.bodies.push(starFormation);
	}
	else {
		// Appending the secondary star formation to the primary star formation
		starFormation.parentBody = parentFormation;
		starFormation.sma = generateStarSeparation(parentFormation.mass, starFormation.mass, false)
		parentFormation.bodies.push(starFormation);
	}

	starsArray.push(starFormation);
}

/**
 * Calculates the Semi-Major Axis (SMA) for a binary star system using Kepler's Third Law.
 * 
 * @param {types.Value} primaryMass	  - Mass of the primary component (unit: types.units.Mass)
 * @param {types.Value} secondaryMass - Mass of the secondary component (unit: types.units.Mass)
 * @param {boolean} isCloseOrbit	  - [default: true] If true, samples tight short-period orbits; otherwise samples wide orbits.
 * 
 * @returns {types.Value} Semi-major axis distance value (unit: types.units.Dist)
 */
function generateStarSeparation(primaryMass, secondaryMass, isCloseOrbit = true) {
	const totalMassKg = primaryMass.getValueAs(types.units.Mass.kg) + secondaryMass.getValueAs(types.units.Mass.kg);

	// Sampling orbital period log-distribution based on binary separation type
	const logPeriodYears = isCloseOrbit === true
		? prng.range(-1.5, 2.0)  // Close orbit: ~11.5 days to 100 years period
		: prng.range(2.5, 4.5);  // Wide orbit: ~316 years to 31623 years period
	
	const periodSeconds = new types.Value(Math.pow(10, logPeriodYears), types.units.Time.y).getValueAs(types.units.Time.s);
	
	// Kepler's 3rd law: a³ = (G * M * P²) / (4 * π²)
	const smaMeters = Math.pow( (consts.PHY_G * totalMassKg * periodSeconds**2) / (4 * Math.PI**2), 1/3 );
	
	return new types.Value(smaMeters, types.units.Dist.m);
}

/**
 * Determines whether a star system should form as a binary configuration.
 * 
 * Under default 33.3% chance settings ({@link consts.UI_STAR_BINARY_CHANCE_VAL_DEF}), recursive nesting calculations approximate the following structural outcomes:
 * - 44.44% Single Star				  [ ✹ ]
 * - 22.22% Close Binary			  [ ✹✷ ]
 * - 14.81% Wide Binary				  [ ✹ ··· ✷ ]
 * -  7.41% Wide Triple System (1)	  [ ✹ ··· ✷✴ ]
 * -  7.41% Wide Triple System (2)	  [ ✹✷ ··· ✷ ]
 * -  3.70% Complex Quadruple System  [ ✹✷ ··· ✷✴ ]
 * 
 * Note: there's actually a bit greater amount of single stars on a wide orbit (@see {@link generateStarFormation}).
 * 
 * @param {number} binaryChance - Probability factor between 0.0 and 1.0
 * 
 * @returns {boolean} True if binary architecture is selected
 */
export function decideStarBinary(binaryChance) {
	return prng() < binaryChance;
}

/**
 * Generates a complete stellar subsystem (single or binary star) and injects it into the system environment.
 * 
 * @param {types.System} system	- The core system instance (containing configuration rules).
 * @param {types.Star|types.BinaryStar|null} parentFormation - Parent hierarchical component, or null if generating system baseline.
 * @param {Array<types.Star|types.BinaryStar>} starsArray - Target array reference accumulating system components.
 */
export function generateStarFormation(system, parentFormation = null, starsArray) {
	if (decideStarBinary(system.settings.star_binary_chance) === false) {
		// Single star decided and generated
		const star = stargen.generateStar(system.settings, parentFormation);
		appendStarFormation(system, star, parentFormation, starsArray);
	}
	else {
		// Binary star decided
		let isBinaryAllowed = true;
		if (parentFormation !== null) {
			if ((parentFormation.mass.value / 2) < consts.PHY_STAR_MASS_MIN) {
				/*
				Structural Guardrails: Prevent splitting mass below the stellar thermonuclear threshold (0.08 M☉).
				If split, clamping would artificially create mass out of nowhere, exceeding parent constraint budget.
				Fallback: Generate a single star with adjusted mass scaling parameters to honor the constraint budget.
				*/
				isBinaryAllowed = false;
			}
		}

		if (isBinaryAllowed) {
			// Binary star generated
			const primary = stargen.generateStar(system.settings, parentFormation);
			const secondary = stargen.generateStar(system.settings, primary);
			const sma = generateStarSeparation(primary.mass, secondary.mass, true);

			const binary = new types.BinaryStar(primary, secondary, sma);
			appendStarFormation(system, binary, parentFormation, starsArray);
		}
		else {
			// Single star generated (fallback)
			const SINGLE_FALLBACK_MASS_MULTIPLIER = 0.5;
			const star = stargen.generateStar(system.settings, parentFormation, SINGLE_FALLBACK_MASS_MULTIPLIER);
			appendStarFormation(system, star, parentFormation, starsArray);
		}
	}
}
