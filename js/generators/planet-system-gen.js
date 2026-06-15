
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as planetgen from "./planet-gen.js";

const PLANET_SPAWN_START_DIST = 0.1;

const evilAndIntimidatingRedDwarf = new types.Value(0.3, types.units.Mass.M_Sun);
const lightYear = new types.Value(1, types.units.Dist.ly);

/**
 * Get SMA for the next orbit with 1.4-2.1 times longer period.
 * 
 * @param {number} smaCurrent - in AU
 * 
 * @returns {number} in AU
 */
export function getNextOrbit(smaCurrent) {
	const newPeriod = prng.range(1.4, 2.1);
	return smaCurrent * ((newPeriod**2)**(1/3)); // Simplified Kepler's 3rd law
}

/**
 * Skip the current orbit in favor of a further one. Probability of each skip decreases cumulatively.
 * 
 * Probability of skips:
 * - 1: 50%
 * - 2: 12.5% (25% x 50%)
 * - 3: 1.56% (12.5% x 12.5%)
 * - 4: 0.098% (6.25% x 1.56%)
 * - 5: 0.003% (3.13% x 0.098%)
 * - 6 and more: 0% (explicitly forbidden; very unlikely in the first place)
 * 
 * @param {number} sma - in AU
 * 
 * @returns {number} in AU
 * 
 * @see {@link getNextOrbit}
 */
export function tryToSkipOrbit(sma) {
	const baseSkipProbability = 0.5;

	let sma_new = sma;
	let skipCount = 0;
	while (skipCount < 6) {
		const skipProb = 1 - Math.pow(baseSkipProbability, skipCount + 1); // 50%, 25%, 12.5%...
		if (prng() < skipProb) break;
		
		sma_new = getNextOrbit(sma_new);
		skipCount++;
	}

	return sma_new;
}

/**
 * Get an average number of planets around the star from its temperature and metallicity.
 * 
 * @param {types.Star} star   - a star instance. For binaries, amount of P-type orbiting planets is instead calculated from discarded S-type orbiting planets (@see {@link generatePlanetsForBinary}).
 * @param {number} amountMult - planets amount multiplier setting
 * 
 * @returns {number}
 */
function getPlanetsNumberToGenerate(star, amountMult) {
	const temperature = star.temperature.getValueAs(types.units.Temp.K);
	const averagePlanetsNumber = (13 - 0.6 * (Math.pow(Math.log10(temperature), 1.8))) * amountMult; // Default: 7.68 on 2300 K, 3.28 on 50000 K
	const metallicityMult = 1.5 ** star.metallicity;
	const variance = prng.range(1/2, 2.0);
	return Math.round(averagePlanetsNumber * metallicityMult * variance);
}

/**
 * Generates planets for the specified (binary) star instance.
 * 
 * @param {types.GenerationSettings} settings - generating system, containing generation settings
 * @param {types.Star} star		 - a (binary) star instance getting the planets generated
 * @param {number} distanceLimit - distance limit (in AU) beyond which planets will not be generated
 * @param {number} distanceStart - [min, default: {@link PLANET_SPAWN_START_DIST}] distance (in AU) from which planets will start generating
 * @param {number} planetsNumber - [optional] specified planets number to generate instead of a random one (@see {@link generatePlanetsForBinary})
 * 
 * @returns {number} number of not generated planets, as they've got beyond the allowed distance limit.
 */
function generatePlanetsForStar(settings, star, distanceLimit, distanceStart = 0.0, planetsNumber = undefined) {
	const planetsToGenerate = planetsNumber === undefined
		? getPlanetsNumberToGenerate(star, settings.planet_amount_multiplier)
		: planetsNumber;
	if (planetsToGenerate === 0)
		return 0;

	const startDistance = (Math.max(PLANET_SPAWN_START_DIST, distanceStart) + prng.range(0.0, 0.15)) * Math.sqrt(star.luminosity); // AU
	let sma = startDistance;
	let discardedPlanets = 0;
	for (let planetIndex = 0; planetIndex < planetsToGenerate; planetIndex++) {
		sma = tryToSkipOrbit(sma);
		if (sma > distanceLimit) {
			discardedPlanets = planetsToGenerate - planetIndex;
			break;
		}
		
		const planet = planetgen.generatePlanet(
			settings, 
			star, 
			new types.Value(sma, types.units.Dist.AU), 
			{ 
				isMoon: false,
				sma_init: sma,
				sma_min: distanceStart, 
				sma_max: distanceLimit,
			}
		);
		star.bodies.push(planet);

		sma = getNextOrbit(sma);
	}

	return discardedPlanets;
}

/**
 * Get minimal stable P-type orbit (around the binary's barycenter) from Holman & Wiegert 1999 (simplified for circular binaries).
 * 
 * @see {@link getMaximalSTypeOrbit}
 * 
 * @param {types.Value} mass_greater - <types.units.Mass.X>
 * @param {types.Value} mass_lesser  - <types.units.Mass.X>
 * @param {types.Value} binary_sma	 - <types.units.Dist.X>
 * 
 * @returns {types.Value} <types.units.Dist.X>
 */
