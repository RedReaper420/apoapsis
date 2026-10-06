
import eventBus from "../dependencies/event-bus.js";
import events from "../data/events.js";

import consts from "../data/consts.js";

/**
 * Generates interface elements for a generator setting.
 * 
 * @param {string} tab - Settings tab HTML `id`
 * @param {string} labelText - Setting's displayed name
 * @param {string} id - Setting ID (Enum: `events.Generator.Settings.SETTING`)
 * @param {string} type - Input type
 * @param {{
 * 	def: number|boolean,
 * 	min: number|undefined,
 * 	max: number|undefined
 * }} values - Default value (mandatory), and min and max boundaries (optional, for numeric values)
 * @param {string} options - Input element attributes to assign
 * @param {string} tooltip - Tooltip text
 */
function generateSetting(tab, labelText, id, type, values, options, tooltip = undefined) {
	const tabElement = document.getElementById(tab);
	
	const settingContainer = document.createElement('div');
	settingContainer.classList.add('setting-container');

	// Label & tooltip
	const labelElement = document.createElement('label');
	labelElement.setAttribute('for', id);
	const labelTextElement = document.createElement('span');
	labelTextElement.innerText = labelText + ':';
	if (tooltip) {
		const tooltipContainer = document.createElement('span');
		tooltipContainer.classList.add('tooltip');
		tooltipContainer.appendChild(labelTextElement);

		const tooltipElement = document.createElement('span');
		tooltipElement.classList.add('tooltiptext');
		tooltipElement.innerText = tooltip;
		tooltipContainer.appendChild(tooltipElement);

		labelElement.appendChild(tooltipContainer);
	}
	else {
		labelElement.appendChild(labelTextElement);
	}
	settingContainer.appendChild(labelElement);
	
	// Input element
	const inputElement = document.createElement('input');
	inputElement.type = type;
	inputElement.name = id;
	inputElement.id = id;
	if (type === "number") { inputElement.step = 0.1; }
	for (const opt in options) { inputElement.setAttribute(opt, options[opt]); }
	settingContainer.appendChild(inputElement);

	// Values and listeners for the input
	if (type === 'checkbox') {
		inputElement.addEventListener('input', (e) => {
			eventBus.emit(id, { data: e.currentTarget.checked });
		});
		inputElement.checked = values.def;
	}
	else {
		inputElement.addEventListener('input', (e) => {
			eventBus.emit(id, { data: Number(e.currentTarget.value) });
		});
		if (values.min !== undefined) inputElement.min = values.min;
		if (values.max !== undefined) inputElement.max = values.max;
		inputElement.value = values.def;
	}
	
	// Reset button
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
 * Adds a horizontal ruler (`<hr>`) to the specified settings tab.
 * @param {string} tab - Settings tab HTML `id`
 */
function addRuler(tab) {
	const tabElement = document.getElementById(tab);
	const hr = document.createElement('hr');
	hr.style.opacity = '50%';
	tabElement.appendChild(hr);
}

// ---

// Seed input
const gen_seed = document.getElementById('gen_seed');
gen_seed.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Seed, { data: e.currentTarget.value });
});

//#region | Stars

// Binary star chance input
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
	{ step: 0.01 },
);

addRuler('tab_Stars');

// Min star mass input
generateSetting(
	'tab_Stars', 
	'Minimal star mass',
	events.Generator.Settings.Star.MassMin, 
	'number',
	{
		def: consts.UI_STAR_MASS_MIN_VAL_DEF,
		min: consts.UI_STAR_MASS_LIM_MIN,
		max: consts.UI_STAR_MASS_LIM_MAX
	},
	{},
	`Unit: M☉\nValue >= 0.08`
);

// Max star mass input
generateSetting(
	'tab_Stars', 
	'Maximal star mass',
	events.Generator.Settings.Star.MassMax, 
	'number',
	{
		def: consts.UI_STAR_MASS_MAX_VAL_DEF,
		min: consts.UI_STAR_MASS_LIM_MIN,
		max: consts.UI_STAR_MASS_LIM_MAX
	},
	{},
	`Unit: M☉\nValue <= 150.`
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
	{},
	`Toggles usage of initial mass function instead of uniform distribution.`
);

addRuler('tab_Stars');

// Min star metallicity input
generateSetting(
	'tab_Stars', 
	'Minimal star metallicity',
	events.Generator.Settings.Star.MetallicityMin,
	'number', 
	{
		def: consts.UI_STAR_METALLICITY_MIN_VAL_DEF,
		min: consts.UI_STAR_METALLICITY_LIM_MIN,
		max: consts.UI_STAR_METALLICITY_LIM_MAX
	},
	{}
);

