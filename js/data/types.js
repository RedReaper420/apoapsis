
import consts from "./consts.js";

// =================================================
// Units
// =================================================

/**
 * Enum for available units.
 * @readonly
 * @enum {string}
 * @see {@link Value}
 */
export const units = Object.freeze({
	Dist: Object.freeze({
		m: 'dist_m',
		km: 'dist_km',
		AU: 'dist_au',
		ly: 'dist_ly',
		R_Sun: 'dist_R_sun',
		R_Jupiter: 'dist_R_jupiter',
		R_Earth: 'dist_R_earth',
		R_Moon: 'dist_R_moon'
	}),
	Mass: Object.freeze({
		kg: 'mass_kg',
		M_Sun: 'mass_M_sun',
		M_Jupiter: 'mass_M_jupiter',
		M_Earth: 'mass_M_earth',
		M_Moon: 'mass_M_moon',
		M_Earth_atm: 'mass_M_Earth_atm',
	}),
	Time: Object.freeze({
		s: 'time_s',
		h: 'time_h',
		d: 'time_d',
		mo: 'time_mo',
		y: 'time_y',
		My: 'time_My',
		Gy: 'time_Gy'
	}),
	Spd: Object.freeze({
		m_s: 'spd_m_s',
		km_s: 'spd_km_s',
		km_h: 'spd_km_h',
		c: 'spd_c'
	}),
	Temp: Object.freeze({
		K: 'temp_k',
		C: 'temp_c'
	}),
	GROUPS: Object.freeze({
		Dist: 'dist',
		Mass: 'mass',
		Time: 'time',
		Spd: 'spd',
		Temp: 'temp'
	})
});

const unitTypes = [units.GROUPS.Dist, units.GROUPS.Mass, units.GROUPS.Time, units.GROUPS.Spd, units.GROUPS.Temp];
const unitValues = new Map([
	// Distance
	[units.Dist.m,         1],
	[units.Dist.km,        1000],
	[units.Dist.AU,        149597870700],
	[units.Dist.ly,        9460730472580800],
	[units.Dist.R_Sun,     695700e3],
	[units.Dist.R_Jupiter, 69886e3],
	[units.Dist.R_Earth,   6371e3],
	[units.Dist.R_Moon,    1737.4e3],

	// Mass
	[units.Mass.kg,          1],
	[units.Mass.M_Sun,       1.988475e30],
	[units.Mass.M_Jupiter,   1.898125e27],
	[units.Mass.M_Earth,     5.97217e24],
	[units.Mass.M_Moon,      7.346e22],
	[units.Mass.M_Earth_atm, 5.15e18],

	// Time,
	[units.Time.s,  1],
	[units.Time.h,  1*60*60],
	[units.Time.d,  1*60*60*24],
	[units.Time.mo, 1*60*60*24*30],
	[units.Time.y,  1*60*60*24*365],
	[units.Time.My, 1*60*60*24*365*1e6],
	[units.Time.Gy, 1*60*60*24*365*1e9],

	// Speed
	[units.Spd.m_s,  1],
	[units.Spd.km_s, 1000],
	[units.Spd.km_h, 1/3.6],
	[units.Spd.c,    299792458],
]);

export class Value {
	/**
	 * A value with the assigned unit (convertable)
	 * @param {number} value 
	 * @param {string} unit - <types.units.GROUP.UNIT>
	 */
	constructor (value, unit) {
		this.value = value;
		this.unit = unit;
	}

	/**
	 * Get the raw number value converted to the specified unit.
	 * @param {string} targetUnit - <types.units.GROUP.UNIT>
	 * @returns {number}
	 */
	getValueAs(targetUnit) {
		if (targetUnit === undefined) return this.value;
		if (targetUnit === this.unit) return this.value;

		// Determining unit types and checking if they're the same
		let unitType = ''; let tarUnitType = '';
		unitTypes.forEach(type => {
			if (this.unit.startsWith(type)) unitType = type;
			if (targetUnit.startsWith(type)) tarUnitType = type;
		});
		if (unitType !== tarUnitType)
			throw new Error(`Incompatable unit types. (Initial: '${unitType}', Target: '${tarUnitType}')`);

		// Conversion
		if (unitType === units.GROUPS.Temp) {
			// Temperature conversion
			if (targetUnit == units.Temp.K)
				return this.value + (consts.PHY_TEMP_ABSOLUTE_ZERO * -1); // C -> K
			else
				return this.value - (consts.PHY_TEMP_ABSOLUTE_ZERO * -1); // K -> C
		}
		else {
			// Other types conversion
			const siUnit = new Map([
				[units.GROUPS.Dist, units.Dist.m],
				[units.GROUPS.Mass, units.Mass.kg],
				[units.GROUPS.Time, units.Time.s],
				[units.GROUPS.Spd, units.Spd.m_s]
			]);

			let convertedValue = this.value;
			if (this.unit !== siUnit.get(unitType))
				convertedValue *= unitValues.get(this.unit); // From original unit to SI unit
			convertedValue /= unitValues.get(targetUnit); // From SI unit to target unit
			return convertedValue;
		}
	}

