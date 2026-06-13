
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as planetgen from "./planetgen.js";

const PLANET_SPAWN_START_DIST = 0.1;

const evilAndIntimidatingRedDwarf = new types.Value(0.3, types.units.Mass.M_Sun);
const lightYear = new types.Value(1, types.units.Dist.ly);

/**
 * Get SMA for the next orbit with ~{@link consts.PHI} times longer period.
 * @param {number} smaCurrent - in AU
 * @returns {number} in AU
 */
function getNextOrbit(smaCurrent) {
	const newPeriod = consts.PHI * prng.range(0.5, 1.5);
	return smaCurrent * ((newPeriod**2)**(1/3)); // Simplified Kepler's 3rd law
}

/**
 * Skip the current orbit in favor of a further one. Probability of each skip decreases cumulatively.
 * @see {@link getNextOrbit}
 * 
 * Probability of skips:
 * - 1: 50%
 * - 2: 25% x 50% = 12.5%
 * - 3: 12.5% x 12.5% = 1.56%
 * - 4: 6.25% x 1.56% = 0.098%
 * - 5: 3.13% x 0.098% = 0.003%
 * - 6 and more: 0% (explicitly forbidden; very unlikely in the first place)
 * 
 * @param {number} sma - in AU
 * @returns {number} in AU
 */
function tryToSkipOrbit(sma) {
	let current = sma;
	let skipCount = 0;

	while (skipCount < 6) {
		const skipProb = 1 - Math.pow(0.5, skipCount + 1); // 50%, 25%, 12.5%...
		if (prng() < skipProb) break;
		
		current = getNextOrbit(current);
		skipCount++;
	}

	return current;
}

/**
 * Get an average number of planets around the star from its temperature and metallicity.
 * @param {types.Star} star 
 * @param {number} amountMult 
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
 * @param {types.GenerationSettings} settings 
 * @param {types.Star} star - a (binary) star instance getting the planets generated
 * @param {number} distanceLimit - distance limit (in AU) beyond which planets will not be generated
 * @param {number} distanceStart - [min {@link PLANET_SPAWN_START_DIST}] distance (in AU) from which planets will start generating
 * @param {number} planetsNumber - [optional] specified planets number to generate instead of a random one
 * @returns {number} number of not generated planets, as they've got beyond the allowed distance
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
		
		const planet = planetgen.generatePlanet(settings, star, new types.Value(sma, types.units.Dist.AU), { sma_min: distanceStart, sma_max: distanceLimit });
		star.bodies.push(planet);

		sma = getNextOrbit(sma);
	}

	return discardedPlanets;
}

/**
 * Get minimal stable P-type orbit (around the binary's barycenter) from Holman & Wiegert 1999 (simplified for circular binaries).
 * @see {@link getMaximalSTypeOrbit}
 * @param {types.Value} mass_greater - <types.units.Mass.X>
 * @param {types.Value} mass_lesser - <types.units.Mass.X>
 * @param {types.Value} binary_sma - <types.units.Dist.X>
 * @returns {types.Value} <types.units.Dist.X>
 */
function getMinimalPTypeOrbit(mass_greater, mass_lesser, binary_sma) {
	const a_crit = getMaximalSTypeOrbit(mass_greater, mass_lesser, binary_sma);
	const sma_crit = a_crit.getValueAs(types.units.Dist.AU) * binary_sma.getValueAs(types.units.Dist.AU);
	return new types.Value(sma_crit, types.units.Dist.AU);
}

/**
 * Get maximal stable S-type orbit (around the star) from Holman & Wiegert 1999 (simplified for circular binaries).
 * @param {types.Value} host_mass - <types.units.Mass.X>
 * @param {types.Value} companion_mass - <types.units.Mass.X>
 * @param {types.Value} binary_sma - <types.units.Dist.X>
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
 * @see {@link generatePlanetsForStar}
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
		const pOrbitPlanetsToGenerate = Math.round(((discardedPlanetsPrimary + discardedPlanetsSecondary) / 2) * 0.75);
		generatePlanetsForStar(settings, binary, limit_safe, start_safe, pOrbitPlanetsToGenerate);
	}
}

/**
 * Gets distance limits and performs planets generation for a single star.
 * @see {@link generatePlanetsForStar}
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
 * @param {types.Star} star 
 * @param {types.GenerationSettings} settings 
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
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 * @param {number} diskDensity 
 * @param {number} d_t 
 * @param {boolean} grandTack 
 */
