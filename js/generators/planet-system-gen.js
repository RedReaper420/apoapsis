
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as planetGen from "./planet-gen.js";

const PLANET_SPAWN_START_DIST = 0.1; // AU

const evilAndIntimidatingRedDwarf = new types.Value(0.3, types.units.Mass.M_Sun);
const lightYear = new types.Value(0.2, types.units.Dist.ly);

/**
 * Wrapper for generating planets for the specified star formation.
 * 
 * @param {types.Star|types.BinaryStar} star - Current star formation.
 * @param {types.GenerationSettings} settings - Generation settings configuration.
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

/**
 * Gets distance limits and performs planets generation for a single star.
 * 
 * @see {@link generatePlanetsForStar}
 * 
 * @param {types.Star} star - Current star.
 * @param {types.GenerationSettings} settings - Generation settings configuration.
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
		// Simulating a pass-by of a stray red dwarf at 0.2 ly distance
		a_crit = getMaximalSTypeOrbit(star.mass, evilAndIntimidatingRedDwarf, lightYear);
	}
	a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * settings.planet_s_type_safety_factor;

	generatePlanetsForStar(settings, star, a_crit_safe);
}

/**
 * Gets distance limits and performs planets generation for a binary star system (both S-type orbits and P-type orbits).
 * 
 * @see {@link generatePlanetsForStar}
 * 
 * @param {types.BinaryStar} binary - Current binary star.
 * @param {types.GenerationSettings} settings - Generation settings configuration.
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
			// Simulating a pass-by of a stray red dwarf at 0.2 ly distance
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
 * Gets maximal stable S-type orbit (around the star) from Holman & Wiegert 1999.
 * 
 * @param {types.Value} host_mass	   - Satellite's host body mass (unit: `Mass`).
 * @param {types.Value} companion_mass - Host's companion mass (unit: `Mass`).
 * @param {types.Value} binary_sma	   - Separation between binary components (unit: `Dist`).
 * 
 * @returns {types.Value} Maximal S-type orbit SMA (unit: `Dist`).
 */
export function getMaximalSTypeOrbit(host_mass, companion_mass, binary_sma) {
	const mA = host_mass.getValueAs(types.units.Mass.M_Sun);
	const mB = companion_mass.getValueAs(types.units.Mass.M_Sun);
	const a_bin = binary_sma.getValueAs(types.units.Dist.AU);

	const u = mB / (mA + mB);
	const e = 0.125;
	const a_crit = ( 0.464 - 0.38 * u - 0.631 * e + 0.586 * u * e + 0.15 * (e**2) - 0.198 * u * (e**2) ) * a_bin
	//const a_crit = ( 0.464 - 0.38 * u ) * a_bin; // Simplified for circular binaries
	return new types.Value(a_crit, types.units.Dist.AU);
}

/**
 * Gets minimal stable P-type orbit (around the binary's barycenter) from Holman & Wiegert 1999.
 * 
 * @see {@link getMaximalSTypeOrbit}
 * 
 * @param {types.Value} mass_greater - Greater binary component's mass (unit: `Mass`).
 * @param {types.Value} mass_lesser  - Lesser binary component's mass (unit: `Mass`).
 * @param {types.Value} binary_sma	 - Separation between binary components (unit: `Dist`).
 * 
 * @returns {types.Value} Minimal P-type orbit SMA (unit: `Dist`).
 */
export function getMinimalPTypeOrbit(mass_greater, mass_lesser, binary_sma) {
	const mA = mass_greater.getValueAs(types.units.Mass.M_Sun);
	const mB = mass_lesser.getValueAs(types.units.Mass.M_Sun);
	const a_bin = binary_sma.getValueAs(types.units.Dist.AU);

	const u = mB / (mA + mB);
	const e = 0.125;
	const a_crit = ( 1.6 + 5.1 * e - 2.22 * (e**2) + 4.12 * u - 4.27 * e * u - 5.09 * (u**2) + 4.61 * (e**2) * (u**2) ) * a_bin
	//const a_crit = ( 1.6 + 4.12 * u - 5.09 * (u**2) ) * a_bin; // Simplified for circular binaries
	return new types.Value(a_crit, types.units.Dist.AU);
}

/**
 * Generates planets for the specified (binary) star instance.
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {types.Star|types.BinaryStar} star - Current star formation.
 * @param {number} distanceLimit - Distance limit (in AU) beyond which planets won't be generated.
 * @param {number} distanceStart - *[min, default: {@link PLANET_SPAWN_START_DIST}]* distance (in AU) from which planets will start generating.
 * @param {number} planetsNumber - *[optional]* specified planets number to generate instead of a random one (@see {@link generatePlanetsForBinary}).
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
		
		const planet = planetGen.generatePlanet(
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
 * Samples a number of planets to generate around the star from its temperature and metallicity.
 * 
 * @param {types.Star} star - Current star. For binaries, amount of P-type orbiting planets is instead calculated from discarded S-type orbiting planets (@see {@link generatePlanetsForBinary}).
 * @param {number} amountMult - Planets amount multiplier setting.
 * 
 * @returns {number} Number of planets to generate.
 */
function getPlanetsNumberToGenerate(star, amountMult) {
	const temperature = star.temperature.getValueAs(types.units.Temp.K);

	const minNumber = 0.5;
	const maxNumber = 11;
	const temperatureBorder = 5500;
	const softSlopeParam = 200;
	const component_1 = temperature < temperatureBorder
		? Math.log10(temperatureBorder - softSlopeParam)
		: Math.log10(temperature);
	const component_2 = temperature < temperatureBorder
		? Math.log10((temperature - softSlopeParam) / temperature)
		: 0;
	const component_3 = Math.log10(4600);
	const averagePlanetsNumber = minNumber + (maxNumber - minNumber + 7.5) * Math.exp(-6 * (component_1 - component_2 - component_3)); 

	const metallicityMult = 1.25 ** star.metallicity;

	const variance = utils.randomRangeGaussian(1/1.5, 1.5);

	return Math.round(averagePlanetsNumber * metallicityMult * variance);
}

/**
 * Skips the current orbit in favor of a new, further one with some probability. Probability of each skip decreases cumulatively.
 * 
 * Probability of skips:
 * - 1: 50%
 * - 2: 12.5% (25% x 50%)
 * - 3: 1.56% (12.5% x 12.5%)
 * - 4: 0.098% (6.25% x 1.56%)
 * - 5: 0.003% (3.13% x 0.098%)
 * - 6 and more: 0% (explicitly forbidden; very unlikely in the first place)
 * 
 * @param {number} sma - Current SMA value (AU).
 * 
 * @returns {number} New SMA value (AU).
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
 * Get SMA for the next orbit with 1.4-2.2 times longer period.
 * 
 * @param {number} smaCurrent - Current SMA value (AU).
 * 
 * @returns {number} New SMA value (AU).
 */
export function getNextOrbit(smaCurrent) {
	const newPeriod = prng.range(1.5, 2.4);
	return smaCurrent * ((newPeriod**2)**(1/3)); // Simplified Kepler's 3rd law
}
