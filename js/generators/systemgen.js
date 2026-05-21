
import eventBus from "../utils/eventbus.js";
import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import * as stargen from "./stargen.js";

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

	generate() {
		this.settings.seed = !this.settings.seed_user ? +new Date() : this.settings.seed_user;
		prng.seed(this.settings.seed);

		this.system = new types.System(this.settings);
		this.system.bodies.push(stargen.generateStar(this.settings));

		console.log(JSON.stringify(this.system, null, "\t"));
	}
}

const systemGenerator = new SystemGenerator();
export default systemGenerator;
