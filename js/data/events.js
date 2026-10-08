
const events = Object.freeze({
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
				MetallicityGaussian:	'settings_star_metallicity_use_gaussian',
				MetallicityMean:		'settings_star_metallicity_mean',
				MetallicityStD:			'settings_star_metallicity_std',

				AgeUnbound:				'settings_star_age_unbound'
			}),

			PlanetOrbit: Object.freeze({
				sTypeSafetyFactor:		'settings_planet_orbit_s_type_safety_factor',
				pTypeSafetyFactor:		'settings_planet_orbit_p_type_safety_factor',
				pTypeEnabled:			'settings_planet_orbit_p_type_enabled',
				
				type1MigrationEnabled:	'settings_planet_orbit_migration_type_1_enabled',
				type1MigrationCoeff:	'settings_planet_orbit_migration_type_1_coeff',
				type2MigrationEnabled:	'settings_planet_orbit_migration_type_2_enabled',
				type2MigrationCoeff:	'settings_planet_orbit_migration_type_2_coeff',
				migrationInterpolated:	'settings_planet_orbit_migration_interpolated',
				grandTackChance:		'settings_planet_orbit_migration_grand_tack_chance',
				hillSafetyFactor:		'settings_planet_orbit_migration_hill_safety_factor',
			}),

			Planet: Object.freeze({
				amountMultiplier:		'settings_planet_amount_multiplier',
				bonusGiantImpactChance:	'settings_planet_giant_impact_chance',
				maxBonusGiantImpacts:	'settings_planet_max_bonus_giant_impacts',
				binaryChance: 			'settings_planet_binary_chance',
				lifeChance:				'settings_planet_life_chance',
			}),
		}),
	}),

	Load: Object.freeze({
		Settings:	'load_settings',
		System:		'load_system',
	}),

	UI: Object.freeze({
		ButtonClick:	'ui_button_click',
		SettingToggle:	'ui_setting_toggle',
		SettingsOverlayToggle: 'ui_settings_overlay_toggle',
	}),
});

export default events;
