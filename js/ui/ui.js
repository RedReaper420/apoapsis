
import {events, eventBus} from "../utils/eventbus.js";
import consts from "../data/consts.js";

const tabContent = document.querySelectorAll('.tabcontent');
const tabLinks = document.querySelectorAll('.tablinks');

function openTab(evt, tabName) {
	if (!evt.currentTarget.classList.contains('active')) {
		closeTab();
		evt.currentTarget.className += " active";
		document.getElementById(tabName).className += " active";
	}
	else {
		closeTab();
	}
}

function closeTab() {
	tabContent.forEach(section => { section.classList.remove('active'); });
	tabLinks.forEach(tab => { tab.classList.remove('active'); });
}

// Tabs initiation
tabLinks.forEach(tab => {
	if (tab.classList.contains('btn'))
		return;

	tab.addEventListener('click', (e) => { openTab(event, tab.dataset.tab); });
});
closeTab();

// ====================================================
// Setting emitters and default values for the settings
// ====================================================

/**
 * @param {string} elementId 
 * @param {string} event 
 * @param {*} defaultValue 
 * @param {number} [limitMin=undefined] 
 * @param {number} [limitMax=undefined] 
 */
function setupSetting(elementId, event, defaultValue, limitMin=undefined, limitMax=undefined) {
	const element = document.getElementById(elementId);
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

// Generate button
const btn_generate = document.getElementById('btn-generate');
btn_generate.addEventListener('click', (e) => {
	eventBus.emit(events.Generator.Generation.Start);
});

// Seed field
const gen_seed = document.getElementById('gen_seed');
gen_seed.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Seed, { data: e.currentTarget.value });
});

// ====================================================
// STARS
// ====================================================

// Binary star chance field
setupSetting(
	'gen_star_binary_chance', 
	events.Generator.Settings.Star.BinaryChance, 
	consts.UI_STAR_BINARY_CHANCE_VAL_DEF,
	consts.UI_STAR_BINARY_CHANCE_LIM_MIN,
	consts.UI_STAR_BINARY_CHANCE_LIM_MAX
);

// Min star mass field
setupSetting(
	'gen_star_mass_min', 
	events.Generator.Settings.Star.MassMin, 
	consts.UI_STAR_MASS_MIN_VAL_DEF,
	consts.UI_STAR_MASS_LIM_MIN,
	consts.UI_STAR_MASS_LIM_MAX
);

// Max star mass field
setupSetting(
	'gen_star_mass_max', 
	events.Generator.Settings.Star.MassMax, 
	consts.UI_STAR_MASS_MAX_VAL_DEF,
	consts.UI_STAR_MASS_LIM_MIN,
	consts.UI_STAR_MASS_LIM_MAX
);

// Use IMF mass sampling toggle
setupSetting(
	'gen_star_mass_use_imf', 
	events.Generator.Settings.Star.MassUseIMF, 
	consts.UI_STAR_MASS_USE_IMF_VAL_DEF
);

// Min star metallicity field
setupSetting(
	'gen_star_metallicity_min', 
	events.Generator.Settings.Star.MetallicityMin, 
	consts.UI_STAR_METALLICITY_MIN_VAL_DEF,
	consts.UI_STAR_METALLICITY_LIM_MIN,
	consts.UI_STAR_METALLICITY_LIM_MAX
);

// Max star metallicity field
setupSetting(
	'gen_star_metallicity_max', 
	events.Generator.Settings.Star.MetallicityMax, 
	consts.UI_STAR_METALLICITY_MAX_VAL_DEF,
	consts.UI_STAR_METALLICITY_LIM_MIN,
	consts.UI_STAR_METALLICITY_LIM_MAX
);

// Gaussian distribution for metallicity toggle
setupSetting(
	'gen_star_metallicity_use_gaussian', 
	events.Generator.Settings.Star.MetallicityGaussian, 
	consts.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF
);

// Mean star metallicity field
setupSetting(
	'gen_star_metallicity_mean', 
	events.Generator.Settings.Star.MetallicityMean, 
	consts.UI_STAR_METALLICITY_MEAN_VAL_DEF,
);

