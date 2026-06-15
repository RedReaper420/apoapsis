
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import consts from "../data/consts.js";
import * as types from "../data/types.js";

import * as namegen from "./namegen.js";

/**
 * Calculates a star's lifespan based on its mass and luminosity.
 * 
 * @param {types.Value} starMass  - The mass of the star (unit: types.units.Mass)
 * @param {number} starLuminosity - The luminosity of the star in solar units (L☉)
 * 
 * @returns {types.Value} The total lifespan of the star (unit: types.units.Time)
 */
function getLifespan(starMass, starLuminosity) {
	const mass = starMass.getValueAs(types.units.Mass.M_Sun);
	/*
	// Mass-only version
	const pow = mass <= 50.0 ? -2.5 : -3.5;
	const lifespan = consts.PHY_SUN_LIFESPAN * Math.pow(mass, pow);
	return new types.Value(lifespan, types.units.Time.Gy);
	*/
	const lifespanGyr = consts.PHY_SUN_LIFESPAN * (mass / starLuminosity);
	return new types.Value(lifespanGyr, types.units.Time.Gy);
}

/**
 * Calculates a star's base luminosity from its mass using the Mass-Luminosity relation.
 * 
 * @param {types.Value} starMass - The mass of the star (unit: types.units.Mass)
 * 
 * @returns {number} The base luminosity in solar units (L☉)
 * 
 * @see {@link https://en.wikipedia.org/wiki/Mass-luminosity_relation#Advanced_forms} (slightly modified to make the curve almost seamless)
 */
function getLuminosity(starMass) {
	const mass = starMass.getValueAs(types.units.Mass.M_Sun);
	
	if (mass < 0.43)
		return 0.23 * Math.pow(mass, 2.3);
	else if (mass < 2.0)
		return Math.pow(mass, 4);
	else if (mass < 53.0)
		return 1.4 * Math.pow(mass, 3.5) + 0.160808; // no "+ 0.16" originally
	else
		return 28629.7632 * mass; // "32000 * mass" originally
}

/**
 * Calculates a star's base radius from its mass.
 * 
 * @param {types.Value} starMass - The mass of the star (unit: types.units.Mass)
 * 
 * @returns {types.Value} The base radius (unit: types.units.Dist)
 * 
 * @see {@link https://academic.oup.com/mnras/article/479/4/5491/5056185}
 * @see {@link http://astro.vaporia.com/start/massradius.html}
 */
function getRadius(starMass) {
	const mass = starMass.getValueAs(types.units.Mass.M_Sun);

	if (mass <= 1.5)
		return new types.Value(0.438 * (mass**2) + 0.479 * mass + 0.075, types.units.Dist.R_Sun);
	else
		return new types.Value(Math.pow(10, 0.003 + 0.724 * Math.log10(mass)), types.units.Dist.R_Sun);
		//return new types.Value(Math.pow(mass, 0.8), types.units.Dist.R_Sun);
}

// Harvard spectral classification temperature thresholds
const starTypeChart = [
	Object.freeze({ type: 'O', max: 50000, min: 33000 }),
	Object.freeze({ type: 'B', max: 33000, min: 10000 }),
	Object.freeze({ type: 'A', max: 10000, min:  7300 }),
	Object.freeze({ type: 'F', max:  7300, min:  6000 }),
	Object.freeze({ type: 'G', max:  6000, min:  5200 }),
	Object.freeze({ type: 'K', max:  5200, min:  3700 }),
	Object.freeze({ type: 'M', max:  3700, min:  2300 }),
];

/**
 * Determines the 2-character spectral type (e.g., "G2", "O0") from temperature.
 * 
 * @param {types.Value} starTemperature - The effective temperature (unit: types.units.Temp)
 * 
 * @returns {string} A 2-character string from "O0" to "M9"
 */
