
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

export class Body {
	constructor (
		parentBody = null,

		mass = 1.0,
		mass_unit = 'm_kg',

		name = 'Spaceball',
	) {
		this.parentBody = parentBody;

		this.mass = mass;

		this.name = name;
	}
}

export class Star extends Body {
	constructor (
		parentBody = null,

		mass = 1.0,
		mass_unit = 'm_s',
		metallicity = 0.0, // Fe/H
		radius = 1.0,
		radius_unit = 'r_s',
		luminosity = 1.0, // in solar luminocities
		temperature = 5772.0,
		temperature_unit = 'k',
		type = 'G2',

		abs_mag = 4.83,
		bv = 0.046,
		color = '#FFF5DC',

		lifespan = 10.0, // in Byr
        age = 0.46, // 0..1 of lifespan

		name = 'Sol',
	) {
		super(parentBody, mass, mass_unit, name);

		this.metallicity = metallicity;
		this.luminosity = luminosity;
		this.radius = radius;
		this.radius_unit = radius_unit;
		this.temperature = temperature;
		this.temperature_unit = temperature_unit;
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

		mass = 1.0,
		mass_unit = 'm_e',

		name = 'Terra',
	) {
		super();

		// WIP
	}
}