// Standard derivative of star metallicity field
setupSetting(
	'gen_star_metallicity_std', 
	events.Generator.Settings.Star.MetallicityStD, 
	consts.UI_STAR_METALLICITY_STD_VAL_DEF,
	consts.UI_STAR_METALLICITY_STD_LIM_MIN,
);

// ----------------------------------------------------



// ====================================================
// PLANETS
// ====================================================

// Planet amount multiplier field
setupSetting(
	'gen_planet_amount_multiplier', 
	events.Generator.Settings.Planet.amountMultiplier, 
	consts.UI_PLANET_AMOUNT_MULT_VAL_DEF,
	consts.UI_PLANET_AMOUNT_MULT_LIM_MIN,
	consts.UI_PLANET_AMOUNT_MULT_LIM_MAX,
);

// S-type orbits safety factor field
setupSetting(
	'gen_planet_s_type_safety_factor', 
	events.Generator.Settings.Planet.sTypeSafetyFactor, 
	consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_VAL_DEF,
	consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_LIM_MIN,
	consts.UI_PLANET_S_TYPE_SAFETY_FACTOR_LIM_MAX,
);

// P-type orbits safety factor field
setupSetting(
	'gen_planet_p_type_safety_factor', 
	events.Generator.Settings.Planet.pTypeSafetyFactor, 
	consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_VAL_DEF,
	consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_LIM_MIN,
	consts.UI_PLANET_P_TYPE_SAFETY_FACTOR_LIM_MAX,
);

// Enable P-type orbits toggle
setupSetting(
	'gen_planet_p_type_enabled', 
	events.Generator.Settings.Planet.pTypeEnabled, 
	consts.UI_PLANET_P_TYPE_ENABLED_VAL_DEF
);

// Enable Type I migration toggle
setupSetting(
	'gen_planet_migration_type_1_enabled', 
	events.Generator.Settings.Planet.type1MigrationEnabled, 
	consts.UI_PLANET_MIGRATION_TYPE_1_ENABLED_VAL_DEF
);

// Type I migration coefficient field
setupSetting(
	'gen_planet_migration_type_1_coeff', 
	events.Generator.Settings.Planet.type1MigrationCoeff, 
	consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_VAL_DEF,
	consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_LIM_MIN,
	consts.UI_PLANET_MIGRATION_TYPE_1_COEFF_LIM_MAX,
);

// Enable Type II migration toggle
setupSetting(
	'gen_planet_migration_type_2_enabled', 
	events.Generator.Settings.Planet.type2MigrationEnabled, 
	consts.UI_PLANET_MIGRATION_TYPE_2_ENABLED_VAL_DEF
);

// Type II migration coefficient field
setupSetting(
	'gen_planet_migration_type_2_coeff', 
	events.Generator.Settings.Planet.type2MigrationCoeff, 
	consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_VAL_DEF,
	consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_LIM_MIN,
	consts.UI_PLANET_MIGRATION_TYPE_2_COEFF_LIM_MAX,
);

// Interpolate migration regimes toggle
setupSetting(
	'gen_planet_migration_interpolated', 
	events.Generator.Settings.Planet.migrationInterpolated, 
	consts.UI_PLANET_MIGRATION_INTERPOLATED_VAL_DEF
);

// Enable Grand Tack toggle
setupSetting(
	'gen_planet_migration_grand_tack_enabled', 
	events.Generator.Settings.Planet.grandTackEnabled, 
	consts.UI_PLANET_MIGRATION_GRAND_TACK_ENABLED_VAL_DEF
);

// Hill safety factor field
setupSetting(
	'gen_planet_migration_hill_safety_factor', 
	events.Generator.Settings.Planet.hillSafetyFactor, 
	consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_VAL_DEF,
	consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_LIM_MIN,
	consts.UI_PLANET_MIGRATION_HILL_SAFETY_FACTOR_LIM_MAX,
);

// ----------------------------------------------------
