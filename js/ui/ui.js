
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

// =====================================
// Setting emitters and default values 
// =====================================

// Generate button
const btn_generate = document.getElementById('btn-generate');
btn_generate.addEventListener('click', (e) => {
	eventBus.emit(events.Generator.Generate);
});

// Seed field
const gen_seed = document.getElementById('gen_seed');
gen_seed.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Seed, { data: e.currentTarget.value });
});

// Force habitable toggle
const gen_force_habitable = document.getElementById('gen_force_habitable');
gen_force_habitable.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.ForceHabitable, { data: e.currentTarget.checked });
});
gen_force_habitable.checked = consts.UI_FORCE_HABITABLE_VAL_DEF;

// Life chance field
const gen_life_chance = document.getElementById('gen_life_chance');
gen_life_chance.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.LifeChance, { data: Number(e.currentTarget.value) });
});
gen_life_chance.min = consts.UI_LIFE_CHANCE_LIM_MIN;
gen_life_chance.max = consts.UI_LIFE_CHANCE_LIM_MAX;
gen_life_chance.value = consts.UI_LIFE_CHANCE_VAL_DEF;

// Jupiter behavior radio
const gen_jupiter_behavior_opt_random = document.getElementById('gen_jupiter_behavior_opt_random');
gen_jupiter_behavior_opt_random.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.JupiterBehavior, { data: e.currentTarget.value });
});
if (gen_jupiter_behavior_opt_random.value === consts.UI_JUPITER_BEHAVIOR_VAL_DEF)
	gen_jupiter_behavior_opt_random.checked = true;

const gen_jupiter_behavior_opt_no = document.getElementById('gen_jupiter_behavior_opt_no');
gen_jupiter_behavior_opt_no.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.JupiterBehavior, { data: e.currentTarget.value });
});
if (gen_jupiter_behavior_opt_no.value === consts.UI_JUPITER_BEHAVIOR_VAL_DEF)
	gen_jupiter_behavior_opt_no.checked = true;

const gen_jupiter_behavior_opt_nohot = document.getElementById('gen_jupiter_behavior_opt_nohot');
gen_jupiter_behavior_opt_nohot.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.JupiterBehavior, { data: e.currentTarget.value });
});
if (gen_jupiter_behavior_opt_nohot.value === consts.UI_JUPITER_BEHAVIOR_VAL_DEF)
	gen_jupiter_behavior_opt_nohot.checked = true;

const gen_jupiter_behavior_opt_hot = document.getElementById('gen_jupiter_behavior_opt_hot');
gen_jupiter_behavior_opt_hot.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.JupiterBehavior, { data: e.currentTarget.value });
});
if (gen_jupiter_behavior_opt_hot.value === consts.UI_JUPITER_BEHAVIOR_VAL_DEF)
	gen_jupiter_behavior_opt_hot.checked = true;

const gen_jupiter_behavior_opt_sol = document.getElementById('gen_jupiter_behavior_opt_sol');
gen_jupiter_behavior_opt_sol.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.JupiterBehavior, { data: e.currentTarget.value });
});
if (gen_jupiter_behavior_opt_sol.value === consts.UI_JUPITER_BEHAVIOR_VAL_DEF)
	gen_jupiter_behavior_opt_sol.checked = true;

// Planet density field
const gen_planet_density = document.getElementById('gen_planet_density');
gen_planet_density.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.PlanetDensity, { data: Number(e.currentTarget.value) });
});
gen_planet_density.min = consts.UI_PLANET_DENSITY_LIM_MIN;
gen_planet_density.max = consts.UI_PLANET_DENSITY_LIM_MAX;
gen_planet_density.value = consts.UI_PLANET_DENSITY_VAL_DEF;

