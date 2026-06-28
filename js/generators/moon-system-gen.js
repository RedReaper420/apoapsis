
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as planetSystemGen from "./planet-system-gen.js";
import * as planetGen from "./planet-gen.js";

import {events, eventBus} from "../utils/eventbus.js";

/**
 * Attempts to generate a moon system for a planet. Possible outcomes:
 * - Planet gets a regular moons system.
 * - Planet gets an impact moon (1:50...1:100 mass ratio).
 * - Planet gets a similar mass companion (1:1...1:25 mass ratio), the pair turns into a binary planet. Additionally, the binary may get regular moons.
 * - No moons generated (insufficient mass, no giant impacts).
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {types.Planet} planet - Current planet.
 * 
 * @see {@link generateBinary}
 * @see {@link generateImpactMoon}
 * @see {@link generateRegularMoons}
 */
export function generateMoons(settings, planet) {
	const planetMass_MEarth = planet.mass.getValueAs(types.units.Mass.M_Earth);
	const planetRadius_REarth = planet.radius.getValueAs(types.units.Dist.R_Earth);

	const hillSphere = getHillSphere(planet, planet.parentBody);
	const hillSphere_REarth = hillSphere.getValueAs(types.units.Dist.R_Earth);
	const moonSmaMax_REarth = hillSphere_REarth * 0.3; // Maximal stable orbit's SMA for a moon around its parent body.

	// Minimal SMA values are rough approximations of Roche limits.
	const binarySmaMin_REarth = 2.5 * (1 + 1) * planetRadius_REarth;
	const moonSmaMin_REarth = 2.5 * (1 + 1/3) * planetRadius_REarth;

	// Preventing generation beforehand if there's no room for stable orbits.
	if (moonSmaMax_REarth < moonSmaMin_REarth)
		return;
	
	const binaryChance = 0.1 * Math.exp(-Math.log10(planetMass_MEarth + 1));

	// Calculating a binary companion mass budget that won't disturb orbits of neighbor planets.
	const maxSafeMass = calculateMaxSafeMass(planet, planet.parentBody, settings.planet_migration_hill_safety_factor);
	const maxSafeMass_MEarth = maxSafeMass.getValueAs(types.units.Mass.M_Earth);
	const maxCompanionMass_MEarth = Math.min(maxSafeMass_MEarth, planetMass_MEarth);
	const availableMassRatio = Math.min(0.99, maxCompanionMass_MEarth / planetMass_MEarth);
	
	// Chance to add an impact to the planet's stats, even if there were no impact during migration simulation.
	const bonusImpactChance = 0.1 * Math.exp(-0.5 * planetMass_MEarth); 
	if (prng() < bonusImpactChance) planet.genData.impacts += 1;
	
	let regularMoonsOverrideChance = 0; // If the planet didn't have giant impacts, it won't have an impact moon.
	let isBinary = false; // If the planet didn't have giant impacts, it won't have a binary companion.
	if (planet.genData.impacts > 0) {
		// Deciding about making an impact moon or regular moons.
		const impactMoonsOnlyMass = 5; // M⊕
		const regularMoonsOnlyMass = 20; // M⊕

		if (planetMass_MEarth <= impactMoonsOnlyMass)
			regularMoonsOverrideChance = 1.0; // An impact moon always replaces regular moons for planets with lower mass.
		else if (planetMass_MEarth >= regularMoonsOnlyMass) 
			regularMoonsOverrideChance = 0.0; // An impact moon never replaces regular moons for planets with higher mass.
		else 
			regularMoonsOverrideChance = Math.exp(-0.75 * (planetMass_MEarth - impactMoonsOnlyMass));
		
		// Deciding about making a binary planet instead moons.
		if (moonSmaMax_REarth > binarySmaMin_REarth) { // There should be a corridor between binary's Roche limit and Hill sphere's fraction.
			if (availableMassRatio >= consts.DEF_BINARY_PLANET_MASS_RATIO) { // There should be enough mass available for a binary companion.
				for (let i = 0; i < planet.genData.impacts; i++) {
					if (prng() < binaryChance) {
						isBinary = true;
						break;
					}
				}
			}
		}
	}

	// Generation
	if (isBinary === true) {
		// Binary planet decided.
		generateBinary(settings, planet, binarySmaMin_REarth, moonSmaMax_REarth, availableMassRatio);
	}
	else {
		// Moon(s) decided.

		if (prng() < regularMoonsOverrideChance) {
			// Impact moon generation.
			generateImpactMoon(settings, planet, moonSmaMin_REarth, moonSmaMax_REarth);
		}
		else {
			// Regular moons generation.
			generateRegularMoons(settings, planet, moonSmaMax_REarth);
		}
	}
}

