
import consts from "./consts.js";

// =================================================
// Units
// =================================================

/**
 * Enum for available units.
 * 
 * @readonly
 * @enum {string}
 * 
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
	 * A value with an assigned unit (convertable).
	 * @param {number} value - Numeric value.
	 * @param {string} unit - Unit name. Use `units` enum to assssign (`types.units.GROUP.UNIT`).
	 */
	constructor (value, unit) {
		this.value = value;
		this.unit = unit;
	}

	/**
	 * Gets a raw number value converted to a specified unit.
	 * @param {string} targetUnit - Unit enum (`types.units.GROUP.UNIT`).
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

	/**
	 * Converts value object's unit to a new specified one (of the same unit type).
	 * @param {string} targetUnit - Unit enum (`types.units.GROUP.UNIT`).
	 * @returns {Value}
	 */
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
		planet_migration_grand_tack_chance = consts.UI_PLANET_MIGRATION_GRAND_TACK_CHANCE_VAL_DEF,
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
		this.planet_migration_grand_tack_chance = planet_migration_grand_tack_chance;
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



// =================================================
// Celestial bodies
// =================================================

export class Body {
	constructor (parentBody = null, name = 'Spaceball') {
		this.parentBody = parentBody;
		this.name = name;

		this.bodies = [];
		this.sma = new Value(1.26, units.Dist.AU);
		this.eccentricity = -1;
		this.orbit = new Orbit();

		this.mass = new Value(1.0, units.Mass.kg);
		this.radius = new Value(1.0, units.Dist.m);
		this.density = 1.0;
		this.temperature = new Value(2.73, units.Temp.K);
	}
}

export class Orbit {
	constructor() {
		this.a = 0;
		this.e = 0;
		this.i = 0;
		this.Omega = 0;
		this.w = 0;
		this.M0 = 0;
		this.n = 0;
	}

	/**
	 * Calculates and sets mean motion value for the body.
	 * 
	 * @param {Star|BinaryStar|Planet|BinaryPlanet} body 
	 * 
	 * @returns {number} mean motion `n`. (rad/s)
	 */
	calculateMeanMotion(body) {
		if (body.parentBody === null) {
			this.n = 0;
			return 0;
		}
		
		let host = body.parentBody;
		if (body.parentBody instanceof Binary) {
			if (body.parentBody.primary === body)
				host = body.parentBody.secondary;
			else if (body.parentBody.secondary === body)
				host = body.parentBody.primary;
		}
		const bodyMass = body.mass.getValueAs(units.Mass.kg);
		const hostMass = host.mass.getValueAs(units.Mass.kg);

		this.n = Math.sqrt((consts.PHY_G * (hostMass + bodyMass)) / (this.a ** 3));
		return this.n;
	}
}

export class Star extends Body {
	constructor (parentBody = null, name = 'Sol') {
		super(parentBody, name);

		this.mass = new Value(1.0, units.Mass.M_Sun);
		this.radius = new Value(1.0, units.Dist.R_Sun);
		this.density = 1.409;
		this.temperature = new Value(consts.PHY_SUN_TEMP, units.Temp.K);

		this.lifespan = new Value(consts.PHY_SUN_LIFESPAN, units.Time.Gy);
		this.age = new Value(consts.PHY_SUN_LIFESPAN * 0.46, units.Time.Gy);
		this.metallicity = 0.0;
		this.luminosity = 1.0;
		this.type = 'G2';
		this.absMag = 4.83;
		this.bv = 0.046;
		this.color = '#FFF5DC';
	}
}

export const planetTypes = Object.freeze({
	Terrestrial: 'Terrestrial',

	MiniNeptune: 'Mini-Neptune',
	GasDwarf: 'Gas Dwarf',

	IceGiant: 'Ice Giant',
	GasGiant: 'Gas Giant',
	
	BrownDwarf: 'Brown Dwarf',
});

export const moonTypes = Object.freeze({
	Binary: 'Binary',
	Impact: 'Impact',
	Regular: 'Regular'
});

export const migrationStatus = Object.freeze({
	Still: '',
	Ejected: 'Ejected',
	Merged: 'Merged',
});

export class Planet extends Body {
	constructor (parentBody = null, name = 'Terra') {
		super(parentBody, name);

		this.mass = new Value(1.0, units.Mass.M_Earth);
		this.radius = new Value(1.0, units.Dist.R_Earth);
		this.density = consts.PHY_EARTH_DENSITY;
		this.temperature = new Value(14, units.Temp.C);

		this.core = new Core();
		this.envelope = new Envelope();

		this.type = planetTypes.Terrestrial;
		this.rings = [];
		this.genData = {};
		this.hasLife = false;
	}
}

