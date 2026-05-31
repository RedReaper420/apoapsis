
// Originally by Mohsen Fallahnejad (GitHub@mohsenfallahnjd)
class EventBus {
	constructor() { this.map = Object.create(null); }

	on(event, cb) {
		(this.map[event] ||= new Set()).add(cb);
		return () => this.off(event, cb);       // unsubscribe helper
	}

	once(event, cb) {
		const off = this.on(event, (p) => { off(); cb(p) });
		return off;
	}

	off(event, cb) {
		const set = this.map[event]; if (!set) return;
		set.delete(cb); if (set.size === 0) delete this.map[event];
	}

	emit(event, payload) {
		const call = (set) => set && set.forEach(fn => fn(payload));
		// direct
		call(this.map[event]);
		// simple wildcard: "user:*" matches "user:login"
		const star = event.split(':')[0] + ':*';
		call(this.map[star]);
	}
}

export const eventBus = new EventBus();

export const events = Object.freeze({
	Generator: Object.freeze({
		Generate: 'generator:generate',
		Settings: Object.freeze({
			Seed: 'generator:settings_seed',

			ForceHabitable: 'settings_force_habitable',
			LifeChance: 'settings_life_chance',

			JupiterBehavior: 'settings_life_jupiter_behavior',
			PlanetDensity: 'settings_planet_density',

			Star: Object.freeze({
				BinaryChance: 'settings_star_binary_chance',

				MassMin: 'settings_star_mass_min',
				MassMax: 'settings_star_mass_max',
				MassUseIMF: 'settings_star_mass_use_imf',

				MetallicityMin: 'settings_star_metallicity_min',
				MetallicityMax: 'settings_star_metallicity_max',
				MetallicityGaussian: 'settings_star_metallicity_gaussian',
				MetallicityMean: 'settings_star_metallicity_mean',
				MetallicityStD: 'settings_star_metallicity_std',
			}),
		}),
	}),
});