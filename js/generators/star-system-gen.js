
import prng from "../utils/prng.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

import * as starGen from "./star-gen.js";

/**
 * Generates a stellar system (single or binary star) and injects it into the system environment.
 * 
 * @param {T.System} system	- The core system instance (containing configuration rules).
 * @param {T.Star|T.BinaryStar|null} parentFormation - Parent hierarchical component, or null if generating system baseline.
 * @param {Array<T.Star|T.BinaryStar>} starsArray - Target array reference accumulating system components.
 */
export function generateStarFormation(system, parentFormation = null, starsArray) {
	if (decideStarBinary(system.settings.star_binary_chance) === false) {
		// Single star decided and generated.
		const star = starGen.generateStar(system.settings, parentFormation);
		appendStarFormation(system, star, parentFormation, starsArray);
	}
	else {
		// Binary star decided.
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
			// Binary star generated.
			const primary = starGen.generateStar(system.settings, parentFormation);
			const secondary = starGen.generateStar(system.settings, primary);
			const sma = generateStarSeparation(primary.mass, secondary.mass, true);

			const binary = new T.BinaryStar(primary, secondary, sma);
			appendStarFormation(system, binary, parentFormation, starsArray);
		}
		else {
			// Single star generated (fallback).
			const SINGLE_FALLBACK_MASS_MULTIPLIER = 0.5;
			const star = starGen.generateStar(system.settings, parentFormation, SINGLE_FALLBACK_MASS_MULTIPLIER);
			appendStarFormation(system, star, parentFormation, starsArray);
		}
	}
}

/**
 * Determines whether a star system should form as a binary configuration.
 * 
 * Under the default 33.3% chance setting ({@link consts.UI_STAR_BINARY_CHANCE_VAL_DEF}), generations with two subsequent function calls will result in:
 * - 44.44% Single star				  [ ✹ ]
 * - 22.22% Close binary			  [ ✹✷ ]
 * - 14.81% Wide binary				  [ ✹ ··· ✷ ]
 * -  7.41% Wide triple system (1-2)  [ ✹ ··· ✷✴ ]
 * -  7.41% Wide triple system (2-1)  [ ✹✷ ··· ✷ ]
 * -  3.70% Complex quadruple system  [ ✹✷ ··· ✷✴ ]
 * 
 * Note: there's actually a bit greater amount of single stars on a wide orbit (@see {@link generateStarFormation}).
 * 
 * @param {number} binaryChance - Probability factor between 0.0 and 1.0.
 * 
 * @returns {boolean} `true` if binary architecture is selected, `false` otherwise.
 */
export function decideStarBinary(binaryChance) {
	return prng() < binaryChance;
}

/**
 * Adds the generated star formation to the system (and to the stars array).
 * 
 * @param {T.System} system - The core system instance containing global settings.
 * @param {T.Star|T.BinaryStar} starFormation - The single star or binary pair being appended.
 * @param {T.Star|T.BinaryStar|null} parentFormation - The parent gravitational center, or null if it's the system's origin.
 * @param {Array<T.Star|T.BinaryStar>} starsArray - Reference to the list tracking all stars.
 */
function appendStarFormation(system, starFormation, parentFormation, starsArray) {
	if (parentFormation === null) {
		// Appending the primary star formation to the system's origin
		starFormation.sma = new T.Value(0, T.units.Dist.m);
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
 * @param {T.Value} primaryMass	  - Mass of the primary component (unit: `Mass`)
 * @param {T.Value} secondaryMass - Mass of the secondary component (unit: `Mass`)
 * @param {boolean} isCloseOrbit  - *[default: `true`]* If `true`, samples tight, short-period orbits; otherwise samples wide orbits.
 * 
 * @returns {T.Value} Semi-major axis distance value (unit: `Dist`)
 */
function generateStarSeparation(primaryMass, secondaryMass, isCloseOrbit = true) {
	const totalMassKg = primaryMass.as(T.units.Mass.kg) + secondaryMass.as(T.units.Mass.kg);

	// Sampling orbital period log-distribution based on binary separation type
	const logPeriodYears = isCloseOrbit === true
		? prng.range(-1.5, 2.0)  // Close orbit: ~11.5 days to 100 years period
		: prng.range(2.5, 4.5);  // Wide orbit: ~316 years to 31623 years period
	
	const periodSeconds = new T.Value(Math.pow(10, logPeriodYears), T.units.Time.y).as(T.units.Time.s);
	
	// Kepler's 3rd law: a³ = (G * M * P²) / (4 * π²)
	const smaMeters = Math.pow( (consts.PHY_G * totalMassKg * periodSeconds**2) / (4 * Math.PI**2), 1/3 );
	
	return new T.Value(smaMeters, T.units.Dist.m);
}
