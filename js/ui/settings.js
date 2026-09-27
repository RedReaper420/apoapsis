
import {events, eventBus} from "../utils/eventbus.js";
import consts from "../data/consts.js";

/**
 * 
 * @param {string} tab 
 * @param {string} labelText 
 * @param {string} id 
 * @param {string} type 
 * @param {object} values 
 * @param {string} options 
 */
function generateSetting(tab, labelText, id, type, values, options) {
	const tabElement = document.getElementById(tab);
	
	const settingContainer = document.createElement('div');
	settingContainer.classList.add('setting-container');

	const labelElement = document.createElement('label');
	labelElement.for = id;
	labelElement.innerText = labelText + ':';
	settingContainer.appendChild(labelElement);
	
	const inputElement = document.createElement('input');
	inputElement.type = type;
	inputElement.name = id;
	inputElement.id = id;
	if (type === "number") { inputElement.step = 0.1; }
	for (const opt in options) { inputElement.setAttribute(opt, options[opt]); }
	settingContainer.appendChild(inputElement);

	setupSetting(inputElement, id, values);
	
	const resetButton = document.createElement('button');
	resetButton.innerText = '↺';
	resetButton.classList.add('reset');
	if (type !== 'checkbox') {
		resetButton.onclick = () => { 
			inputElement.value = values.def;
			inputElement.dispatchEvent(new Event('input'));
		}
	}
	else {
		resetButton.onclick = () => { 
			inputElement.checked = values.def;
			inputElement.dispatchEvent(new Event('input'));
		}
	}
	settingContainer.appendChild(resetButton);
	tabElement.appendChild(settingContainer);
}

/**
 * @param {HTMLElement} element 
 * @param {string} event 
 * @param {object} values 
 */
function setupSetting(element, event, values) {
	const defaultValue = values.def;
	const limitMin = values.min;
	const limitMax = values.max;

	if (element.type === 'checkbox') {
		element.addEventListener('input', (e) => {
			eventBus.emit(event, { data: e.currentTarget.checked });
		});
		element.checked = defaultValue;
	}
	else {
		element.addEventListener('input', (e) => {
			eventBus.emit(event, { data: Number(e.currentTarget.value) });
		});
		if (limitMin !== undefined) element.min = limitMin;
		if (limitMax !== undefined) element.max = limitMax;
		element.value = defaultValue;
	}
}

// Seed field
const gen_seed = document.getElementById('gen_seed');
gen_seed.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Seed, { data: e.currentTarget.value });
});

// ====================================================
// STARS
// ====================================================

// Binary star chance field
generateSetting(
	'tab_Stars', 
	'Binary star chance',
	events.Generator.Settings.Star.BinaryChance, 
	'number',
	{
		def: consts.UI_STAR_BINARY_CHANCE_VAL_DEF,
		min: consts.UI_STAR_BINARY_CHANCE_LIM_MIN,
		max: consts.UI_STAR_BINARY_CHANCE_LIM_MAX
	},
	{}
);

// Min star mass field
generateSetting(
	'tab_Stars', 
	'Minimum star mass',
	events.Generator.Settings.Star.MassMin, 
	'number',
	{
		def: consts.UI_STAR_MASS_MIN_VAL_DEF,
		min: consts.UI_STAR_MASS_LIM_MIN,
		max: consts.UI_STAR_MASS_LIM_MAX
	},
	{}
);

// Max star mass field
generateSetting(
	'tab_Stars', 
	'Maximum star mass',
	events.Generator.Settings.Star.MassMax, 
	'number',
	{
		def: consts.UI_STAR_MASS_MAX_VAL_DEF,
		min: consts.UI_STAR_MASS_LIM_MIN,
		max: consts.UI_STAR_MASS_LIM_MAX
	},
	{}
);

// Use IMF mass sampling toggle
generateSetting(
	'tab_Stars', 
	'Use IMF',
	events.Generator.Settings.Star.MassUseIMF, 
	'checkbox',
	{
		def: consts.UI_STAR_MASS_USE_IMF_VAL_DEF
	},
	{}
);

// Min star metallicity field
generateSetting(
	'tab_Stars', 
	'Minimum star metallicity',
	events.Generator.Settings.Star.MetallicityMin,
	'number', 
	{
		def: consts.UI_STAR_METALLICITY_MIN_VAL_DEF,
		min: consts.UI_STAR_METALLICITY_LIM_MIN,
		max: consts.UI_STAR_METALLICITY_LIM_MAX
	},
	{}
);

// Max star metallicity field
generateSetting(
	'tab_Stars', 
	'Maximum star metallicity',
	events.Generator.Settings.Star.MetallicityMax, 
	'number',
	{
		def: consts.UI_STAR_METALLICITY_MAX_VAL_DEF,
		min: consts.UI_STAR_METALLICITY_LIM_MIN,
		max: consts.UI_STAR_METALLICITY_LIM_MAX
	},
	{}
);

// Gaussian distribution for metallicity toggle
generateSetting(
	'tab_Stars', 
	'Use gaussian distribution',
	events.Generator.Settings.Star.MetallicityGaussian, 
	'checkbox',
	{
		def: consts.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF
	},
	{}
);

// Mean star metallicity field
generateSetting(
	'tab_Stars', 
	'Mean star metallicity',
	events.Generator.Settings.Star.MetallicityMean, 
	'number',
	{
		def: consts.UI_STAR_METALLICITY_MEAN_VAL_DEF,
	},
	{ step: 0.05 }
);

