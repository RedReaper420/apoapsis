
import {events, eventBus} from "../utils/eventbus.js";
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import * as stargen from "./stargen.js";
import * as planetgen from "./planetgen.js";
import consts from "../data/consts.js";

const S_TYPE_SAFETY_FACTOR = 0.8;
const P_TYPE_SAFETY_FACTOR = 1.2;

class SystemGenerator {
	constructor(
		settings = new types.GenerationSettings()
	) {
		this.settings = settings;

		this.#subscribe();
	}

	#subscribe() {
		eventBus.on(events.Generator.Generate, () => { 
			this.generate();
		});

		eventBus.on(events.Generator.Settings.Seed, (cb) => {
			this.settings.seed_user = cb.data;
		});

		eventBus.on(events.Generator.Settings.ForceHabitable, (cb) => {
			this.settings.force_habitable = cb.data;
		});
		eventBus.on(events.Generator.Settings.LifeChance, (cb) => {
			this.settings.life_chance = cb.data;
		});
		eventBus.on(events.Generator.Settings.JupiterBehavior, (cb) => {
			this.settings.jupiter_behavior = cb.data;
		});
		eventBus.on(events.Generator.Settings.PlanetDensity, (cb) => {
			this.settings.planet_density = cb.data;
		});
		
		eventBus.on(events.Generator.Settings.Star.BinaryChance, (cb) => {
			this.settings.star_binary_chance = cb.data;
		});

