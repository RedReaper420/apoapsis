
import consts from "./consts.js";

export class GenerationSettings {
    constructor(
		seed_user = '',
		seed = '',

		force_habitable = consts.UI_FORCE_HABITABLE_VAL_DEF,
		life_chance = consts.UI_LIFE_CHANCE_VAL_DEF,
		jupiter_behavior = consts.UI_JUPITER_BEHAVIOR_VAL_DEF,
		planet_density = consts.UI_PLANET_DENSITY_VAL_DEF,

		star_mass_min = consts.UI_STAR_MASS_MIN_VAL_DEF,
		star_mass_max = consts.UI_STAR_MASS_MAX_VAL_DEF,
		star_mass_use_imf = consts.UI_STAR_MASS_USE_IMF_VAL_DEF,

		star_metallicity_min = consts.UI_STAR_METALLICITY_MIN_VAL_DEF,
		star_metallicity_max = consts.UI_STAR_METALLICITY_MAX_VAL_DEF,
		star_metallicity_use_gaussian = consts.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF,
		star_metallicity_mean = consts.UI_STAR_METALLICITY_MEAN_VAL_DEF,
		star_metallicity_std = consts.UI_STAR_METALLICITY_STD_VAL_DEF,

    	manual = false,
	) {
		this.seed_user = seed_user;
		this.seed = seed;

		this.force_habitable = force_habitable;
		this.life_chance = life_chance;

		this.jupiter_behavior = jupiter_behavior;

		this.star_mass_min = star_mass_min;
		this.star_mass_max = star_mass_max;
		this.star_mass_use_imf = star_mass_use_imf;

		this.star_metallicity_min = star_metallicity_min;
		this.star_metallicity_max = star_metallicity_max;
		this.star_metallicity_use_gaussian = star_metallicity_use_gaussian;
		this.star_metallicity_mean = star_metallicity_mean;
		this.star_metallicity_std = star_metallicity_std;

		this.planet_density = planet_density;

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

const unit_types = ['dist', 'mass', 'time', 'spd', 'temp'];
const unit_val = new Map([
	// Distance
	['dist_m',         1],
	['dist_km',        1000],
	['dist_au',        149597870700],
	['dist_ly',        9460730472580800],
	['dist_R_sun',     695700e3],
	['dist_R_jupiter', 69886e3],
	['dist_R_earth',   6371e3],
	['dist_R_moon',    1737.4e3],

	// Mass
	['mass_kg',        1],
	['mass_M_sun',     1.988475e30],
	['mass_M_jupiter', 1.898125e27],
	['mass_M_earth',   5.97217e24],
	['mass_M_moon',    7.346e22],

	// Time,
	['time_s',  1],
	['time_h',  1*60*60],
	['time_d',  1*60*60*24],
	['time_mo', 1*60*60*24*30],
	['time_y',  1*60*60*24*365],
	['time_My', 1*60*60*24*365*1e6],
	['time_Gy', 1*60*60*24*365*1e9],

	// Speed
	['spd_ms',  1],
	['spd_kms', 1000],
	['spd_c',   299792458],
]);

export class Value {
	constructor (
		value = 1.0,
		unit = 'mass_kg'
	) {
		this.value = value;
		this.unit = unit;
	}

	getValueAs(targetUnit = '') {
		if (targetUnit === this.unit) return this.value;
		if (targetUnit === '') return this.value;

		// Determining unit types and checking if they're the same
		let unit_type = '';
		let tar_unit_type = '';
		for (let type in unit_types) {
			if (this.unit.startsWith(type)) unit_type = type;
			if (targetUnit.startsWith(type)) tar_unit_type = type;
		}
		if (unit_type !== tar_unit_type) throw new Error(`Incompatable unit types. (Initial: '${unit_type}', Target: '${tar_unit_type}'`);

		// Conversion
		if (unit_type !== 'temp') {
			const si_unit = new Map([
				['dist', 'dist_m'],
				['mass', 'mass_kg'],
				['time', 'time_s'],
				['spd', 'spd_ms']
			]);

			let converted_value = this.value;
			if (this.unit !== si_unit.get(unit_type))
				converted_value *= unit_val.get(this.unit); // From original unit to SI unit]
			converted_value /= unit_val.get(targetUnit); // From SI unit to target unit]
			return converted_value;
		}
		else {
			if (targetUnit == 'temp_k')
				return this.value + (consts.PHY_TEMP_ABSOLUTE_ZERO * -1);
			else
				return this.value - (consts.PHY_TEMP_ABSOLUTE_ZERO * -1);
		}
	}

	convertUnitTo(targetUnit = '') {
		this.value = this.getValueAs(targetUnit);
		this.unit = targetUnit;
	}
}

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
		return 
			this.iron.getDensityAdjusted() +
			this.rock.getDensityAdjusted() +
			this.ice.getDensityAdjusted() +
			this.gas.getDensityAdjusted();
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

		mass = new Value(1.0, 'mass_M_sun'),
		metallicity = 0.0, // Fe/H
		radius = new Value(1.0, 'dist_R_sun'),
		luminosity = 1.0, // in solar luminocities
		temperature = new Value(consts.PHY_SUN_TEMPERATURE, 'temp_k'),
		type = 'G2',

		abs_mag = 4.83,
		bv = 0.046,
		color = '#FFF5DC',

		lifespan = new Value(consts.PHY_SUN_LIFESPAN, 'time_Gyr'),
		age = new Value(consts.PHY_SUN_LIFESPAN * 0.46, 'time_Gyr'),
	) {
		super(parentBody, name);

		this.mass = mass;
		this.metallicity = metallicity;
		this.luminosity = luminosity;
		this.radius = radius;
		this.temperature = temperature;
		this.type = type;

		this.abs_mag = abs_mag;
		this.bv = bv;
		this.color = color;

		this.lifespan = lifespan;
		this.age = age;
	}
}

export class Planet extends Body {
	constructor (
		parentBody = null,

		mass = new Value(1.0, 'mass_M_earth'),

		name = 'Terra',
	) {
		super();

		// WIP
	}
}

export class Binary extends Body {
	constructor (
		primary = null,
		secondary = null,
		sma = new Value(1, 'dist_au'),
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
		sma = new Value(15, 'dist_au'),
	) {
		super(primary, secondary, sma);

		this.combineProperties();
	}
	
	combineProperties() {
		this.mass = new Value(
			this.primary.mass.getValueAs('mass_M_sun') + this.secondary.mass.getValueAs('mass_M_sun'), 
			'mass_M_sun'); // Combined value
		this.luminosity = this.primary.luminosity + this.secondary.luminosity; // Combined value
		this.metallicity = (this.primary.metallicity + this.secondary.metallicity) / 2; // Mean value
		this.age = this.primary.age; // Equal values, first taken
	}
}

export class BinaryPlanet extends Binary {
	constructor (
		primary = new Planet(),
		secondary = new Planet(),
		sma = new Value(500000, 'dist_km'),
	) {
		super(primary, secondary, sma);
	}

	combineProperties() {
		
	}
}