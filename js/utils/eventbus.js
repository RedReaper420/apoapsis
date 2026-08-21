
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

//-----------------------------------------------------------

export const eventBus = new EventBus();

export const events = Object.freeze({
	Generator: Object.freeze({
		Generation: Object.freeze({
			Start:			'generator:generation_start',
			Completed:		'generator:generation_completed',
		}),
		
		Settings: Object.freeze({
			Seed:						'generator:settings_seed',

			Star: Object.freeze({
				BinaryChance:			'settings_star_binary_chance',

				MassMin:				'settings_star_mass_min',
				MassMax:				'settings_star_mass_max',
				MassUseIMF:				'settings_star_mass_use_imf',

				MetallicityMin:			'settings_star_metallicity_min',
				MetallicityMax:			'settings_star_metallicity_max',
				MetallicityGaussian:	'settings_star_metallicity_gaussian',
				MetallicityMean:		'settings_star_metallicity_mean',
				MetallicityStD:			'settings_star_metallicity_std',
			}),

			Planet: Object.freeze({
				amountMultiplier:		'settings_planet_amount_multiplier',

				sTypeSafetyFactor:		'settings_planet_s_type_safety_factor',
				pTypeSafetyFactor:		'settings_planet_p_type_safety_factor',
				pTypeEnabled:			'settings_planet_p_type_enabled',
				
				type1MigrationEnabled:	'settings_planet_migration_type_1_enabled',
				type1MigrationCoeff:	'settings_planet_migration_type_1_coeff',
				type2MigrationEnabled:	'settings_planet_migration_type_2_enabled',
				type2MigrationCoeff:	'settings_planet_migration_type_2_coeff',
				migrationInterpolated:	'settings_planet_migration_interpolated',
				grandTackChance:		'settings_planet_migration_grand_tack_chance',
				hillSafetyFactor:		'settings_planet_migration_hill_safety_factor',
			}),
		}),
	}),
});