// -------------------------------------------------



// =================================================
// Binary containers
// =================================================


export class Binary extends Body {
	constructor (
		primary = null,
		secondary = null,
		sma = new Value(1, units.Dist.AU),
	) {
		super(null, `${primary.name}-${secondary.name}`);

		this.primary = primary;
		this.primary.parentBody = this;
		this.primary.sma = sma;
		
		this.secondary = secondary;
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
		this.temperature = new Value(Math.max(
			this.primary.temperature.getValueAs(units.Temp.K),
			this.secondary.temperature.getValueAs(units.Temp.K)
		), units.Temp.K); // Max value
		this.age = this.primary.age; // Equal values, first taken
		this.metallicity = (this.primary.metallicity + this.secondary.metallicity) / 2; // Mean value
		this.luminosity = this.primary.luminosity + this.secondary.luminosity; // Combined value
	}
}

export class BinaryPlanet extends Binary {
	constructor (
		primary = new Planet(),
		secondary = new Planet(),
		sma = new Value(420000, units.Dist.km),
	) {
		super(primary, secondary, sma);

		this.combineProperties();
	}

	combineProperties() {
		this.mass = new Value(
			this.primary.mass.getValueAs(units.Mass.M_Earth) + this.secondary.mass.getValueAs(units.Mass.M_Earth), 
			units.Mass.M_Earth); // Combined value
		this.genData = {
			impacts: this.primary.genData.impacts,
			sma_init: this.primary.genData.sma_init,
			parentStar: this.primary.genData.parentStar,
		};
		this.radius = this.primary.radius;
		this.core = this.primary.core;
		this.rings = [];
	}
}

// -------------------------------------------------



// =================================================
// Planets components
// =================================================

export class MassComponent {
	/**
	 * 
	 * @param {Value} mass - Mass component's mass (unit: `Mass`).
	 */
	constructor (mass) {
		this.mass = mass;
		this.composition = { };
	}
}

export class Core extends MassComponent {
	/**
	 * 
	 * @param {Value} mass - Core's mass (unit: `Mass`).
	 * @param {number} f_iron - Iron fraction in the core (0.0-1.0).
	 * @param {number} f_rock - Rock fraction in the core (0.0-1.0).
	 * @param {number} f_ice - Ice fraction in the core (0.0-1.0).
	 */
	constructor (mass=new Value(1.0, units.Mass.M_Earth), f_iron=0.20, f_rock=0.79, f_ice=0.01) {
		super(mass);
		
		this.composition = new CoreComposition(f_iron, f_rock, f_ice);
	}
}

export class CoreComposition {
	/**
	 * 
	 * @param {number} f_iron - Iron fraction in the core (0.0-1.0).
	 * @param {number} f_rock - Rock fraction in the core (0.0-1.0).
	 * @param {number} f_ice - Ice fraction in the core (0.0-1.0).
	 */
	constructor (f_iron, f_rock, f_ice) {
		this.iron = f_iron;
		this.rock = f_rock;
		this.ice = f_ice;
	}
}

export class Envelope extends MassComponent {
	/**
	 * 
	 * @param {Value} mass - Envelope's mass (unit: `Mass`).
	 * @param {number} f_gas - Gas fraction in the envelope (0.0-1.0).
	 * @param {number} f_ice - Ice fraction in the envelope (0.0-1.0).
	 */
	constructor (mass=new Value(0.0, units.Mass.M_Earth), f_gas=0.9, f_ice=0.1) {
		super(mass);

		this.composition = new EnvelopeComposition(f_gas, f_ice);
	}
}

export class EnvelopeComposition {
	/**
	 * 
	 * @param {number} f_gas - Gas fraction in the envelope (0.0-1.0).
	 * @param {number} f_ice - Ice fraction in the envelope (0.0-1.0).
	 */
	constructor (f_gas, f_ice) {
		this.gas = f_gas;
		this.ice = f_ice;
	}
}

export class RingSystem {
	constructor (
		innerRadius = new Value(1.5, units.Dist.R_Jupiter), 
		outerRadius = new Value(120000, units.Dist.km), 
		originMass = new Value(1.2, units.Mass.M_Moon), 
		albedo = 0.5
	) {
		this.innerRadius = innerRadius;
		this.outerRadius = outerRadius;
		this.originMass = originMass;
		this.albedo = albedo;
	}
}

// -------------------------------------------------
