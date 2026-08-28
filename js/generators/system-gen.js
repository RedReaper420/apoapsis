
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

import * as starSystemGen from "./star-system-gen.js";
import * as planetSystemGen from "./planet-system-gen.js";
import * as migrationSim from "./migration-sim.js";
import * as planetGen from "./planet-gen.js";
import * as moonSystemGen from "./moon-system-gen.js";

class SystemGenerator {
	constructor(
		settings = new T.GenerationSettings()
	) {
		this.settings = settings;

		this.#subscribe();
		//this.settings.seed_user = 'bf007859-f91b-4feb-a31e-96edf8cf25b6';
	}

	generate() {
		this.settings.seed = !this.settings.seed_user ? window.crypto.randomUUID() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new T.System(this.settings);

		console.log(this.settings.seed);

		/** @type {Array<T.Star|T.BinaryStar>} */
		const stars = []; // Single stars and binary stars list

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
			if (star instanceof T.BinaryStar) {
				stars.push(star.primary);
				stars.push(star.secondary);
			}
		});

		// Assigning a system type
		let starsCount = 0;
		stars.forEach(star => {
			starsCount += star instanceof T.Star ? 1 : 0;
		})
		switch (starsCount) {
			case 1: this.system.type = T.systemTypes.Single; break;
			case 2: this.system.type = T.systemTypes.Binary; break;
			case 3: this.system.type = T.systemTypes.Triple; break;
			case 4: this.system.type = T.systemTypes.Quadruple; break;
		}

		// Migration simulation
		migrationSim.simulateMigration(this.settings, stars);

		// Performing stage 2 generation for main planets and generating moons for them
		stars.forEach(star => {
			for (let i = star.bodies.length-1; i >= 0; i--) {
				const body = star.bodies[i]
				if ((body instanceof T.Star) || (body instanceof T.Binary))
					continue;

				planetGen.planetGeneration_Stage2(body);
				moonSystemGen.generateMoons(this.settings, body);
			}
		});

		// Resorting bodies after adding binary planets
		stars.forEach(star => {
			star.bodies.sort((bodyA, bodyB) => {
				const distanceA = bodyA.sma.as(T.units.Dist.m);
				const distanceB = bodyB.sma.as(T.units.Dist.m);
				return distanceA - distanceB;
			}); 
		});

		// Performing stage 3 generation for all planetary bodies
		const finishGeneration = (/** @type {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} */ body) => {
			// Generation order "Binary components -> Children" is deliberate.
			// Reason: children are taking magnetosphere values of their parents.

			// Recursive calls
			if (body instanceof T.Binary) {
				finishGeneration(body.primary);
				finishGeneration(body.secondary);
			}

			// -------

			body.orbit.a = body.sma.as(T.units.Dist.m);
			body.orbit.calculateMeanMotion(body);
			body.orbit.w = 2 * Math.PI * prng();
			body.orbit.M0 = 2 * Math.PI * prng();
			
			if (body instanceof T.Planet) {
				planetGen.planetGeneration_Stage3(this.settings, body);
				
				if (body.genData.retrograde === true) {
					body.orbit.i = (body.orbit.i + Math.PI) % (2 * Math.PI);
				}
			}

			if ((body instanceof T.Star) || (body instanceof T.BinaryStar)) {
				planetGen.setEccentricity(body);
			}

			body.orbit.e = body.eccentricity;

			if (body instanceof T.Binary) {
				// Setting correct distances for binary components from its barycenter.
				// For other bodies that detail is ignored.
				const mass1 = body.primary.mass.as(T.units.Mass.kg);
				const mass2 = body.secondary.mass.as(T.units.Mass.kg);

				const primary = mass1 >= mass2 ? body.primary : body.secondary;
				const secondary = mass1 < mass2 ? body.primary : body.secondary;
				
				const r1 = primary.orbit.a / (1 + mass1 / mass2);
				const r2 = secondary.orbit.a - r1;

				primary.orbit.a = r1;
				secondary.orbit.a = r2;

				// Setting the correct orbits for binary components.
				secondary.orbit.w = (primary.orbit.w + Math.PI) % (2 * Math.PI);
				secondary.orbit.M0 = primary.orbit.M0;

				// Setting some random eccentricity for binary star components
				if (body instanceof T.BinaryStar) {
					const rand_e = 0.15 * prng();

					primary.orbit.e = rand_e;
					primary.eccentricity = rand_e;

					secondary.orbit.e = rand_e;
					secondary.eccentricity = rand_e;
				}
			}

			// -------

			// Recursive calls
			body.bodies.forEach(child => { 
				finishGeneration(child) 
			});
		};
		this.system.bodies.forEach(body => { finishGeneration(body) });

		const calculateOrbitalPeriodAndSpeed = (/** @type {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} */ body) => {
			if (body.parentBody !== null) {
				let host = body.parentBody;
				if (body.parentBody instanceof T.Binary) {
					if (body.parentBody.primary === body)
						host = body.parentBody.secondary;
					else if (body.parentBody.secondary === body)
						host = body.parentBody.primary;
				}

				const a = body.sma.as(T.units.Dist.m);
				const M = body.parentBody === host
					? host.mass.as(T.units.Mass.kg) // Small body orbiting a central body case
					: body.parentBody.mass.as(T.units.Mass.kg); // Two bodies orbiting each other case
				
				const orbitalPeriod = 2 * Math.PI * Math.sqrt( (a ** 3) / (consts.PHY_G * M) );
				body.orbitalPeriod = new T.Value(orbitalPeriod, T.units.Time.s);

				const orbitalSpeed = (2 * Math.PI * a) / orbitalPeriod;
				body.orbitalSpeed = new T.Value(orbitalSpeed, T.units.Spd.m_s);
			}

			if (body instanceof T.Binary) {
				calculateOrbitalPeriodAndSpeed(body.primary);
				calculateOrbitalPeriodAndSpeed(body.secondary);
			}
			body.bodies.forEach(child => { 
				calculateOrbitalPeriodAndSpeed(child) 
			});
		}
		this.system.bodies.forEach(body => { calculateOrbitalPeriodAndSpeed(body) });
		
		console.log(this.system);
		console.log('--------------------')
	}

	startGeneration() {
		let gen = true;
		let attempts = 0+999*1;
		eventBus.on('shtap', () => { gen = false });

		while (gen && (attempts < 1000)) {
			this.generate();
			attempts++;
		}
		console.log(attempts, gen);

		eventBus.emit(events.Generator.Generation.Completed, { data: this.system });
	}

	// -------------------------------------------------

	#subscribe() {
		eventBus.on(events.Generator.Generation.Start, () => {
			this.startGeneration();
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