		eventBus.on(events.Generator.Settings.Star.MassMin, (cb) => {
			this.settings.star_mass_min = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MassMax, (cb) => {
			this.settings.star_mass_max = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MassUseIMF, (cb) => {
			this.settings.star_mass_use_imf = cb.data;
		});

		eventBus.on(events.Generator.Settings.Star.MetallicityMin, (cb) => {
			this.settings.star_metallicity_min = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MetallicityMax, (cb) => {
			this.settings.star_metallicity_max = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MetallicityGaussian, (cb) => {
			this.settings.star_metallicity_gaussian = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MetallicityMean, (cb) => {
			this.settings.star_metallicity_mean = cb.data;
		});
		eventBus.on(events.Generator.Settings.Star.MetallicityStD, (cb) => {
			this.settings.star_metallicity_std = cb.data;
		});
	}

	// -------------------------------------------------



	// =================================================
	// Planets
	// =================================================

	/**
	 * Get SMA for the next orbit with 1.4-2.8 times longer period.
	 * @param {number} smaCurrent - in AU
	 * @returns {number} in AU
	 */
	getNextOrbit(smaCurrent) {
		const newPeriod = prng.range(1.4, 2.6);
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
	tryToSkipOrbit(sma) {
		let current = sma;
		let skipCount = 0;

		while (skipCount < 6) {
			const skipProb = 1 - Math.pow(0.5, skipCount + 1); // 50%, 25%, 12.5%...
			if (prng() < skipProb) break;
			
			current = this.getNextOrbit(current);
			skipCount++;
		}

		return current;
	}

	/**
	 * Get an average number of planets around the star from its temperature and metallicity.
	 * @param {types.Star} star 
	 * @returns {number}
	 */
	getPlanetsNumberToGenerate(star) {
		const temperature = star.temperature.getValueAs(types.units.Temp.K);
		const averagePlanetsNumber = 13 - 0.6 * (Math.pow(Math.log10(temperature), 1.8)); // 7.68 on 2300 K, 3.28 on 50000 K
		const metallicityMult = 1.5 ** star.metallicity;
		const variance = prng.range(1-0.5, 1+0.5);
		return Math.round(averagePlanetsNumber * metallicityMult * variance);
	}

	/**
	 * Generates planets for the specified (binary) star instance.
	 * @param {types.Star} star - a (binary) star instance getting the planets generated
	 * @param {Array} planetsArray
	 * @param {number} distanceLimit - distance limit (in AU) beyond which planets will not be generated
	 * @param {number} distanceStart - [default 0.1] distance (in AU) from which planets will start generating
	 * @param {number} planetsNumber - [optional] specified planets number to generate instead of a random one
	 * @returns {number} number of not generated planets, as they've got beyond the allowed distance
	 */
	generatePlanetsForStar(star, planetsArray, distanceLimit, distanceStart = 0.1, planetsNumber = undefined) {
		const planetsToGenerate = planetsNumber === undefined ? this.getPlanetsNumberToGenerate(star) : planetsNumber;
		if (planetsToGenerate === 0)
			return 0;

		const startDistance = (distanceStart + prng.range(0.0, 0.15)) * Math.sqrt(star.luminosity); // AU
		let sma = startDistance;
		let discardedPlanets = 0;
		for (let planetIndex = 0; planetIndex < planetsToGenerate; planetIndex++) {
			sma = this.tryToSkipOrbit(sma);
			if (sma > distanceLimit) {
				discardedPlanets = planetsToGenerate - planetIndex;
				break;
			}

			const planet = planetgen.generatePlanet(this.settings, star, new types.Value(sma, types.units.Dist.AU));
			star.bodies.push(planet);
			planetsArray.push(planet);

			sma = this.getNextOrbit(sma);
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
	getMinimalPTypeOrbit(mass_greater, mass_lesser, binary_sma) {
		const a_crit = this.getMaximalSTypeOrbit(mass_greater, mass_lesser, binary_sma);
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
	getMaximalSTypeOrbit(host_mass, companion_mass, binary_sma) {
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
	 * @param {Array} planetsArray 
	 */
	generatePlanetsForBinary(binary, planetsArray) {
		console.log('Binary star planets:');

		console.log('Star A planets:');
		// Planets around the host star
		let limit = this.getMaximalSTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
		let limit_safe = limit.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		const discardedPlanetsPrimary = this.generatePlanetsForStar(binary.primary, planetsArray, limit_safe);

		console.log('Star B planets:');
		// Planets around the companion star
		limit = this.getMaximalSTypeOrbit(binary.secondary.mass, binary.primary.mass, binary.primary.sma);
		limit_safe = limit.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		const discardedPlanetsSecondary = this.generatePlanetsForStar(binary.secondary, planetsArray, limit_safe);

		console.log('Circumbinary planets:');
		// Planets around both stars
		limit_safe = Infinity;
		if (binary.parentBody !== null) { // This binary is a companion of other star (formation)
			limit = this.getMaximalSTypeOrbit(binary.mass, binary.parentBody.mass, binary.sma);
			limit_safe = limit.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		}
		else { // This binary is alone
			// Simulating a pass-by of a stray red dwarf at 1 ly distance
			const evilAndIntimidatingRedDwarf = new types.Value(0.3, types.units.Mass.M_Sun);
			const lightYear = new types.Value(1, types.units.Dist.ly);
			const passByResult = this.getMaximalSTypeOrbit(binary.mass, evilAndIntimidatingRedDwarf, lightYear);
			limit_safe = passByResult.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		}

		const start = this.getMinimalPTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
		const start_safe = start.getValueAs(types.units.Dist.AU) * P_TYPE_SAFETY_FACTOR;
		
		const pOrbitPlanetsToGenerate = Math.round((discardedPlanetsPrimary + discardedPlanetsSecondary) / 2);
		this.generatePlanetsForStar(binary, planetsArray, limit_safe, start_safe, pOrbitPlanetsToGenerate);
	}

	/**
	 * Gets distance limits and performs planets generation for a single star.
	 * @see {@link generatePlanetsForStar}
	 * @param {types.Star} star 
	 * @param {Array} planetsArray 
	 */
	generatePlanetsForSingleStar(star, planetsArray) {
		console.log('Single star planets:');

		// Calculating distance limit
		let a_crit_safe = Infinity;
		if (star.bodies.length > 0) { // This single star has a distant companion
			const a_crit = this.getMaximalSTypeOrbit(star.mass, star.bodies[0].mass, star.bodies[0].sma);
			a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		}
		else if (star.parentBody !== null) { // This single star is a companion of other star (formation)
			const a_crit = this.getMaximalSTypeOrbit(star.mass, star.parentBody.mass, star.sma);
			a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		}
		else { // This single star is alone
			// Simulating a pass-by of a stray red dwarf at 1 ly distance
			const evilAndIntimidatingRedDwarf = new types.Value(0.3, types.units.Mass.M_Sun);
			const lightYear = new types.Value(1, types.units.Dist.ly);
			const passByResult = this.getMaximalSTypeOrbit(star.mass, evilAndIntimidatingRedDwarf, lightYear);
			a_crit_safe = passByResult.getValueAs(types.units.Dist.AU) * S_TYPE_SAFETY_FACTOR;
		}

		this.generatePlanetsForStar(star, planetsArray, a_crit_safe);
	}

	/**
	 * Wrapper for generating planets for the specified star formation.
	 * @param {types.Star} star 
	 * @param {Array} planetsArray 
	 * @see {@link generatePlanetsForBinary}
	 * @see {@link generatePlanetsForSingleStar}
	 */
	generatePlanets(star, planetsArray) {
		if (star instanceof types.BinaryStar)
			this.generatePlanetsForBinary(star, planetsArray);
		else
			this.generatePlanetsForSingleStar(star, planetsArray);
	}

	// -------------------------------------------------



	// =================================================
	// Stars
	// =================================================

	/**
	 * Adds the generated star formation to the system (and to the stars array).
	 * @param {types.Star} starFormation - a single or a binary star
	 * @param {types.Star} origin - parent formation (simulation origin (null) or other star formation)
	 * @param {Array} starsArray - stars array reference
	 */
	appendStarFormation(starFormation, origin, starsArray) {
		if (origin === null) {
			// Appending the primary star formation to the system's origin
			starFormation.sma = new types.Value(0, types.units.Dist.m);
			this.system.bodies.push(starFormation);
		}
		else {
			// Appending the secondary star formation to the primary star formation
			starFormation.parentBody = origin;
			starFormation.sma = this.generateStarSeparation(origin.mass, starFormation.mass, false)
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
	generateStarSeparation(primaryMass, secondaryMass, isCloseOrbit = true) {
		const totalMass = primaryMass.getValueAs(types.units.Mass.kg) + secondaryMass.getValueAs(types.units.Mass.kg);
		const period_rand = isCloseOrbit === true
			? prng.range(-1.5, 2.0)  // close orbit: 11.5 days to 100 years period
			: prng.range(2.5, 4.5);  // wide orbit: 316 years to 31623 years period
		const period = new types.Value(Math.pow(10, period_rand), types.units.Time.y).getValueAs(types.units.Time.s);
		
		const a = Math.pow( (consts.PHY_G * totalMass * period**2) / (4 * Math.PI**2), 1/3 ); // Kepler's 3rd law
		
		return new types.Value(a, types.units.Dist.m);
	}

	/**
	 * Decides to make a binary star formation with a certain probability.
	 * 
	 * With the default 33.3% chance, attempts for making the primary a binary, for adding a companion to the primary, and for making the companion a binary, are resulting in:
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
	decideStarBinary() {
		return prng() < this.settings.star_binary_chance;
	}

	/**
	 * Generates a star formation (a single or a binary star) and adds it to the system.
	 * @param {types.Star} origin - parent formation (simulation origin (null) or other star formation)
	 * @param {Array} starsArray - stars array reference
	 */
	generateStarFormation(origin = null, starsArray) {
		if (this.decideStarBinary() === false) {
			// Single star decided and generated
			const star = stargen.generateStar(this.settings, origin);
			this.appendStarFormation(star, origin, starsArray);
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
				const primary = stargen.generateStar(this.settings, origin);
				const secondary = stargen.generateStar(this.settings, primary);
				const sma = this.generateStarSeparation(primary.mass, secondary.mass, true);

				const binary = new types.BinaryStar(primary, secondary, sma);
				this.appendStarFormation(binary, origin, starsArray);
			}
			else {
				// Single star generated (since binary is incompatible)
				const star = stargen.generateStar(this.settings, origin, 0.5);
				this.appendStarFormation(star, origin, starsArray);
			}
		}
	}

	// -------------------------------------------------



	generate() {
		//this.settings.seed_user = '1780617986811';

		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		console.log(this.settings.seed);

		const stars = [];
		const planets = [];
		const moons = [];

		// Generating the primary single/binary star
		this.generateStarFormation(null, stars);

		// Generating the secondary single/binary star on a wide orbit
		if (this.decideStarBinary()) this.generateStarFormation(this.system.bodies[0], stars);

		// Planets generation around the star(s)
		stars.forEach(star => {
			this.generatePlanets(star, planets);
		});
		
		console.log(this.system);
		console.log('-------')
		//console.log(JSON.stringify(this.system, null, "\t"));
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
