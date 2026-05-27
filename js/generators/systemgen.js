
import eventBus from "../utils/eventbus.js";
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import * as stargen from "./stargen.js";
import consts from "../data/consts.js";

class SystemGenerator {
	constructor(
		settings = new types.GenerationSettings()
	) {
		this.settings = settings;

		this._subscribe();
	}

	_subscribe() {
		eventBus.on('generator:generate', () => { 
			this.generate();
		});

		eventBus.on('generator:settings_seed', (cb) => {
			this.settings.seed_user = cb.data;
		});

		eventBus.on('generator:settings_force_habitable', (cb) => {
			this.settings.force_habitable = cb.data;
		});
		eventBus.on('generator:settings_life_chance', (cb) => {
			this.settings.life_chance = cb.data;
		});
		eventBus.on('generator:settings_life_jupiter_behavior', (cb) => {
			this.settings.jupiter_behavior = cb.data;
		});
		eventBus.on('generator:settings_planet_density', (cb) => {
			this.settings.planet_density = cb.data;
		});
		
		eventBus.on('generator:settings_star_mass_min', (cb) => {
			this.settings.star_mass_min = cb.data;
		});
		eventBus.on('generator:settings_star_mass_max', (cb) => {
			this.settings.star_mass_max = cb.data;
		});
		eventBus.on('generator:settings_star_mass_use_imf', (cb) => {
			this.settings.star_mass_use_imf = cb.data;
		});

		eventBus.on('generator:settings_star_metallicity_min', (cb) => {
			this.settings.star_metallicity_min = cb.data;
		});
		eventBus.on('generator:settings_star_metallicity_max', (cb) => {
			this.settings.star_metallicity_max = cb.data;
		});
		eventBus.on('generator:settings_star_metallicity_gaussian', (cb) => {
			this.settings.star_metallicity_gaussian = cb.data;
		});
		eventBus.on('generator:settings_star_metallicity_mean', (cb) => {
			this.settings.star_metallicity_mean = cb.data;
		});
		eventBus.on('generator:settings_star_metallicity_std', (cb) => {
			this.settings.star_metallicity_std = cb.data;
		});
	}

	// -------------------------------------------------

	// =================================================
	// Planets
	// =================================================

	/*
	hillSphere(mass_1, mass_2, sma) {
		const mass_1_kg = mass_1.getValueAs(types.units.Mass.kg);
		const mass_2_kg = mass_2.getValueAs(types.units.Mass.kg);

		const m1 = Math.max(mass_1_kg, mass_2_kg);
		const m2 = Math.min(mass_1_kg, mass_2_kg);
		const a = sma.getValueAs(types.units.Dist.m);

		const hill_sphere = a * Math.pow(m2 / (3 * m1), 1/3);
		return new types.Value(hill_sphere, types.units.Dist.m);
	}
	*/

	nextOrbit(sma) {
		const new_period = prng.range(1.5, 2.5);
		return sma * ((new_period**2)**(1/3)); // Simplified Kepler's 3rd law
	}

	generatePlanetsForStar(
		star = new Star(),
		dist_limit = 100,
		dist_start = undefined,
		planets_num = undefined,
	) {
		const avg_planets_num = 13 - 0.5 * (Math.log10(star.temperature.getValueAs(types.units.Temp.K))**2); // 7.35 on 2300 K, 1.96 on 50000 K
		const planets_to_generate = planets_num === undefined
			? Math.round(avg_planets_num * prng.range( (1/3) , 1+(2/3) ))
			: planets_num;

		if (planets_to_generate === 0)
			return 0;

		const frost_line = 5 * Math.sqrt(star.luminosity); // AU

		const start_distance = dist_start === undefined
			? prng.range(0.1, 0.25) * Math.sqrt(star.luminosity) // AU
			: dist_start + prng.range(0.0, 0.15) * Math.sqrt(star.luminosity);
		const rand_base = (1/2);
		let sma = start_distance;
		let casted_off_planets = 0;
		for (let planet_index = 0; planet_index < planets_to_generate; planet_index++) {
			let attempts = 0;
			let rand = false;
			do {
				attempts++;
				rand = prng() < (1 - Math.pow(rand_base, attempts)); // 100% - (50% -> 0%) = (50% -> 100%)
				if (rand === false)
					sma = this.nextOrbit(sma);
			} while (rand === false);

			if (sma > dist_limit) {
				casted_off_planets = planets_to_generate - planet_index;
				break;
			}

			// make a planet
			if (sma < frost_line) console.log('prob a big rock');
			else if (sma < (frost_line * 3)) console.log('prob a gas giant');
			else console.log('prob a small rock or an ice giant');

			sma = this.nextOrbit(sma);
		}

		return casted_off_planets;
	}

	getMinimalPTypeOrbit(mass_greater, mass_lesser, binary_sma) {
		const a_crit = this.getMaximalSTypeOrbit(mass_greater, mass_lesser, binary_sma);
		const sma_crit = a_crit.getValueAs(types.units.Dist.AU) * binary_sma.getValueAs(types.units.Dist.AU);
		return new types.Value(sma_crit, types.units.Dist.AU);
	}

	// Maximal stable S-type orbit from Holman & Wiegert 1999 (simplified for circular binaries)
	getMaximalSTypeOrbit(host_mass, companion_mass, binary_sma) {
		const mA = host_mass.getValueAs(types.units.Mass.M_Sun);
		const mB = companion_mass.getValueAs(types.units.Mass.M_Sun);
		const a_bin = binary_sma.getValueAs(types.units.Dist.AU);

		const u = mB / (mA + mB);
		const a_crit = (0.464 - 0.38 * u) * a_bin;
		return new types.Value(a_crit, types.units.Dist.AU);
	}