// Standard derivative of star metallicity field
generateSetting(
	'tab_Stars', 
	'Standard deviation for star metallicity',
	events.Generator.Settings.Star.MetallicityStD, 
	'number',
	{
		def: consts.UI_STAR_METALLICITY_STD_VAL_DEF,
		min: consts.UI_STAR_METALLICITY_STD_LIM_MIN,
	},
	{ step: 0.05 }
);

// Unbound age toggle
generateSetting(
	'tab_Stars', 
	'Unbound age (15 Gy+)',
	events.Generator.Settings.Star.AgeUnbound, 
	'checkbox',
	{
		def: consts.UI_STAR_AGE_UNBOUND_VAL_DEF
	},
	{}
);

// ----------------------------------------------------



// ====================================================
// PLANETS ORBITS
// ====================================================

// S-type orbits safety factor field
generateSetting(
	'tab_PlanetsOrbits', 
	'S-type orbits safety factor', 
	events.Generator.Settings.PlanetOrbit.sTypeSafetyFactor, 
	'number',
	{
		def: consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_VAL_DEF,
		min: consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_LIM_MIN,
		max: consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_LIM_MAX,
	},
	{}
);

// Enable P-type orbits toggle
generateSetting(
	'tab_PlanetsOrbits', 
	'Enable P-type orbits', 
	events.Generator.Settings.PlanetOrbit.pTypeEnabled, 
	'checkbox',
	{
		def: consts.UI_PLANET_P_TYPE_ENABLED_VAL_DEF
	},
	{}
);

// P-type orbits safety factor field
generateSetting(
	'tab_PlanetsOrbits', 
	'P-type orbits safety factor', 
	events.Generator.Settings.PlanetOrbit.pTypeSafetyFactor, 
	'number',
	{
		def: consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_VAL_DEF,
		min: consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_LIM_MIN,
		max: consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_LIM_MAX,
	},
	{}
);

// Enable Type I migration toggle
generateSetting(
	'tab_PlanetsOrbits', 
	'Enable Type I migration', 
	events.Generator.Settings.PlanetOrbit.type1MigrationEnabled, 
	'checkbox',
	{
		def: consts.UI_PLANET_MIGRATION_TYPE_1_ENABLED_VAL_DEF
	},
	{}
);

// Type I migration coefficient field
generateSetting(
	'tab_PlanetsOrbits', 
	'Type I migration coefficient', 
	events.Generator.Settings.PlanetOrbit.type1MigrationCoeff, 
	'number',
	{
		def: consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_VAL_DEF,
		min: consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_LIM_MIN,
		max: consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_LIM_MAX,
	},
	{}
);

// Enable Type II migration toggle
generateSetting(
	'tab_PlanetsOrbits', 
	'Enable Type II migration', 
	events.Generator.Settings.PlanetOrbit.type2MigrationEnabled, 
	'checkbox',
	{
		def: consts.UI_PLANET_MIGRATION_TYPE_2_ENABLED_VAL_DEF
	},
	{}
);

// Type II migration coefficient field
generateSetting(
	'tab_PlanetsOrbits', 
	'Type II migration coefficient', 
	events.Generator.Settings.PlanetOrbit.type2MigrationCoeff, 
	'number',
	{
		def: consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_VAL_DEF,
		min: consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_LIM_MIN,
		max: consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_LIM_MAX,
	},
	{}
);

// Interpolate migration regimes toggle
generateSetting(
	'tab_PlanetsOrbits', 
	'Interpolate migration regimes', 
	events.Generator.Settings.PlanetOrbit.migrationInterpolated, 
	'checkbox',
	{
		def: consts.UI_PLANET_MIGRATION_INTERPOLATED_VAL_DEF
	},
	{}
);

// Grand Tack chance field
generateSetting(
	'tab_PlanetsOrbits', 
	'Grand Tack activation chance', 
	events.Generator.Settings.PlanetOrbit.grandTackChance, 
	'number',
	{
		def: consts.UI_PLANET_MIGRATION_GRAND_TACK_CHANCE_VAL_DEF,
		min: consts.UI_PLANET_MIGRATION_GRAND_TACK_CHANCE_LIM_MIN,
		max: consts.UI_PLANET_MIGRATION_GRAND_TACK_CHANCE_LIM_MAX,
	},
	{}
);

// Hill safety factor field
generateSetting(
	'tab_PlanetsOrbits', 
	'Hill orbit safety factor', 
	events.Generator.Settings.PlanetOrbit.hillSafetyFactor, 
	'number',
	{
		def: consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_VAL_DEF,
		min: consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_LIM_MIN,
		max: consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_LIM_MAX,
	},
	{}
);

// ----------------------------------------------------



// ====================================================
// PLANETS
// ====================================================

// Planet amount multiplier field
generateSetting(
	'tab_Planets', 
	'Planet amount multiplier', 
	events.Generator.Settings.Planet.amountMultiplier, 
	'number',
	{
		def: consts.UI_PLANET_AMOUNT_MULT_VAL_DEF,
		min: consts.UI_PLANET_AMOUNT_MULT_LIM_MIN,
		max: consts.UI_PLANET_AMOUNT_MULT_LIM_MAX,
	},
	{}
);

// Life chance field
generateSetting(
	'tab_Planets', 
	'Life chance', 
	events.Generator.Settings.Planet.lifeChance, 
	'number',
	{
		def: consts.UI_PLANET_LIFE_CHANCE_DEF,
		min: consts.UI_PLANET_LIFE_CHANCE_LIM_MIN,
		max: consts.UI_PLANET_LIFE_CHANCE_LIM_MAX,
	},
	{}
);