function getType(starTemperature) {
	const temperature = starTemperature.getValueAs(types.units.Temp.K);

	// Very hot stars (beyond O)
	if (temperature >= starTypeChart[0].max)
		return 'O0';

	for (const { type, max, min } of starTypeChart) {
		if (temperature > min) {
			const fraction = (max - temperature) / (max - min);
			const subtype = Math.round(fraction * 9);
			const clampedSubtype = utils.clamp(subtype, 0, 9);

			return type + clampedSubtype;
		}
	}

	// Very cool stars
	return 'M9';
}

/**
 * Calculates effective temperature from luminosity and radius using Stefan-Boltzmann law relation.
 * 
 * @param {number} starLuminosity  - The luminosity in solar units (L☉)
 * @param {types.Value} starRadius - The radius of the star (unit: types.units.Dist)
 * 
 * @returns {types.Value} The effective temperature (unit: types.units.Temp)
 */
function getTemperature(starLuminosity, starRadius) {
	const radius = starRadius.getValueAs(types.units.Dist.R_Sun);
	const temperature = consts.PHY_SUN_TEMP * Math.pow(starLuminosity / (radius**2), 1/4);
	return new types.Value(temperature, types.units.Temp.K);
}

/**
 * Calculates the absolute magnitude of a star from its luminosity.
 * 
 * @param {number} starLuminosity - The luminosity in solar units (L☉)
 * 
 * @returns {number} Absolute magnitude
 */
function getAbsMagnitude(starLuminosity) {
	return 4.74 - 2.5 * Math.log10(starLuminosity);
}

/**
 * Estimates the B-V (Blue minus Visual) color index from temperature.
 * 
 * @param {types.Value} starTemperature - The effective temperature (unit: types.units.Temp)
 * 
 * @returns {number} B-V color index
 */
function getBV(starTemperature) {
	// Ballesteros 2012 approximation inverted (T -> B-V)
	const temperature = starTemperature.getValueAs(types.units.Temp.K);
	
	if (temperature >= 10000)
		return -0.35 + (10000 - temperature) * 0.00004; // Very blue stars

	// Polynomial fit for 2300K - 10000K
	const logT = Math.log10(temperature);
	return 6.014 - 5.606 * logT + 1.866 * (logT**2) - 0.212 * (logT**3);
}

/**
 * Converts stellar effective temperature to an RGB hex color code string.
 * 
 * @param {types.Value} starTemperature - The effective temperature (unit: types.units.Temp)
 * 
 * @returns {string} Hex color string format: "#RRGGBB"
 * 
 * @see {@link https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html}
 */