/**
 * Calculates Hill sphere radius of a planet.
 * 
 * @param {types.Planet} planet - Current planet.
 * @param {types.Star|types.BinaryStar} star - Star around which the planet is orbiting.
 * 
 * @returns {types.Value} Hill sphere radius (unit: `Dist`).
 */
function getHillSphere(planet, star) {
	const a = planet.sma.getValueAs(types.units.Dist.m);
	const mass_p = planet.mass.getValueAs(types.units.Mass.kg);
	const mass_s = star.mass.getValueAs(types.units.Mass.kg);

	const R_H = a * Math.pow(mass_p / (3 * mass_s), 1/3);
	return new types.Value(R_H, types.units.Dist.m);
}

/**
 * Calculates maximal allowed mass that won't destabilize neighbors' orbits.
 * 
 * @param {types.Planet} planet - Current planet.
 * @param {types.Star|types.BinaryStar} star - Star around which the planet is orbiting.
 * @param {number} safetyFactor - Stability factor (usually >=3.5).
 * 
 * @returns {types.Value} Maximal allowed mass (unit: `Mass`).
 */
function calculateMaxSafeMass(planet, star, safetyFactor = 4.0) {
	const M_star = star.mass.getValueAs(types.units.Mass.kg);
	const a_current = planet.sma.getValueAs(types.units.Dist.m);
	const M_planet = planet.mass.getValueAs(types.units.Mass.kg);

	let maxMassPrev = Infinity;
	let maxMassNext = Infinity;

	// Calculation function for a mass limit alongside a neighbor 
	const getLimitByNeighbor = (neighbor) => {
		const a_neigh = neighbor.sma.getValueAs(types.units.Dist.m);
		const M_neigh = neighbor.mass.getValueAs(types.units.Mass.kg);

		const deltaA = Math.abs(a_current - a_neigh);
		const meanA = (a_current + a_neigh) / 2;

		// Hill criteria
		const massLimit = 3 * M_star * Math.pow(deltaA / (safetyFactor * meanA), 3) - M_neigh;
		return massLimit - M_planet;
	};

	// Calculating limit for the inner neighbor (if there is one)
	if (planet.genData.neighborPrev) {
		maxMassPrev = getLimitByNeighbor(planet.genData.neighborPrev);
	}

	// Calculating limit for the outer neighbor (if there is one)
	if (planet.genData.neighborNext) {
		maxMassNext = getLimitByNeighbor(planet.genData.neighborNext);
	}

	// Taking the strictest mass limit as the result
	const maxSafeMass = Math.min(maxMassPrev, maxMassNext);

	return new types.Value(maxSafeMass, types.units.Mass.kg);
}

/**
 * Calculates moon's Roche limit.
 * 
 * @param {types.Planet} planet - Current planet hosting a moon.
 * @param {types.Planet} moon - Current moon orbiting the planet.
 * 
 * @returns {types.Value} Roche limit (unit: `Dist`)
 */