	generatePlanetsForBinaryStar(binary) {
		console.log('Binary star planets:');

		console.log('Star A planets:');
		// Planets around the host star
		let limit = this.getMaximalSTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
		let limit_safe = limit.getValueAs(types.units.Dist.AU) * 0.8;
		const casted_off_prim = this.generatePlanetsForStar(binary.primary, limit_safe);

		console.log('Star B planets:');
		// Planets around the companion star
		limit = this.getMaximalSTypeOrbit(binary.secondary.mass, binary.primary.mass, binary.primary.sma);
		limit_safe = limit.getValueAs(types.units.Dist.AU) * 0.8;
		const casted_off_sec = this.generatePlanetsForStar(binary.secondary, limit_safe);

		console.log('Circumbinary planets:');
		// Planets around both stars
		limit_safe = Infinity;
		if (binary.parentBody !== null) {
			limit = this.getMaximalSTypeOrbit(binary.mass, binary.parentBody.mass, binary.sma);
			limit_safe = limit.getValueAs(types.units.Dist.AU) * 0.8;
		}
		const start = this.getMinimalPTypeOrbit(binary.primary.mass, binary.secondary.mass, binary.primary.sma);
		const start_safe = start.getValueAs(types.units.Dist.AU) * 1.2;
		const p_orbit_planets_to_generate = Math.round((casted_off_prim + casted_off_sec) / 2);
		this.generatePlanetsForStar(binary, limit_safe, start_safe, p_orbit_planets_to_generate);
	}

	generatePlanetsForSingleStar(star = new types.Star()) {
		console.log('Single star planets:');

		let a_crit_safe = Infinity;
		if (star.bodies.length > 0) {
			const a_crit = this.getMaximalSTypeOrbit(star.mass, star.bodies[0].mass, star.bodies[0].sma);
			a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * 0.8;
		}
		else if (star.parentBody !== null) {
			const a_crit = this.getMaximalSTypeOrbit(star.mass, star.parentBody.mass, star.sma);
			a_crit_safe = a_crit.getValueAs(types.units.Dist.AU) * 0.8;
		}
		this.generatePlanetsForStar(star, a_crit_safe);
	}

	generatePlanets(star = new types.Star()) {
		if (star instanceof types.BinaryStar)
			this.generatePlanetsForBinaryStar(star);
		else
			this.generatePlanetsForSingleStar(star);
	}

	// -------------------------------------------------



	// =================================================
	// Stars
	// =================================================

	appendStarFormation(starFormation, origin) {
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
	}

	generateStarSeparation(primaryMass, secondaryMass, close_orbit = true) {
		const totalMass = primaryMass.getValueAs(types.units.Mass.kg) + secondaryMass.getValueAs(types.units.Mass.kg);
		const period_rand = close_orbit === true
			? prng.range(-1.5, 2.0)  // close orbit: 11.5 days to 100 years period
			: prng.range(2.5, 4.5);  // wide orbit: 316 years to 31623 years period
		const period = new types.Value(Math.pow(10, period_rand), types.units.Time.y).getValueAs(types.units.Time.s);
		
		const a = Math.pow( (period**2) / ((4 * (Math.PI**2)) / (consts.PHY_G * totalMass)) , 1/3); // Kepler's 3rd law
		const aAU = new types.Value(a, types.units.Dist.m).getValueAs(types.units.Dist.AU);
		
		return new types.Value(aAU, types.units.Dist.AU);
	}

	decideStarBinary() {
		/*
		33.3% binary chance tried twice results in:
		 * 44.4% single stars
		 * 22.2% single stars + wide orbit close binary stars
		 * 22.2% close binary stars + wide orbit single stars*
		 * 11.1% close binary stars + wide orbit close binary stars
		But actually, there's a bit greater amount of single stars on a wide orbit, see explanation in generateStarFormation()
		*/
		const binary_chance = 1/3;
		return prng() < binary_chance;
	}

	generateStarFormation(origin = null) {
		if (this.decideStarBinary() === false) {
			const star = stargen.generateStar(this.settings, origin);
			this.appendStarFormation(star, origin);
			return star;
		}
		else {
			const constraint = structuredClone(origin);
			let allow_binary = true;
			if (origin !== null) {
				constraint.mass.value /= 2;

				if (constraint.mass.value < consts.PHY_STAR_MASS_MIN) {
					/*
					Can't generate stars with mass below minimal threshold (that would be brown dwarfs).
					If attempted to generate, the masses will be clamped to 0.08 Msol, combined binary mass 0.16 Msol.
					This can result in mass greater than the constraint's mass. So, making a single star instead.
					*/
					allow_binary = false;
					constraint.mass.value *= 2;
				}
			}

			const primary = stargen.generateStar(this.settings, constraint);
			if (allow_binary) {
				const secondary = stargen.generateStar(this.settings, primary);
				const sma = this.generateStarSeparation(primary.mass, secondary.mass, true);

				const binary = new types.BinaryStar(primary, secondary, sma);
				this.appendStarFormation(binary, origin);
				return binary;
			}
			else {
				this.appendStarFormation(primary, origin);
				return primary;
			}
		}
	}

	// -------------------------------------------------



	generate() {
		this.settings.seed_user = '1779905235851';

		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		console.log(this.settings.seed);

		const stars = [];
		const planets = [];
		const moons = [];

		// Generating the primary single/binary star
		stars.push(this.generateStarFormation(null));

		// Generating the secondary single/binary star on a wide orbit
		if (this.decideStarBinary())
			stars.push(this.generateStarFormation(this.system.bodies[0]));

		// Planets generation around the star(s)
		stars.forEach(star => {
			this.generatePlanets(star);
		});
		
		console.log(this.system);
		//console.log(JSON.stringify(this.system, null, "\t"));
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