	convertUnitTo(targetUnit) {
		if (targetUnit !== this.unit) {
			this.value = this.getValueAs(targetUnit);
			this.unit = targetUnit;
		}
		return this;
	}
}

// -------------------------------------------------



// =================================================
// Generation Settings
// =================================================

export class GenerationSettings {
    constructor(
		seed_user = '',
		seed = '',

		// Stars settings

		star_binary_chance = consts.UI_STAR_BINARY_CHANCE_VAL_DEF,

		star_mass_use_imf = consts.UI_STAR_MASS_USE_IMF_VAL_DEF,
		star_mass_min = consts.UI_STAR_MASS_MIN_VAL_DEF,
		star_mass_max = consts.UI_STAR_MASS_MAX_VAL_DEF,

		star_metallicity_min = consts.UI_STAR_METALLICITY_MIN_VAL_DEF,
		star_metallicity_max = consts.UI_STAR_METALLICITY_MAX_VAL_DEF,
		star_metallicity_use_gaussian = consts.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF,
		star_metallicity_mean = consts.UI_STAR_METALLICITY_MEAN_VAL_DEF,
		star_metallicity_std = consts.UI_STAR_METALLICITY_STD_VAL_DEF,

		// Planets settings

		planet_amount_multiplier = consts.UI_PLANET_AMOUNT_MULT_VAL_DEF,

		planet_s_type_safety_factor = consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_VAL_DEF,
		planet_p_type_enabled = consts.UI_PLANET_P_TYPE_ENABLED_VAL_DEF,
		planet_p_type_safety_factor = consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_VAL_DEF,

		planet_migration_type_1_enabled = consts.UI_PLANET_MIGRATION_TYPE_1_ENABLED_VAL_DEF,
		planet_migration_type_1_coeff = consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_VAL_DEF,
		planet_migration_type_2_enabled = consts.UI_PLANET_MIGRATION_TYPE_2_ENABLED_VAL_DEF,
		planet_migration_type_2_coeff = consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_VAL_DEF,
		planet_migration_interpolated = consts.UI_PLANET_MIGRATION_INTERPOLATED_VAL_DEF,
		planet_migration_grand_tack_enabled = consts.UI_PLANET_MIGRATION_GRAND_TACK_ENABLED_VAL_DEF,
		planet_migration_hill_safety_factor = consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_VAL_DEF,

		// ---

    	manual = false,
	) {
		this.seed_user = seed_user;
		this.seed = seed;

		// Stars settings

		this.star_binary_chance = star_binary_chance;

		this.star_mass_use_imf = star_mass_use_imf;
		this.star_mass_min = star_mass_min;
		this.star_mass_max = star_mass_max;

		this.star_metallicity_min = star_metallicity_min;
		this.star_metallicity_max = star_metallicity_max;
		this.star_metallicity_use_gaussian = star_metallicity_use_gaussian;
		this.star_metallicity_mean = star_metallicity_mean;
		this.star_metallicity_std = star_metallicity_std;

		// Planets settings

		this.planet_amount_multiplier = planet_amount_multiplier;

		this.planet_s_type_safety_factor = planet_s_type_safety_factor;
		this.planet_p_type_enabled = planet_p_type_enabled;
		this.planet_p_type_safety_factor = planet_p_type_safety_factor;

		this.planet_migration_type_1_enabled = planet_migration_type_1_enabled;
		this.planet_migration_type_1_coeff = planet_migration_type_1_coeff;
		this.planet_migration_type_2_enabled = planet_migration_type_2_enabled;
		this.planet_migration_type_2_coeff = planet_migration_type_2_coeff;
		this.planet_migration_interpolated = planet_migration_interpolated;
		this.planet_migration_grand_tack_enabled = planet_migration_grand_tack_enabled;
		this.planet_migration_hill_safety_factor = planet_migration_hill_safety_factor;

		// ---

        this.manual = manual;
	}
}