function getMinimalPTypeOrbit(mass_greater, mass_lesser, binary_sma) {
	const a_crit = getMaximalSTypeOrbit(mass_greater, mass_lesser, binary_sma);
	const sma_crit = a_crit.getValueAs(types.units.Dist.AU) * binary_sma.getValueAs(types.units.Dist.AU);
	return new types.Value(sma_crit, types.units.Dist.AU);
}

/**
 * Get maximal stable S-type orbit (around the star) from Holman & Wiegert 1999 (simplified for circular binaries).
 * 
 * @param {types.Value} host_mass	   - <types.units.Mass.X>
 * @param {types.Value} companion_mass - <types.units.Mass.X>
 * @param {types.Value} binary_sma	   - <types.units.Dist.X>
 * 
 * @returns {types.Value} <types.units.Dist.X>
 */
function getMaximalSTypeOrbit(host_mass, companion_mass, binary_sma) {
	const mA = host_mass.getValueAs(types.units.Mass.M_Sun);
	const mB = companion_mass.getValueAs(types.units.Mass.M_Sun);
	const a_bin = binary_sma.getValueAs(types.units.Dist.AU);

	const u = mB / (mA + mB);
	const a_crit = (0.464 - 0.38 * u) * a_bin;
	return new types.Value(a_crit, types.units.Dist.AU);
}

/**
 * Gets distance limits and performs planets generation for a binary star system (both S-type orbits and P-type orbits).
 * 
 * @see {@link generatePlanetsForStar}
 * 
 * @param {types.BinaryStar} binary 
 * @param {types.GenerationSettings} settings 
 */
function generatePlanetsForBinary(binary, settings) {
	let limit = new types.Value(Infinity, types.units.Dist.m);
	let limit_safe = Infinity;
	
	// Planets around the host star
	limit = getMaximalSTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
	limit_safe = limit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;
	const discardedPlanetsPrimary = generatePlanetsForStar(settings, binary.primary, limit_safe);
	
	// Planets around the companion star
	limit = getMaximalSTypeOrbit(binary.secondary.mass, binary.primary.mass, binary.primary.sma);
	limit_safe = limit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;
	const discardedPlanetsSecondary = generatePlanetsForStar(settings, binary.secondary, limit_safe);
	
	// Planets around both stars
	if (settings.planet_p_type_enabled === true) {
		if (binary.parentBody !== null) { // This binary is a companion of other star (formation)
			limit = getMaximalSTypeOrbit(binary.mass, binary.parentBody.mass, binary.sma);
			limit_safe = limit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;
		}
		else { // This binary is alone
			// Simulating a pass-by of a stray red dwarf at 1 ly distance
			limit = getMaximalSTypeOrbit(binary.mass, evilAndIntimidatingRedDwarf, lightYear);
			limit_safe = limit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;
		}

		const start = getMinimalPTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
		const start_safe = start.getValueAs(types.units.Dist.AU) * settings.planet_p_type_safety_factor;
		
		// Avg. of discarded planets x 0.75
		const pOrbitPlanetsToGenerate = Math.round( ((discardedPlanetsPrimary + discardedPlanetsSecondary) / 2) * 0.75 );
		generatePlanetsForStar(settings, binary, limit_safe, start_safe, pOrbitPlanetsToGenerate);
	}
}

/**
 * Gets distance limits and performs planets generation for a single star.
 * 
 * @see {@link generatePlanetsForStar}
 * 
 * @param {types.Star} star 
 * @param {types.GenerationSettings} settings 
 */
function generatePlanetsForSingleStar(star, settings) {
	// Calculating distance limit
	let a_crit = new types.Value(Infinity, types.units.Dist.m);
	let a_crit_safe = Infinity;
	if (star.bodies.length > 0) { // This single star has a distant companion
		a_crit = getMaximalSTypeOrbit(star.mass, star.bodies[0].mass, star.bodies[0].sma);
	}
	else if (star.parentBody !== null) { // This single star is a companion of other star (formation)
		a_crit = getMaximalSTypeOrbit(star.mass, star.parentBody.mass, star.sma);
	}
	else { // This single star is alone
		// Simulating a pass-by of a stray red dwarf at 1 ly distance
		a_crit = getMaximalSTypeOrbit(star.mass, evilAndIntimidatingRedDwarf, lightYear);
	}
	a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;

	generatePlanetsForStar(settings, star, a_crit_safe);
}

/**
 * Wrapper for generating planets for the specified star formation.
 * 
 * @param {types.Star} star 
 * @param {types.GenerationSettings} settings 
 * 
 * @see {@link generatePlanetsForBinary}
 * @see {@link generatePlanetsForSingleStar}
 */
export function generatePlanets(star, settings) {
	if (star instanceof types.BinaryStar)
		generatePlanetsForBinary(star, settings);
	else
		generatePlanetsForSingleStar(star, settings);
}