function applyMigration(settings, planet, diskDensity, d_t, grandTack) {
	const k1 = settings.planet_migration_type_1_coeff * 0.00000001;
	const k2 = settings.planet_migration_type_2_coeff * 0.00000001;
	const innerEdge = 0.04; // in normalized AU
	
	// Calculating migration rate
	let migrationRate = 0;

	// Type I migration
	let migrationRate_1 = settings.planet_migration_type_1_enabled ? -k1 * diskDensity * planet.mass.value * d_t : 0;
	// Type II migration
	let migrationRate_2 = settings.planet_migration_type_2_enabled ? -k2 * diskDensity * d_t : 0;

	if ((planet.type !== 'Terrestrial') && (grandTack === true)) {
		// Outward movement for gas giants during the Grand Tack
		migrationRate = -0.75 * migrationRate_2;
	}
	else {
		// Transition between type I and type II regime
		const type_1_threshold = 15; // Planets <15 Earth masses are definitely in type I regime

		if (settings.planet_migration_interpolated === true) {
			const type_2_threshold = 120; // Planets >120 Earth masses (0.4 Jupiter masses) are definitely in type II regime
			const migrationTypeRatio = utils.clamp(
				planet.mass.value - type_1_threshold, 
				0, 
				type_2_threshold - type_1_threshold) / (type_2_threshold - type_1_threshold
			);
			migrationRate = migrationRate_1 * (1 - migrationTypeRatio) + migrationRate_2 * migrationTypeRatio;
		}
		else {
			migrationRate = planet.mass.value <= type_1_threshold ? migrationRate_1 : migrationRate_2;
		}
	}
	
	migrationRate *= prng.range(0.8, 1.2); // in normalized AU
	migrationRate *= Math.sqrt(planet.parentBody.luminosity); // in actual AU
	
	// Applying migration
	planet.sma.value += migrationRate;
	
	// Stopping inward migration near the star (and outward too, but normally that shouldn't happen anyway)
	planet.sma.value = utils.clamp(
		planet.sma.value, 
		planet.genData.sma_min - PLANET_SPAWN_START_DIST + ( innerEdge * Math.sqrt(planet.parentBody.luminosity) ),
		planet.genData.sma_max
	);
}

/**
 * 
 * @param {types.Planet} planet_1 
 * @param {types.Planet} planet_2 
 * @param {types.Star} star 
 * @returns {types.Value} <types.units.Dist.X>
 */
function getMutualHillSphere(planet_1, planet_2, star) {
	const a_1 = planet_1.sma.getValueAs(types.units.Dist.m); // 1st body SMA
	const a_2 = planet_2.sma.getValueAs(types.units.Dist.m); // 2nd body SMA
	const mass_1 = planet_1.mass.getValueAs(types.units.Mass.kg); // 1st body mass
	const mass_2 = planet_2.mass.getValueAs(types.units.Mass.kg); // 2nd body mass
	const a_wavg = (a_1 * mass_1 + a_2 * mass_2) / (mass_1 + mass_2); // Weighted average SMA
	const mass_s = star.mass.getValueAs(types.units.Mass.kg); // Star mass

	const R_H = a_wavg * Math.pow((mass_1 + mass_2) / (3 * mass_s), 1/3);
	return new types.Value(R_H, types.units.Dist.m);
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Planet} nextPlanet 
 */