// Binary star chance field
const gen_star_binary_chance = document.getElementById('gen_star_binary_chance');
gen_star_binary_chance.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.BinaryChance, { data: Number(e.currentTarget.value) });
});
gen_star_binary_chance.min = consts.UI_STAR_BINARY_CHANCE_LIM_MIN;
gen_star_binary_chance.max = consts.UI_STAR_BINARY_CHANCE_LIM_MAX;
gen_star_binary_chance.value = consts.UI_STAR_BINARY_CHANCE_VAL_DEF;

// Min star mass field
const gen_star_mass_min = document.getElementById('gen_star_mass_min');
gen_star_mass_min.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MassMin, { data: Number(e.currentTarget.value) });
});
gen_star_mass_min.min = consts.UI_STAR_MASS_LIM_MIN;
gen_star_mass_min.max = consts.UI_STAR_MASS_LIM_MAX;
gen_star_mass_min.value = consts.UI_STAR_MASS_MIN_VAL_DEF;

// Max star mass field
const gen_star_mass_max = document.getElementById('gen_star_mass_max');
gen_star_mass_max.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MassMax, { data: Number(e.currentTarget.value) });
});
gen_star_mass_max.min = consts.UI_STAR_MASS_LIM_MIN;
gen_star_mass_max.max = consts.UI_STAR_MASS_LIM_MAX;
gen_star_mass_max.value = consts.UI_STAR_MASS_MAX_VAL_DEF;

// Use IMF toggle
const gen_star_mass_use_imf = document.getElementById('gen_star_mass_use_imf');
gen_star_mass_use_imf.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MassUseIMF, { data: e.currentTarget.checked });
});
gen_star_mass_use_imf.checked = consts.UI_STAR_MASS_USE_IMF_VAL_DEF;

// Min star metallicity field
const gen_star_metallicity_min = document.getElementById('gen_star_metallicity_min');
gen_star_metallicity_min.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MetallicityMin, { data: Number(e.currentTarget.value) });
});
gen_star_metallicity_min.min = consts.UI_STAR_METALLICITY_LIM_MIN;
gen_star_metallicity_min.max = consts.UI_STAR_METALLICITY_LIM_MAX;
gen_star_metallicity_min.value = consts.UI_STAR_METALLICITY_MIN_VAL_DEF;

// Max star metallicity field
const gen_star_metallicity_max = document.getElementById('gen_star_metallicity_max');
gen_star_metallicity_max.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MetallicityMax, { data: Number(e.currentTarget.value) });
});
gen_star_metallicity_max.min = consts.UI_STAR_METALLICITY_LIM_MIN;
gen_star_metallicity_max.max = consts.UI_STAR_METALLICITY_LIM_MAX;
gen_star_metallicity_max.value = consts.UI_STAR_METALLICITY_MAX_VAL_DEF;

// Gaussian metallicity toggle
const gen_star_metallicity_use_gaussian = document.getElementById('gen_star_metallicity_use_gaussian');
gen_star_metallicity_use_gaussian.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MetallicityGaussian, { data: e.currentTarget.checked });
});
gen_star_metallicity_use_gaussian.checked = consts.UI_STAR_METALLICITY_USE_GAUSSIAN_VAL_DEF;

// Mean star metallicity field
const gen_star_metallicity_mean = document.getElementById('gen_star_metallicity_mean');
gen_star_metallicity_mean.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MetallicityMean, { data: Number(e.currentTarget.value) });
});
gen_star_metallicity_mean.value = consts.UI_STAR_METALLICITY_MEAN_VAL_DEF;

// Standard derivative of star metallicity field
const gen_star_metallicity_std = document.getElementById('gen_star_metallicity_std');
gen_star_metallicity_std.addEventListener('input', (e) => {
	eventBus.emit(events.Generator.Settings.Star.MetallicityStD, { data: Number(e.currentTarget.value) });
});
gen_star_metallicity_std.min = consts.UI_STAR_METALLICITY_STD_LIM_MIN;
gen_star_metallicity_std.value = consts.UI_STAR_METALLICITY_STD_VAL_DEF;

// -------------------------------------
