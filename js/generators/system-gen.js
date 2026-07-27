
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as starSystemGen from "./star-system-gen.js";
import * as planetSystemGen from "./planet-system-gen.js";
import * as migrationSim from "./migration-sim.js";
import * as planetGen from "./planet-gen.js";
import * as moonSystemGen from "./moon-system-gen.js";

class SystemGenerator {
	constructor(
		settings = new types.GenerationSettings()
	) {
		this.settings = settings;

		this.#subscribe();
		//this.settings.seed_user = 'ec10d7b7-a0cb-490a-bff8-e555891fa3e2';
	}

	generate() {
		this.settings.seed = !this.settings.seed_user ? window.crypto.randomUUID() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		console.log(this.settings.seed);

		const stars = []; // single stars and binary stars list

		// Generating the primary single/binary star
		starSystemGen.generateStarFormation(this.system, null, stars);

		// Generating the secondary single/binary star on a wide orbit
		if (starSystemGen.decideStarBinary(this.settings.star_binary_chance))
			starSystemGen.generateStarFormation(this.system, this.system.bodies[0], stars);

		// Planets generation around single stars and binaries
		stars.forEach(star => {
			planetSystemGen.generatePlanets(star, this.settings);
		});

		// Making the star list correctly include binary components after generating planets
		stars.forEach(star => {
			if (star instanceof types.BinaryStar) {
				stars.push(star.primary);
				stars.push(star.secondary);
			}
		});

		// Migration simulation
		migrationSim.simulateMigration(this.settings, stars);

		// Performing stage 2 generation for main planets and generating moons for them
		stars.forEach(star => {
			for (let i = star.bodies.length-1; i >= 0; i--) {
				const body = star.bodies[i]
				if ((body instanceof types.Star) || (body instanceof types.Binary))
					continue;

				planetGen.planetGeneration_Stage2(this.settings, body);
				moonSystemGen.generateMoons(this.settings, body);
			}
		});

		// Performing stage 3 generation for all planetary bodies
		const finishGeneration = (body) => {
			if (body instanceof types.Planet) {
				planetGen.planetGeneration_Stage3(this.settings, body);
			}

			// -------

			// Recursive calls
			body.bodies.forEach(child => { 
				finishGeneration(child) 
			});
			if (body instanceof types.Binary) {
				finishGeneration(body.primary);
				finishGeneration(body.secondary);
			}
		};
		stars.forEach(star => { finishGeneration(star) });
		
		console.log(this.system);
		console.log('--------------------')

		eventBus.emit(events.Generator.Generation.Completed, { data: this.system });
	}

	// -------------------------------------------------

	#subscribe() {
		eventBus.on(events.Generator.Generation.Start, () => { 
			///*
			let gen = true;
			let attempts = 0+999*1;
			eventBus.on('shtap', () => { gen = false });

			while (gen && (attempts < 1000)) {
				this.generate();
				attempts++;
			}
			console.log(attempts);
			//*/
			//this.generate();
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
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