// Max star metallicity input
generateSetting(
	'tab_Stars', 
	'Maximal star metallicity',
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

// Mean star metallicity input
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

// Standard derivative of star metallicity input
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

addRuler('tab_Stars');

// Unbound age toggle
generateSetting(
	'tab_Stars', 
	'Unbound age (10 Gy+)',
	events.Generator.Settings.Star.AgeUnbound, 
	'checkbox',
	{
		def: consts.UI_STAR_AGE_UNBOUND_VAL_DEF
	},
	{},
	`Bound: attempts to set the system's age between 1 and 10 Gyrs.
	
	Unbound: sets the system's age between 20% and 80% of the first star's total lifespan.`
);

//#endregion

//#region | Planets' orbits

// S-type orbits safety factor input
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
	{},
	`Determines maximal allowed orbits for planets on S-type orbits.`
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
	{},
	`Determines if circumbinary planets and moons (like Tatooine) are allowed to be generated.`
);

// P-type orbits safety factor input
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
	{},
	`Determines minimal allowed orbits for planets on P-type orbits.`
);

addRuler('tab_PlanetsOrbits');

// Enable Type I migration toggle
generateSetting(
	'tab_PlanetsOrbits', 
	'Enable Type I migration', 
	events.Generator.Settings.PlanetOrbit.type1MigrationEnabled, 
	'checkbox',
	{
		def: consts.UI_PLANET_MIGRATION_TYPE_1_ENABLED_VAL_DEF
	},
	{},
	`Slow inward migration of low-mass planets in the early period of the planetary system.`
);

// Type I migration coefficient input
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
	{},
	`Fast inward migration of high-mass planets in the early period of the planetary system.`
);

// Type II migration coefficient input
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
	{},
	`Linear interpolation of migration regimes for planets with masses between 15 M⊕ and 120 M⊕.`
);

// Grand Tack chance input
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
	{ step: 0.01 },
	`Determines a chance for two giant planets (>= 60 M⊕) to start the Grand Tack (outward migration) at some point.`
);

// Hill safety factor input
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
	{},
	`Determines how close planets can get to one another without triggering a close encounter (orbits shift, planet ejection or collision) during the migration simulation.`
);

//#endregion

//#region | Planets

// Planet amount multiplier input
generateSetting(
	'tab_Planets', 
	'Planets amount multiplier', 
	events.Generator.Settings.Planet.amountMultiplier, 
	'number',
	{
		def: consts.UI_PLANET_AMOUNT_MULT_VAL_DEF,
		min: consts.UI_PLANET_AMOUNT_MULT_LIM_MIN,
		max: consts.UI_PLANET_AMOUNT_MULT_LIM_MAX,
	},
	{}
);

// Binary chance input
generateSetting(
	'tab_Planets', 
	'Bonus giant impact chance', 
	events.Generator.Settings.Planet.bonusGiantImpactChance, 
	'number',
	{
		def: consts.UI_PLANET_BONUS_GIANT_IMPACT_CHANCE_VAL_DEF,
		min: consts.UI_PLANET_BONUS_GIANT_IMPACT_CHANCE_LIM_MIN,
		max: consts.UI_PLANET_BONUS_GIANT_IMPACT_CHANCE_LIM_MAX,
	},
	{ step: 0.01 },
	`Determines a chance to add a giant impact entry to a planet's history even if it didn't get actual impacts during the migration simulation.`
);

// Max bonus impacts input
generateSetting(
	'tab_Planets', 
	'Maximal number of bonus giant impacts', 
	events.Generator.Settings.Planet.maxBonusGiantImpacts, 
	'number',
	{
		def: consts.UI_PLANET_MAX_BONUS_GIANT_IMPACTS_VAL_DEF,
		min: consts.UI_PLANET_MAX_BONUS_GIANT_IMPACTS_LIM_MIN,
		max: consts.UI_PLANET_MAX_BONUS_GIANT_IMPACTS_LIM_MAX,
	},
	{ step: 1 }
);

// Binary chance input
generateSetting(
	'tab_Planets', 
	'Maximal binary planet chance', 
	events.Generator.Settings.Planet.binaryChance, 
	'number',
	{
		def: consts.UI_PLANET_BINARY_CHANCE_VAL_DEF,
		min: consts.UI_PLANET_BINARY_CHANCE_LIM_MIN,
		max: consts.UI_PLANET_BINARY_CHANCE_LIM_MAX,
	},
	{ step: 0.01 }
);

// Life chance input
generateSetting(
	'tab_Planets', 
	'Life presence chance', 
	events.Generator.Settings.Planet.lifeChance, 
	'number',
	{
		def: consts.UI_PLANET_LIFE_CHANCE_DEF,
		min: consts.UI_PLANET_LIFE_CHANCE_LIM_MIN,
		max: consts.UI_PLANET_LIFE_CHANCE_LIM_MAX,
	},
	{},
	`Determines a chance for a planet, even with ideal conditions, to be able to develop any life.`
);

//#endregion