function getRocheLimit(planet, moon) {
	const r_p = planet.radius.getValueAs(types.units.Dist.m);
	const rho_p = planet.density;
	const rho_m = moon.density;

	const R = 2.44 * r_p * Math.pow(rho_p / rho_m, 1/3);
	return new types.Value(R, types.units.Dist.m);
}

/**
 * Generates a binary companion for a planet, turns the pair into a binary planet, and generates regular moons for the binary.
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {types.Planet} planet - Current planet.
 * @param {number} binarySmaMin_REarth - Calculated minimal SMA of a binary (approximate Roche limit).
 * @param {number} binarySmaMax_REarth - Calculated maximal SMA of a binary (planet's Hill sphere fraction).
 * @param {number} availableMassRatio - Calculated maximal safe mass ratio of a binary.
 * 
 * @see {@link generateRegularMoons}
 */
function generateBinary(settings, planet, binarySmaMin_REarth, binarySmaMax_REarth, availableMassRatio) {
	// --- 1. Generating a companion planet ---

	// Companion's SMA around the planet (later will be assigned to the planet too).
	const companionSma_REarth = utils.clamp(
		utils.randomRangeGaussian(binarySmaMin_REarth, binarySmaMin_REarth * 20), 
		binarySmaMin_REarth, binarySmaMax_REarth
	);
	const companionSma = new types.Value(companionSma_REarth, types.units.Dist.R_Earth);
	
	// Generating companion instance.
	const companionMass_MEarth = planet.core.mass.getValueAs(types.units.Mass.M_Earth) * prng.range(consts.DEF_BINARY_PLANET_MASS_RATIO, availableMassRatio);
	const companionMass = new types.Value(companionMass_MEarth, types.units.Mass.M_Earth);
	const companion = planetGen.generatePlanet(settings, planet, companionSma,
		{
			isMoon: true,
			mass: companionMass,
			retrograde: false,
			type: 'binary',
		}
	);
	
	// --- 2. Making a binary planet instance ---

	// Removing the planet receiving the companion from the parent's body list
	for (let i = 0; i < planet.parentBody.bodies.length; i++) {
		if (planet.parentBody.bodies[i] === planet) {
			planet.parentBody.bodies.splice(i, 1);
			break;
		}
	}

	// Making and setting up a binary container

	// Saving values for binary
	const binaryParent = planet.parentBody;
	const binarySma = new types.Value(planet.sma.value, planet.sma.unit);

	const binary = new types.BinaryPlanet(planet, companion, companion.sma); // Binary constructor reassigns values of the planets

	// Setting values for binary
	binary.sma = binarySma;
	binary.parentBody = binaryParent;

	binaryParent.bodies.push(binary); // Adding the binary to the star's body list

	// --- 3. Generating regular moons ---

	// Calculating maximal safe SMA for circumbinary moons.
	const hillSphere = getHillSphere(binary, binaryParent);
	const hillSphere_REarth = hillSphere.getValueAs(types.units.Dist.R_Earth);
	const moonSmaMax_REarth = hillSphere_REarth * 0.3;

	// Determining lesser and greater companion masses (primary may not always be heavier in case of gas giants)
	const massMin = binary.primary.mass.getValueAs(types.units.Mass.M_Earth) < binary.secondary.mass.getValueAs(types.units.Mass.M_Earth)
		? binary.primary.mass
		: binary.secondary.mass;
	const massMax = binary.primary.mass.getValueAs(types.units.Mass.M_Earth) >= binary.secondary.mass.getValueAs(types.units.Mass.M_Earth)
		? binary.primary.mass
		: binary.secondary.mass;

	// Calculating minimal stable P-type orbit.
	const moonSmaStartOffset = planetSystemGen.getMinimalPTypeOrbit(massMax, massMin, binary.primary.sma);
	const moonSmaStartOffset_AU = moonSmaStartOffset.getValueAs(types.units.Dist.AU) * settings.planet_p_type_safety_factor;
	
	// Generating circumbinary moons.
	generateRegularMoons(settings, binary, moonSmaMax_REarth, moonSmaStartOffset_AU);
	
	// Calculating maximal stable S-type orbit for primary, then generating moons.
	const moonSmaMax_primary = planetSystemGen.getMaximalSTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
	const moonSmaMax_primary_REarth = moonSmaMax_primary.getValueAs(types.units.Dist.R_Earth);
	generateRegularMoons(settings, binary.primary, moonSmaMax_primary_REarth);

	// Calculating maximal stable S-type orbit for secondary, then generating moons.
	const moonSmaMax_secondary = planetSystemGen.getMaximalSTypeOrbit(binary.secondary.mass, binary.primary.mass, binary.primary.sma);
	const moonSmaMax_secondary_REarth = moonSmaMax_secondary.getValueAs(types.units.Dist.R_Earth);
	generateRegularMoons(settings, binary.secondary, moonSmaMax_secondary_REarth);
	
	if (binary.primary.type !== 'Terrestrial')
		eventBus.emit('shtap');
}