function mergePlanets(planet, nextPlanet) {
	// Assigning weighted average of SMAs
	planet.sma.value = (planet.mass.value * planet.sma.value + nextPlanet.mass.value * nextPlanet.sma.value) / (planet.mass.value +  nextPlanet.mass.value);

	// Overall mass merge
	planet.mass.value += nextPlanet.mass.value;

	// Incrementing impact counter
	planet.genData.impacts += nextPlanet.genData.impacts + 1;

	// ! Core merge
	// Core composition fraction to mass conversion
	planet.core.composition.iron *= planet.core.mass;
	planet.core.composition.rock *= planet.core.mass;
	planet.core.composition.ice *= planet.core.mass;

	// Core mass addition
	planet.core.mass += nextPlanet.core.mass;
	planet.core.composition.iron += nextPlanet.core.composition.iron * nextPlanet.core.mass;
	planet.core.composition.rock += nextPlanet.core.composition.rock * nextPlanet.core.mass;
	planet.core.composition.ice += nextPlanet.core.composition.ice * nextPlanet.core.mass;

	// Core composition mass to fraction conversion
	planet.core.composition.iron /= planet.core.mass;
	planet.core.composition.rock /= planet.core.mass;
	planet.core.composition.ice /= planet.core.mass;

	// ! Envelope merge
	// Envelope composition fraction to mass conversion
	planet.envelope.composition.gas *= planet.envelope.mass;
	planet.envelope.composition.ice *= planet.envelope.mass;

	// Envelope mass addition
	planet.envelope.mass += nextPlanet.envelope.mass;
	planet.envelope.composition.gas += nextPlanet.envelope.composition.gas * nextPlanet.envelope.mass;
	planet.envelope.composition.ice += nextPlanet.envelope.composition.ice * nextPlanet.envelope.mass;

	// Envelope composition mass to fraction conversion
	planet.envelope.composition.gas /= planet.envelope.mass > 0 ? planet.envelope.mass : 1;
	planet.envelope.composition.ice /= planet.envelope.mass > 0 ? planet.envelope.mass : 1;

	// ! Planet type reevaluation
	if (planet.envelope.mass === 0) {
		planet.type = 'Terrestrial';
	}
	else {
		if (planet.envelope.composition.gas > 0.8) {
			planet.type = 'Gas Giant';
		}
		else {
			planet.type = planet.mass.value < 15.0 ? 'Mini-Neptune' : 'Ice Giant';
		}
	}

	// Donor discarding
	nextPlanet.genData.status = 'Merged';
	nextPlanet.sma = new types.Value(Infinity, types.units.Dist.AU);
}

/**
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet_1 
 * @param {types.Planet} planet_2 
 * @param {types.Star} star 
 */
function resolveCloseEncounter(settings, planet, nextPlanet, star, finalStep) {
	// Stability check
	const mutualHillSphere = getMutualHillSphere(planet, nextPlanet, star);
	const distance = Math.abs(planet.sma.getValueAs(types.units.Dist.AU) - nextPlanet.sma.getValueAs(types.units.Dist.AU));
	const threshold = mutualHillSphere.getValueAs(types.units.Dist.AU) * settings.planet_migration_hill_safety_factor;
	if (distance < threshold) { // Planets are too close
		const massRatio = planet.mass.getValueAs(types.units.Mass.M_Earth) / nextPlanet.mass.getValueAs(types.units.Mass.M_Earth);

		const outcome_roll = prng();
		let outcome = 0;
		
		if (finalStep === false) {
			if (outcome_roll < 0.3) outcome = 0; // 30% - bodies merge case
			else if (outcome_roll < 0.5) outcome = 1; // 20% - lesser body eject case
			else outcome = 2; // 50% - chaotic mutual shift case
		}
		else { // Forced violent event at the final simulation step
			outcome = Math.round(outcome_roll);
		}

		switch (outcome) {
			case 0:
				mergePlanets(planet, nextPlanet);
				break;
			case 1:
				if (massRatio < 1) {
					// "planet" < "nextPlanet" | "planet" ejects, "nextPlanet" shifts
					planet.genData.status = 'Ejected';
					planet.sma = new types.Value(Infinity, types.units.Dist.AU);

					// 0.9|1.1^(0.99..0.01)
					nextPlanet.sma.value *= prng.range(0.9**massRatio, 1.1**massRatio); 
				}
				else {
					// "planet" > "nextPlanet" | "nextPlanet" ejects, "planet" shifts
					nextPlanet.genData.status = 'Ejected';
					nextPlanet.sma = new types.Value(Infinity, types.units.Dist.AU);

					// 0.9|1.1^(1/1.01..1/99.9)
					planet.sma.value *= prng.range(0.9**(1/massRatio), 1.1**(1/massRatio)); 
				}
				break;
			case 2:
				if (massRatio < 1) {
					// 0.75|1.25^(1 - 0.99..0.01)
					planet.sma.value *= prng.range(0.7**(1 - massRatio), 1.3**(1 - massRatio));

					// 0.75|1.25^(0.99..0.01)
					nextPlanet.sma.value *= prng.range(0.7**massRatio, 1.3**massRatio);
				}
				else {
					// 0.75|1.25^(1/1.01..1/99.9)
					planet.sma.value *= prng.range(0.7**(1/massRatio), 1.3**(1/massRatio));

					// 0.75|1.25^(1 - 1/1.01..1/99.9)
					nextPlanet.sma.value *= prng.range(0.7**(1 - 1/massRatio), 1.3**(1 - 1/massRatio));
				}
				break
		}
	}
}