function temperatureToColor(starTemperature) {
	const tempFactor = utils.clamp(starTemperature.getValueAs(types.units.Temp.K), 1000, 40000) / 100;
	let red = 0; 
	let green = 0; 
	let blue = 0;

	// --- Red Component ---
	if (tempFactor <= 66) {
		red = 255;
	} else {
		const adjustedTemp = tempFactor - 60;
		red = 329.698727446 * Math.pow(adjustedTemp, -0.1332047592);
	}
	red = utils.clamp(Math.round(red), 0, 255);

	// --- Green Component ---
	if (tempFactor <= 66) {
		green = 99.4708025861 * Math.log(tempFactor) - 161.1195681661;
	} else {
		const adjustedTemp = tempFactor - 60;
		green = 288.1221695283 * Math.pow(adjustedTemp, -0.0755148492);
	}
	green = utils.clamp(Math.round(green), 0, 255);

	// --- Blue Component ---
	if (tempFactor <= 19) {
		blue = 255;
	} else {
		const adjustedTemp = tempFactor - 10;
		blue = 138.5177312231 * Math.log(adjustedTemp) - 305.0447927307;
	}
	blue = utils.clamp(Math.round(blue), 0, 255);
	
	const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
	return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * Sample stellar mass from Kroupa (2001) IMF.
 * 
 * Broken power-law distribution: 
 * - α = 0.3 (0.01 - 0.08 M☉), 
 * - α = 1.3 (0.08 - 0.5 M☉), 
 * - α = 2.3 (> 0.5 M☉)
 * 
 * Uses inverse transform sampling with proper normalization across boundaries.
 * 
 * @param {number} minMass - Lower limit boundary (default: {@link consts.PHY_STAR_MASS_MIN})
 * @param {number} maxMass - Upper limit boundary (default: {@link consts.PHY_STAR_MASS_MAX})
 * 
 * @returns {number} Sampled mass value in solar masses (M☉)
 */
function sampleKroupaIMF(minMass = consts.PHY_STAR_MASS_MIN, maxMass = consts.PHY_STAR_MASS_MAX) {
	const alpha1 = 0.3;   // Brown dwarfs segment (0.01 - 0.08 M☉)
	const alpha2 = 1.3;   // Low mass stars segment (0.08 - 0.5 M☉)
	const alpha3 = 2.3;   // Intermediate and high mass segment (> 0.5 M☉)

	const massThreshold1 = 0.01;
	const massThreshold2 = 0.08;
	const massThreshold3 = 0.5;
	const massThreshold4 = maxMass;

	const lowLimit = Math.max(minMass, 0.01);

	// Cumulative distribution function (CDF) segments
	let cdfSegment1 = 0;
	let cdfSegment2 = 0;

	// Segment 1: Substellar objects / ultra-low mass
	if (lowLimit < massThreshold2) {
		const norm1 = (Math.pow(massThreshold2, 1 - alpha1) - Math.pow(massThreshold1, 1 - alpha1)) / (1 - alpha1);
		cdfSegment1 = norm1;
	}

	// Segment 2: 0.08 - 0.5 M☉
	const norm2 = (Math.pow(massThreshold3, 1 - alpha2) - Math.pow(massThreshold2, 1 - alpha2)) / (1 - alpha2);
	cdfSegment2 = cdfSegment1 + norm2;

	// Segment 3: 0.5 M☉ - maxMass
	const norm3 = (Math.pow(massThreshold4, 1 - alpha3) - Math.pow(massThreshold3, 1 - alpha3)) / (1 - alpha3);
	const totalCdfWeight = cdfSegment2 + norm3;

	const randomWeight = prng() * totalCdfWeight;

	// Inverse Transform Sampling Execution
	if (randomWeight < cdfSegment1) {
		return Math.pow(Math.pow(massThreshold1, 1 - alpha1) + randomWeight * (1 - alpha1), 1 / (1 - alpha1));
	} else if (randomWeight < cdfSegment2) {
		const relativeWeight = randomWeight - cdfSegment1;
		return Math.pow(Math.pow(massThreshold2, 1 - alpha2) + relativeWeight * (1 - alpha2), 1 / (1 - alpha2));
	} else {
		const relativeWeight = randomWeight - cdfSegment2;
		return Math.pow(Math.pow(massThreshold3, 1 - alpha3) + relativeWeight * (1 - alpha3), 1 / (1 - alpha3));
	}
}

/**
 * Samples a valid stellar mass from the IMF within a strictly bounded range.
 * 
 * @param {number} minMass - Minimum allowed mass in M☉
 * @param {number} maxMass - Maximum allowed mass in M☉
 * 
 * @returns {types.Value} The bounded star mass (unit: types.units.Mass)
 * 
 * @see {@link sampleKroupaIMF}
 */
function sampleIMF(minMass, maxMass) {
	const MAX_ATTEMPTS = 100;
	let mass = 0;
	let attempts = 0;
	
	do {
		mass = sampleKroupaIMF();
		attempts++;
	} while ((mass < minMass || mass > maxMass) && attempts < MAX_ATTEMPTS);

	const finalMass = utils.clamp(mass, minMass, maxMass);
	return new types.Value(finalMass, types.units.Mass.M_Sun);
}

/**
 * Samples stellar metallicity [Fe/H] from a truncated normal distribution.
 * 
 * @param {number} mean  - Mean of the distribution (usually 0 or -0.1)
 * @param {number} stdev - Standard deviation (typical: 0.2 to 0.4)
 * @param {number} min	 - Minimum allowed [Fe/H]
 * @param {number} max	 - Maximum allowed [Fe/H]
 * 
 * @returns {number} Calculated metallicity value
 */
function sampleMetallicity(mean, stdev, min, max) {
	const MAX_ATTEMPTS = 100;

	let metallicity = 0;
	let attempts = 0;
	do {
		metallicity = utils.gaussianRandom(mean, stdev);
		attempts++;
	} while ((metallicity < min || metallicity > max) && attempts < MAX_ATTEMPTS);

	return utils.clamp(metallicity, min, max);
}

/**
 * Generates a completely initialized Star object instance.
 * 
 * @param {types.GenerationSettings} settings - Context settings configuration for procedural generation
 * @param {types.Star|types.BinaryStar|null} constraint - Optional star object to inherit baseline parameters from
 * @param {number} constraintMassMult  - [default: 1.0] Mass modifier factor used to prevent sub-threshold star system generations (see starsystemgen.js, generateStarFormation())
 * 
 * @returns {types.Star} An instantiated and fully calculated Star object
 */
export function generateStar(settings, constraint = null, constraintMassMult = 1.0) {
	const star = new types.Star();

	// --- 1. Mass Generation ---
	let mass_min = settings.star_mass_min;
	let mass_max = settings.star_mass_max;
	if (constraint !== null) {
		mass_min = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.1 * constraintMassMult);
		mass_max = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.9 * constraintMassMult);
	}
	star.mass = settings.star_mass_use_imf
		? sampleIMF(mass_min, mass_max)
		: new types.Value(prng.range(mass_min, mass_max), types.units.Mass.M_Sun);
	
	// --- 2. Metallicity Generation ([Fe/H]) ---
	let metallicity = 0;
	if (constraint === null) {
		metallicity = settings.star_metallicity_use_gaussian
		? sampleMetallicity(
			settings.star_metallicity_mean,
			settings.star_metallicity_std,
			settings.star_metallicity_min,
			settings.star_metallicity_max)
		: prng.range(settings.star_metallicity_min, settings.star_metallicity_max);
	}
	else {
		metallicity = utils.clamp(constraint.metallicity * prng.range(0.9, 1.1), 
			consts.PHY_STAR_METALLICITY_MIN, consts.PHY_STAR_METALLICITY_MAX);
		star.metallicity = metallicity;
	}
	star.metallicity = metallicity;

	// --- 3. Physical Parameters & Metallicity Effects ---
	let luminosity = getLuminosity(star.mass);
	let radius = getRadius(star.mass);

	// Physical effects: Higher metallicity -> more opaque core -> dimmer but structurally expanded
	luminosity *= Math.pow(10, -0.15 * metallicity); 
	radius.value *= (1 + 0.08 * metallicity);

	// Apply natural scatter (variability simulation)
	const luminosityScatter = 0.04 + 0.08 * Math.abs(metallicity); // Extreme metal content causes higher instability
	const radiusScatter = 0.025;
	luminosity *= Math.pow(10, utils.gaussianRandom(0, luminosityScatter));
	radius.value *= Math.exp(utils.gaussianRandom(0, radiusScatter));

	// --- 4. Secondary Derived Calculations ---
	star.luminosity = luminosity;
	star.radius = radius;

	// Density computation: mass (kg) / volume (m³) converted from kg/m³ to g/cm³ (/1000)
	const volumeM3 = (4 / 3) * Math.PI * Math.pow(radius.getValueAs(types.units.Dist.m), 3);
	star.density = (star.mass.getValueAs(types.units.Mass.kg) / volumeM3) / 1000;

	star.temperature = getTemperature(star.luminosity, star.radius);
	star.type = getType(star.temperature);
	star.absMag = getAbsMagnitude(star.luminosity);
	star.bv = getBV(star.temperature);
	star.color = temperatureToColor(star.temperature);
	
	// --- 5. Lifespan & Age Progression ---
	star.lifespan = getLifespan(star.mass, star.luminosity);
	if (constraint === null) {
		const randomAgeFraction = prng.range(0.2, 0.8);
		const ageGy = star.lifespan.getValueAs(types.units.Time.Gy) * randomAgeFraction;
		star.age = new types.Value(ageGy, types.units.Time.Gy);
	} else {
		star.age = constraint.age;
	}

	// --- 6. Identity ---
	star.name = namegen.generate();

	return star;
}