/**
 * Attempts to generate regular moons for a planet.
 * 
 * Moons minimal mass threshold is 0.1 M☾, minimal possible moon mass is 0.01 M☾.
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {types.Planet} planet - Current planet.
 * @param {number} moonSmaMax_REarth - Calculated maximal SMA of a moon (planet's Hill sphere fraction).
 * @param {number} moonSmaStartOffset_AU - SMA start offset: 0 for normal moons (default), a calculated minimal P-orbit value for circumbinary moons.
 */
function generateRegularMoons(settings, planet, moonSmaMax_REarth, moonSmaStartOffset_AU = 0) {
	
	// Mass budget calculation
	const planetMass_MMoon = planet.mass.getValueAs(types.units.Mass.M_Moon);
	const planetMassFactor = 0.5 * Math.log10(planet.mass.getValueAs(types.units.Mass.M_Earth) + 1);
	let massBudget = planetMass_MMoon * planetMassFactor * 1e-4 * utils.randomRangeGaussian(0.7, 1.3);
	if (planet instanceof types.BinaryPlanet)
		massBudget /= 3; // A semblance of mass preservation (B1-S-moons + B2-S-moons + P-moons)

	// Chance to loose a moon due to violent collissions in the past
	const moonLossChance = planet.genData.impacts > 0
		? Math.pow(0.5, 1/(0.25 * (planet.genData.impacts + 1)))
		: 0;
	
	const moonMasses = [];
	const massThreshold = 0.1; // M☾
	while (massBudget >= massThreshold) {
		const moonMass = moonMasses.length === 0 
			// The first moon in the list may be deliberately placed too close to later give rings to the planet.
			// Making that moon smaller to make 2nd and 3rd moons more interesting.
			? massBudget * prng.range(0.1, 0.4) // Minimal first: budget 0.1 * random 0.1 = 0.01 M☾
			: massBudget * prng.range(0.2, 0.6) // Minimal rest: budget 0.1 * random 0.2 = 0.02 M☾
		massBudget -= moonMass;
		
		moonMasses.push(moonMass);
	}
	
	// Picking SMA for the first moon
	const planetRadius_AU = planet.radius.getValueAs(types.units.Dist.AU);
	const moonSmaStart_AU = planetRadius_AU * (10**prng.range(0.25, 0.75));
	const moonSmaMax_AU = new types.Value(moonSmaMax_REarth, types.units.Dist.R_Earth).getValueAs(types.units.Dist.AU);

	let sma = moonSmaStart_AU + moonSmaStartOffset_AU;
	for (let i = 0; i < moonMasses.length; i++) {
		sma = planetSystemGen.tryToSkipOrbit(sma);

		if (sma > moonSmaMax_AU)
			break;

		let moonSma_AU = sma;
		
		if (prng() < moonLossChance) {
			if (prng() < 0.5)
				continue; // 50% chance: moon "ejects"
			else
				moonSma_AU = 0; // 50% chance: moon "plunges"
		} 

		const moonSma = new types.Value(moonSma_AU, types.units.Dist.AU);

		const moonMass_MMoon = moonMasses[i];
		const moonMass = new types.Value(moonMass_MMoon, types.units.Mass.M_Moon);

		// 20% chance to make a retrograde moon if SMA passed half of the limit
		const moonIsRetrograde = sma >= moonSmaMax_AU * 0.5 ? prng() < 0.2 : false;

		const moon = planetGen.generatePlanet(settings, planet, moonSma, 
			{ 
				isMoon: true,
				mass: moonMass,
				retrograde: moonIsRetrograde,
				type: 'regular',
			}
		);
		planet.bodies.push(moon);

		sma = planetSystemGen.getNextOrbit(sma);
	}
	
	// Destroying moons within the Roche limit and turning them into rings.
	for (let i = planet.bodies.length-1; i >= 0; i--) {
		const moon = planet.bodies[i];
		const rocheLimit = getRocheLimit(planet, moon);

		const moonSma_km = moon.sma.getValueAs(types.units.Dist.km);
		const rocheLimit_km = rocheLimit.getValueAs(types.units.Dist.km);

		if (moonSma_km <= rocheLimit_km) {
			if (planet instanceof types.BinaryPlanet === false) {
				planet.rings.push(new types.RingSystem(
					new types.Value(planet.radius.value * 1.5, planet.radius.unit), 
					rocheLimit, 
					moon.mass, 
					moon.core.composition.ice
				));
			}
			planet.bodies.splice(i, 1);
		}
	}
}

