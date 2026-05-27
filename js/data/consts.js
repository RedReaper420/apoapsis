
class Consts {
	constructor () {
		this.PHY_STAR_MASS_MIN = 0.08; // in solar masses
		this.PHY_STAR_MASS_MAX = 150.0;
		
		this.PHY_STAR_METALLICITY_MIN = -3.0; // in Fe/H
		this.PHY_STAR_METALLICITY_MAX = 2.0;

		this.PHY_SUN_LIFESPAN = 10; // in Gyr
		this.PHY_SUN_TEMPERATURE = 5772.0; // in K

		this.DEF_BINARY_SYSTEM_MASS_RATIO = 0.1 // 1:10 or greater mass ratio qualifies planetary system as "binary", otherwise hierarchical (planet and moon)

		this.PHY_DENSITY_IRON = 8.0;
		this.PHY_DENSITY_ROCK = 2.7;
		this.PHY_DENSITY_ICE = 0.9;
		this.PHY_DENSITY_GAS = 0.2;

		this.PHY_TEMP_ABSOLUTE_ZERO = -273.15;
		this.PHY_G = 6.6743015e-11;

		// ---

		this.UI_FORCE_HABITABLE_VAL_DEF = false;

		this.UI_LIFE_CHANCE_LIM_MIN = 0.0;
		this.UI_LIFE_CHANCE_LIM_MAX = 1.0,
		this.UI_LIFE_CHANCE_VAL_DEF = 0.8;

		this.UI_JUPITER_BEHAVIOR_VAL_DEF = 'random';

		this.UI_PLANET_DENSITY_LIM_MIN = 0.1;
		this.UI_PLANET_DENSITY_LIM_MAX = 5.0;
		this.UI_PLANET_DENSITY_VAL_DEF = 1.0;

		this.UI_STAR_MASS_LIM_MIN = this.PHY_STAR_MASS_MIN;
		this.UI_STAR_MASS_LIM_MAX = this.PHY_STAR_MASS_MAX;
		this.UI_STAR_MASS_MIN_VAL_DEF = this.UI_STAR_MASS_LIM_MIN;
		this.UI_STAR_MASS_MAX_VAL_DEF = this.UI_STAR_MASS_LIM_MAX;

		this.UI_STAR_MASS_USE_IMF_VAL_DEF = true;

		this.UI_STAR_METALLICITY_LIM_MIN = this.PHY_STAR_METALLICITY_MIN;
		this.UI_STAR_METALLICITY_LIM_MAX = this.PHY_STAR_METALLICITY_MAX;
		this.UI_STAR_METALLICITY_MIN_VAL_DEF = -2.0;
		this.UI_STAR_METALLICITY_MAX_VAL_DEF = 0.5;

		this.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF = true;

		this.UI_STAR_METALLICITY_MEAN_VAL_DEF = -0.05;

		this.UI_STAR_METALLICITY_STD_LIM_MIN = 0.0;
		this.UI_STAR_METALLICITY_STD_VAL_DEF = 0.35;
	}
}

const consts = Object.freeze(new Consts());

export default consts;
