
import eventBus from "../utils/eventbus.js";
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import * as stargen from "./stargen.js";
import consts from "../data/consts.js";

class SystemGenerator {
	constructor(
		settings=new types.GenerationSettings()
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

	decideBinary() {
		/*
		44.4% are single stars
		22.2% are single + wide close binary
		22.2% are close binary + single
		11.1% are close binary + wide orbit close orbit

		But actually, there's greater amount of single stars on a wide orbit, see generateStarFormation()
		*/
		const binary_chance = 1/3;
		return prng() < binary_chance;
	}

	appendStarFormation(starFormation, origin) {
		if (origin === null) {
			// Appending the primary star formation to the system's origin
			starFormation.sma = new types.Value(0, 'dist_m');
			this.system.bodies.push(starFormation);
		}
		else {
			// Appending the secondary star formation to the primary star formation
			starFormation.parentBody = origin;
			starFormation.sma = this.generateStarSeparation(origin.mass, starFormation.mass, false)
			origin.bodies.push(starFormation);
		}
	}

	generateStarFormation(origin = null) {
		if (this.decideBinary() === false) {
			const star = stargen.generateStar(this.settings, origin);
			this.appendStarFormation(star, origin);
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
			}
			else {
				this.appendStarFormation(primary, origin);
			}
		}
	}

	generateStarSeparation(primaryMass, secondaryMass, close_orbit = true) {
		const totalMass = primaryMass.getValueAs('mass_kg') + secondaryMass.getValueAs('mass_kg');
		const period_rand = close_orbit === true
			? prng.range(-1.5, 2.0)  // 11.5 days to 100 years
			: prng.range(2.5, 4.5);  // 316 years to 31623 years
		const period = new types.Value(Math.pow(10, period_rand), 'time_y').getValueAs('time_s');
		const a = Math.pow( (period**2) / ((4 * (Math.PI**2)) / (consts.PHY_G * totalMass)) , 1/3);
		const aAU = new types.Value(a, 'dist_m').getValueAs('dist_au');
		
		return new types.Value(aAU, 'dist_au');
		//return new types.Value(aAU, String(new types.Value(period, 'time_s').getValueAs('time_y')) );
	}

	generate() {
		//this.settings.seed_user = '1779695686866';

		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		// Generating the primary single/binary star
		this.generateStarFormation(null);

		// Generating the secondary single/binary star on a wide orbit
		if (this.decideBinary)
			this.generateStarFormation(this.system.bodies[0]);

		console.log(this.system);

		//console.log(JSON.stringify(this.system, null, "\t"));
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
