
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as starsystemgen from "./starsystemgen.js";
import * as planetsystemgen from "./planetsystemgen.js";
import * as planetgen from "./planetgen.js";
import { randomRangeGaussian } from "../utils/utils.js";

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

	generate() {
		//this.settings.seed_user = '1781282712859';

		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);
		this.system = new types.System(this.settings);

		console.log(this.settings.seed);

		const stars = [];

		// Generating the primary single/binary star
		starsystemgen.generateStarFormation(this.system, null, stars);

		// Generating the secondary single/binary star on a wide orbit
		if (starsystemgen.decideStarBinary(this.settings.star_binary_chance))
			starsystemgen.generateStarFormation(this.system, this.system.bodies[0], stars);

		// Planets generation around the star(s)
		stars.forEach(star => { planetsystemgen.generatePlanets(star, this.settings); });

		// Migration simulation
		planetsystemgen.simulateMigration(this.settings, stars);
		
		function finishPlanetgen(body) {
			if (body instanceof types.Planet) planetgen.finishGeneration(body);

			body.bodies.forEach(child => { finishPlanetgen(child); });

			if (body instanceof types.BinaryStar) {
				finishPlanetgen(body.primary);
				finishPlanetgen(body.secondary);
			}
		}

		this.system.bodies.forEach(body => {
			finishPlanetgen(body);
		});
		
		console.log(this.system);
		console.log('-------')
		//console.log(JSON.stringify(this.system, null, "\t"));

		eventBus.emit(events.Generator.Finished, { data: this.system });
		/*
		const bodyList = [];
		
		console.log(bodyList);
		*/
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