export class System {
	constructor(
		settings = new GenerationSettings()
	) {
		this.settings = settings;
		this.bodies = [];
	}
}

// -------------------------------------------------



export class CompositionElement {
	constructor (amount, density) {
		this.amount = amount;
		this.density = density;
	}
	
	getDensityAdjusted() {
		return this.density * this.amount;
	}
}

export class Composition {
	constructor (
		iron_amount = 0.2,
		rock_amount = 0.8,
		ice_amount = 0.0,
		gas_amount = 0.0,
	) {
		this.iron = new CompositionElement(iron_amount, consts.PHY_DENSITY_IRON);
		this.rock = new CompositionElement(rock_amount, consts.PHY_DENSITY_ROCK);
		this.ice = new CompositionElement(ice_amount, consts.PHY_DENSITY_ICE);
		this.gas = new CompositionElement(gas_amount, consts.PHY_DENSITY_GAS);
	}

	getDensity() {
		return (
			this.iron.getDensityAdjusted() +
			this.rock.getDensityAdjusted() +
			this.ice.getDensityAdjusted() +
			this.gas.getDensityAdjusted()
		);
	}
}

export class Body {
	constructor (
		parentBody = null,
		name = 'Spaceball',
		bodies = [],
	) {
		this.parentBody = parentBody;
		this.name = name;
		this.bodies = bodies;
	}
}

export class Star extends Body {
	constructor (
		parentBody = null,
		name = 'Sol',

		mass = new Value(1.0, units.Mass.M_Sun),
		metallicity = 0.0, // Fe/H
		radius = new Value(1.0, units.Dist.R_Sun),
		density = 1.409,
		luminosity = 1.0, // in solar luminocities
		temperature = new Value(consts.PHY_SUN_TEMP, units.Temp.K),
		type = 'G2',

		absMag = 4.83,
		bv = 0.046,
		color = '#FFF5DC',

		lifespan = new Value(consts.PHY_SUN_LIFESPAN, units.Time.Gy),
		age = new Value(consts.PHY_SUN_LIFESPAN * 0.46, units.Time.Gy),
	) {
		super(parentBody, name);

		this.mass = mass;
		this.metallicity = metallicity;
		this.luminosity = luminosity;
		this.radius = radius;
		this.density = density;
		this.temperature = temperature;
		this.type = type;

		this.absMag = absMag;
		this.bv = bv;
		this.color = color;

		this.lifespan = lifespan;
		this.age = age;
	}
}

export class Planet extends Body {
	constructor (
		parentBody = null,

		mass = new Value(1.0, units.Mass.M_Earth),

		name = 'Terra',
	) {
		super(parentBody, name);

		// WIP
	}
}

export class Binary extends Body {
	constructor (
		primary = null,
		secondary = null,
		sma = new Value(1, units.Dist.AU),
	) {
		super(null, `${primary.name}-${secondary.name}`);

		this.primary = primary;
		this.secondary = secondary;

		this.primary.parentBody = this;
		this.primary.sma = sma;
		this.secondary.parentBody = this;
		this.secondary.sma = sma;
	}
}

export class BinaryStar extends Binary {
	constructor (
		primary = new Star(),
		secondary = new Star(),
		sma = new Value(15, units.Dist.AU),
	) {
		super(primary, secondary, sma);

		this.combineProperties();
	}
	
	combineProperties() {
		this.mass = new Value(
			this.primary.mass.getValueAs(units.Mass.M_Sun) + this.secondary.mass.getValueAs(units.Mass.M_Sun), 
			units.Mass.M_Sun); // Combined value
		this.luminosity = this.primary.luminosity + this.secondary.luminosity; // Combined value
		this.metallicity = (this.primary.metallicity + this.secondary.metallicity) / 2; // Mean value
		this.age = this.primary.age; // Equal values, first taken
		this.temperature = new Value(Math.max(
			this.primary.temperature.getValueAs(units.Temp.K),
			this.secondary.temperature.getValueAs(units.Temp.K)
		), units.Temp.K); // Max value
	}
}

export class BinaryPlanet extends Binary {
	constructor (
		primary = new Planet(),
		secondary = new Planet(),
		sma = new Value(500000, units.Dist.km),
	) {
		super(primary, secondary, sma);
	}

	combineProperties() {
		
	}
}
