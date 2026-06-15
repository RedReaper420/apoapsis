
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as starsystemgen from "./starsystemgen.js";
import * as planetsystemgen from "./planetsystemgen.js";

class SystemGenerator {
	constructor(
		settings = new types.GenerationSettings()
	) {
		this.settings = settings;

		this.#subscribe();
		//this.settings.seed_user = '1781390872361';
	}

	#subscribe() {
		eventBus.on(events.Generator.Generation.Start, () => { 
			this.generate();
		});

		// Settings change subscriptions

		eventBus.on(events.Generator.Settings.Seed, (cb) => {
			this.settings.seed_user = cb.data;
		});

		// Star settings
		
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

		// Planet settings
		
		eventBus.on(events.Generator.Settings.Planet.amountMultiplier, (cb) => {
			this.settings.planet_amount_multiplier = cb.data;
		});

		eventBus.on(events.Generator.Settings.Planet.sTypeSafetyFactor, (cb) => {
			this.settings.planet_s_type_safety_factor = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.pTypeSafetyFactor, (cb) => {
			this.settings.planet_p_type_safety_factor = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.pTypeEnabled, (cb) => {
			this.settings.planet_p_type_enabled = cb.data;
		});

		eventBus.on(events.Generator.Settings.Planet.type1MigrationEnabled, (cb) => {
			this.settings.planet_migration_type_1_enabled = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.type1MigrationCoeff, (cb) => {
			this.settings.planet_migration_type_1_coeff = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.type2MigrationEnabled, (cb) => {
			this.settings.planet_migration_type_2_enabled = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.type2MigrationCoeff, (cb) => {
			this.settings.planet_migration_type_2_coeff = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.migrationInterpolated, (cb) => {
			this.settings.planet_migration_interpolated = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.grandTackEnabled, (cb) => {
			this.settings.planet_migration_grand_tack_enabled = cb.data;
		});
		eventBus.on(events.Generator.Settings.Planet.hillSafetyFactor, (cb) => {
			this.settings.planet_migration_hill_safety_factor = cb.data;
		});
	}

	// -------------------------------------------------

	generate() {
		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		console.log(this.settings.seed);

		const stars = []; // single stars and binary stars list

		// Generating the primary single/binary star
		starsystemgen.generateStarFormation(this.system, null, stars);

		// Generating the secondary single/binary star on a wide orbit
		if (starsystemgen.decideStarBinary(this.settings.star_binary_chance))
			starsystemgen.generateStarFormation(this.system, this.system.bodies[0], stars);

		// Planets generation around the star(s)
		stars.forEach(star => {
			planetsystemgen.generatePlanets(star, this.settings);
		});

		// Making the star list correctly include binary components after generating planets
		stars.forEach(star => {
			if (star instanceof types.BinaryStar) {
				stars.push(star.primary);
				stars.push(star.secondary);
			}
		});

		// Migration simulation
		planetsystemgen.simulateMigration(this.settings, stars);
		
		// Finishing planets generation and generating moons
		eventBus.emit(events.Generator.Generation.FinishPlanets);
		
		console.log(this.system);
		console.log('-------')

		eventBus.emit(events.Generator.Generation.Completed, { data: this.system });
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