/**
 * 
 * @param {types.Body} a 
 * @param {types.Body} b 
 * @returns 
 */
function distSort(a, b) {
	const dist_a = a.sma.getValueAs(types.units.Dist.m);
	const dist_b = b.sma.getValueAs(types.units.Dist.m);

	if (dist_a > dist_b) return 1;
	if (dist_a < dist_b) return -1;
	return 0;
}

/**
 * 
 * @param {types.GenerationSettings} settings 
 * @param {Array<types.Star>} starsArray 
 */
export function simulateMigration(settings, starsArray) {
	// Converting units of all planets for convenience and reassurance
	starsArray.forEach(star => { star.bodies.forEach( body => { 
		if ((body instanceof types.Planet) === false)
			return;
		body.sma.convertUnitTo(types.units.Dist.AU)
	}); });
	starsArray.forEach(star => { star.bodies.forEach( body => { 
		if ((body instanceof types.Planet) === false)
			return;
		body.mass.convertUnitTo(types.units.Mass.M_Earth)
	}); });

	const d_t = 10000; // 1 step duration in years
	const diskLifetime = Math.round(new types.Value(5, types.units.Time.My).getValueAs(types.units.Time.y) / d_t); // 5 Myr disk lifetime, converted to steps
	
	starsArray.forEach(star => {
		const initialDiskDensity = 1 * (10**(star.metallicity * 0.2)) * (10**utils.randomRangeGaussian(-0.5, 0.5));
		const starMass = star.mass.getValueAs(types.units.Mass.M_Earth);
		
		let activeGiants = 0;
		let grandTack = false;

		for (let step = 0; step < diskLifetime; step++) {
			const diskDensity = initialDiskDensity * Math.exp(-step / diskLifetime);

			activeGiants = 0; // Giants counter reset
			for (let i = 0; i < star.bodies.length; i++) {
				const planet = star.bodies[i];

				// Discarding stars
				if ((planet instanceof types.Planet) === false)
					continue;
				
				// Discarding discarded planets
				if ((planet.genData.status === 'Ejected') || (planet.genData.status === 'Merged'))
					continue; 

				applyMigration(settings, planet, diskDensity, d_t, grandTack)

				// --------------------
				
				// Array out of bounds protection, since we're processing it in pairs
				if (i !== (star.bodies.length - 1)) {
					const nextPlanet = star.bodies[i+1];

					// Discarding a star neighbour (it should be at the edge of the list anyway)
					if ((nextPlanet instanceof types.Planet) === false)
						continue;

					// Discarding a discarded planet neighbour
					if ((nextPlanet.genData.status === 'Ejected') || (nextPlanet.genData.status === 'Merged'))
						continue;

					resolveCloseEncounter(settings, planet, nextPlanet, star, step === (diskLifetime - 1))
				}
				
				// --------------------

				// Gas giants counter increment
				if (planet.genData.status === '')
					if (planet.type !== 'Terrestrial')
						activeGiants++;
			}

			// Grand Tack activation
			if (settings.planet_migration_grand_tack_enabled === true) {
				if (grandTack === false) {
					if (activeGiants >= 2)
						if (step >= (diskLifetime / 2))
							grandTack = true;
				}
			}

			// Resorting array by distance at the end of the step, after processing all planets
			star.bodies.sort((a, b) => distSort(a, b)); 
		}
	});

	// Discarded planets purge
	starsArray.forEach(star => {
		for (let i = star.bodies.length-1; i >= 0; i--) {
			if ((star.bodies[i] instanceof types.Planet) === false)
				continue;

			if (star.bodies[i].genData.status !== '') {
				console.log(`Removed ${star.bodies[i].type} (${star.bodies[i].genData.status})`);
				star.bodies.splice(i, 1);
			}
		}
	});
}