/**
 * Attempts to generate an impact moon for a planet. The moon's mass ratio is 1:50 to 1:100.
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {types.Planet} planet - Current planet.
 * @param {number} moonSmaMin_REarth - Calculated minimal SMA of a moon (approximate Roche limit).
 * @param {number} moonSmaMax_REarth - Calculated maximal SMA of a moon (planet's Hill sphere fraction).
 */
function generateImpactMoon(settings, planet, moonSmaMin_REarth, moonSmaMax_REarth) {
	const planetMass_MEarth = planet.mass.getValueAs(types.units.Mass.M_Earth);

	// Chance to loose a moon due to violent collissions in the past, starting from 2nd impact.
	const moonLossChance = 1 - Math.exp(-0.5 * (planet.genData.impacts - 1));
			
	let sma = 0; // Moon "plunges" (if loss triggered).
	if (prng() < moonLossChance) {
		if (prng() < 0.5) sma = Infinity; // 50% chance: moon "ejects".
		// 50% chance: moon "plunges" instead.
	}
	else {
		// Moon stays.
		sma = moonSmaMin_REarth + (moonSmaMax_REarth - moonSmaMin_REarth) * Math.pow(prng(), 2);
	}

	if (sma !== Infinity) {
		const moonMass_MEarth = planetMass_MEarth / prng.range(50.0, 100.0);
		const moonMass = new types.Value(moonMass_MEarth, types.units.Mass.M_Earth);
		const moonSma = new types.Value(sma, types.units.Dist.R_Earth);
		const moon = planetGen.generatePlanet(settings, planet, moonSma, 
			{ 
				isMoon: true,
				mass: moonMass,
				retrograde: false,
				type: 'impact',
			}
		);
		
		const rocheLimit = getRocheLimit(planet, moon);
		const rocheLimit_REarth = rocheLimit.getValueAs(types.units.Dist.R_Earth);
		if (sma <= rocheLimit_REarth) {
			// Turning the moon into rings if it falls on the planet.
			planet.rings.push(new types.RingSystem(
				new types.Value(planet.radius.value * 1.5, planet.radius.unit), 
				rocheLimit, 
				moon.mass, 
				moon.core.composition.ice
			));
		}
		else {
			planet.bodies.push(moon);
		}
	}
}
