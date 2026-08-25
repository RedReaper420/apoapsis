
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

import * as nameGen from "./name-gen.js";

/**
 * Generates a completely initialized Star object instance.
 * 
 * @param {T.GenerationSettings} settings - Generation settings configuration.
 * @param {T.Star|T.BinaryStar|null} constraint - Optional star instance to inherit baseline parameters from.
 * @param {number} constraintMassMult  - *[default: 1.0]* Mass modifier factor used to prevent sub-threshold star system generation (see `star-system-gen.js` -> `generateStarFormation()`).
 * 
 * @returns {T.Star} An instantiated and fully calculated Star object.
 */
export function generateStar(settings, constraint = null, constraintMassMult = 1.0) {
	const star = new T.Star();

	// --- 1. Mass Generation ---
	let mass_min = settings.star_mass_min;
	let mass_max = settings.star_mass_max;
	if (constraint !== null) {
		mass_min = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.1 * constraintMassMult);
		mass_max = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.9 * constraintMassMult);
	}
	star.mass = settings.star_mass_use_imf
		? sampleIMF(mass_min, mass_max)
		: new T.Value(prng.range(mass_min, mass_max), T.units.Mass.M_Sun);
	
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
	luminosity *= Math.pow(10, -0.125 * metallicity); 
	radius.value *= (1 + 0.08 * metallicity);

	// Apply natural scatter (variability simulation)
	const luminosityScatter = 0.04 + 0.05 * Math.abs(metallicity); // Extreme metal content causes higher instability
	const radiusScatter = 0.02 + 0.01 * Math.abs(metallicity);
	luminosity *= Math.pow(10, utils.gaussianRandom(0, luminosityScatter));
	radius.value *= Math.exp(utils.gaussianRandom(0, radiusScatter));

	// --- 4. Secondary Derived Calculations ---
	star.luminosity = luminosity;
	star.radius = radius;

	// Density computation: mass (kg) / volume (m³) converted from kg/m³ to g/cm³ (/1000)
	const volumeM3 = (4 / 3) * Math.PI * Math.pow(radius.as(T.units.Dist.m), 3);
	star.density = (star.mass.as(T.units.Mass.kg) / volumeM3) / 1000;

	star.temperature = getTemperature(star.luminosity, star.radius);
	star.type = getType(star.temperature);
	star.absMag = getAbsMagnitude(star.luminosity);
	star.bv = getBV(star.temperature);
	star.color = temperatureToColor(star.temperature);

	// Rotational period
	star.rotationPeriod = getRotation(star.radius, star.mass);
	
	// --- 5. Lifespan & Age Progression ---
	star.lifespan = getLifespan(star.mass, star.luminosity, star.radius, star.rotationPeriod);
	if (constraint === null) {
		const randomAgeFraction = prng.range(0.2, 0.6);
		const fractionAge_Gy = star.lifespan.as(T.units.Time.Gy) * randomAgeFraction;
		
		const flatAge_Gy = prng.range(1.5, 15.0);

		star.age = new T.Value(Math.min(fractionAge_Gy, flatAge_Gy), T.units.Time.Gy);
	} else {
		star.age = constraint.age;
	}

	// --- 6. Identity ---
	star.name = nameGen.generate();

	return star;
}

/**
 * Samples a valid stellar mass from the IMF within a strictly bounded range.
 * 
 * @param {number} minMass - Minimum allowed mass in M☉.
 * @param {number} maxMass - Maximum allowed mass in M☉.
 * 
 * @returns {T.Value} The bounded star mass (unit: `Mass`).
 * 
 * @see {@link sampleKroupaIMF}
 */
function sampleIMF(minMass, maxMass) {
	let mass = 0;

	const MAX_ATTEMPTS = 100;
	let attempts = 0;
	do {
		mass = sampleKroupaIMF();
		attempts++;
	} while ( ((mass < minMass) || (mass > maxMass)) && (attempts < MAX_ATTEMPTS) );

	const finalMass = utils.clamp(mass, minMass, maxMass);

	return new T.Value(finalMass, T.units.Mass.M_Sun);
}

/**
 * Sample stellar mass from Kroupa (2001) IMF.
 * 
 * Broken power-law distribution: 
 * - α = 0.3 (0.01 - 0.08 M☉), 
 * - α = 1.3 (0.08 - 0.5 M☉), 
 * - α = 2.3 (> 0.5 M☉).
 * 
 * Uses inverse transform sampling with proper normalization across boundaries.
 * 
 * @param {number} minMass - Lower limit boundary *[default: {@link consts.PHY_STAR_MASS_MIN}]*.
 * @param {number} maxMass - Upper limit boundary *[default: {@link consts.PHY_STAR_MASS_MAX}]*.
 * 
 * @returns {number} Sampled mass value in solar masses (M☉).
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
 * Samples stellar metallicity [Fe/H] from a truncated normal distribution.
 * 
 * @param {number} mean  - Mean of the distribution (usually 0 or -0.1).
 * @param {number} stdev - Standard deviation (typical: 0.2 to 0.4).
 * @param {number} min	 - Minimum allowed [Fe/H].
 * @param {number} max	 - Maximum allowed [Fe/H].
 * 
 * @returns {number} Calculated metallicity value ([Fe/H]).
 */
function sampleMetallicity(mean, stdev, min, max) {
	let metallicity = 0;
	
	const MAX_ATTEMPTS = 100;
	let attempts = 0;
	do {
		metallicity = utils.gaussianRandom(mean, stdev);
		attempts++;
	} while ( ((metallicity < min) || (metallicity > max)) && (attempts < MAX_ATTEMPTS) );

	return utils.clamp(metallicity, min, max);
}

/**
 * Calculates a star's base luminosity from its mass using the Mass-Luminosity relation.
 * 
 * @param {T.Value} starMass - The mass of the star (unit: `Mass`).
 * 
 * @returns {number} The base luminosity in solar units (L☉).
 * 
 * @see {@link https://en.wikipedia.org/wiki/Mass-luminosity_relation#Advanced_forms} (slightly modified to make the curve almost seamless)
 */
function getLuminosity(starMass) {
	const mass = starMass.as(T.units.Mass.M_Sun);
	
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
 * @param {T.Value} starMass - The mass of the star (unit: `Mass`).
 * 
 * @returns {T.Value} The base radius (unit: `Dist`).
 * 
 * @see {@link https://academic.oup.com/mnras/article/479/4/5491/5056185}
 * @see {@link http://astro.vaporia.com/start/massradius.html}
 */
function getRadius(starMass) {
	const mass = starMass.as(T.units.Mass.M_Sun);

	if (mass <= 1.5)
		return new T.Value(0.438 * (mass**2) + 0.479 * mass + 0.075, T.units.Dist.R_Sun);
	else
		return new T.Value(Math.pow(10, 0.003 + 0.724 * Math.log10(mass)), T.units.Dist.R_Sun);
		//return new T.Value(Math.pow(mass, 0.8), T.units.Dist.R_Sun);
}

/**
 * Calculates effective temperature from luminosity and radius using Stefan-Boltzmann law relation.
 * 
 * @param {number} starLuminosity  - The luminosity in solar units (L☉).
 * @param {T.Value} starRadius - The radius of the star (unit: `Dist`).
 * 
 * @returns {T.Value} The effective temperature (unit: `Temp`).
 */
function getTemperature(starLuminosity, starRadius) {
	const radius = starRadius.as(T.units.Dist.R_Sun);
	const temperature = consts.PHY_SUN_TEMP * Math.pow(starLuminosity / (radius**2), 1/4);
	return new T.Value(temperature, T.units.Temp.K);
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
 * Determines the 2-character spectral type (e.g., "G5", "K8", "O2") from temperature.
 * 
 * @param {T.Value} starTemperature - The effective temperature (unit: `Temp`).
 * 
 * @returns {string} A 2-character string from "O2" to "M9".
 */
function getType(starTemperature) {
	const temperature = starTemperature.as(T.units.Temp.K);

	// Very hot stars
	if (temperature >= starTypeChart[0].max)
		return 'O2';

	for (const { type, max, min } of starTypeChart) {
		if (temperature > min) {
			const fraction = (max - temperature) / (max - min);
			const subtype = Math.round(fraction * (9 - (type === 'O' ? 2 : 0)));
			const clampedSubtype = utils.clamp(subtype, type === 'O' ? 2 : 0, 9);

			return type + clampedSubtype;
		}
	}

	// Very cool stars
	return 'M9';
}

/**
 * Calculates the absolute magnitude of a star from its luminosity.
 * 
 * @param {number} starLuminosity - The luminosity in solar units (L☉).
 * 
 * @returns {number} Absolute magnitude value.
 */
function getAbsMagnitude(starLuminosity) {
	return 4.74 - 2.5 * Math.log10(starLuminosity);
}

/**
 * Estimates the B-V (Blue minus Visual) color index from temperature.
 * 
 * @param {T.Value} starTemperature - The effective temperature (unit: `Temp`).
 * 
 * @returns {number} B-V color index.
 */
function getBV(starTemperature) {
	// Ballesteros 2012 approximation inverted (T -> B-V)
	const temperature = starTemperature.as(T.units.Temp.K);
	
	if (temperature >= 10000)
		return -0.35 + (10000 - temperature) * 0.00004; // Very blue stars

	// Polynomial fit for 2300K - 10000K
	const logT = Math.log10(temperature);
	return 6.014 - 5.606 * logT + 1.866 * (logT**2) - 0.212 * (logT**3);
}

/**
 * Converts stellar effective temperature to an RGB hex color code string.
 * 
 * @param {T.Value} starTemperature - The effective temperature (unit: `Temp`).
 * 
 * @returns {string} Hex color string format: "#RRGGBB".
 * 
 * @see {@link https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html}
 */
export function temperatureToColor(starTemperature) {
	const tempFactor = utils.clamp(starTemperature.as(T.units.Temp.K), 1000, 40000) / 100;
	let red = 0; 
	let green = 0; 
	let blue = 0;

	// --- Red Component ---
	if (tempFactor <= 66) {
		red = 255;
	} 
	else {
		const adjustedTemp = tempFactor - 60;
		red = 329.698727446 * Math.pow(adjustedTemp, -0.1332047592);
	}
	red = utils.clamp(Math.round(red), 0, 255);

	// --- Green Component ---
	if (tempFactor <= 66) {
		green = 99.4708025861 * Math.log(tempFactor) - 161.1195681661;
	} 
	else {
		const adjustedTemp = tempFactor - 60;
		green = 288.1221695283 * Math.pow(adjustedTemp, -0.0755148492);
	}
	green = utils.clamp(Math.round(green), 0, 255);

	// --- Blue Component ---
	if (tempFactor >= 66) {
		blue = 255;
	}
	else {
		if (tempFactor <= 19) {
			blue = 0;
		} 
		else {
			const adjustedTemp = tempFactor - 10;
			blue = 138.5177312231 * Math.log(adjustedTemp) - 305.0447927307;
		}
	}
	blue = utils.clamp(Math.round(blue), 0, 255);
	
	const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
	return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * Calculates a star's rotational period based on its radius and mass.
 * 
 * @param {T.Value} starRadius - The radius of the star (unit: `Dist`).
 * @param {T.Value} starMass - The mass of the star (unit: `Mass`).
 * @returns {T.Value} The rotational period of the star (unit: `Time`).
 */
function getRotation(starRadius, starMass) {
	const R_Sun = starRadius.as(T.units.Dist.R_Sun);
	const R_m = starRadius.as(T.units.Dist.m);
	const M_m = starMass.as(T.units.Mass.kg);

	// Rotational velocity approximation (km/s)
	// Logistic function centered around the Kraft Break (R = 1.3 R☉)
	const v_base = 2.5 + (190 / (1 + Math.exp(-9 * (R_Sun - 1.3))));
	const randomFactor = Math.exp( utils.clamp(utils.gaussianRandom(), -3, 3) );

	// Calculating critical rotational velocity while accounting flattening (Roche model)
	const v_crit = 0.816 * Math.sqrt((consts.PHY_G * M_m) / R_m); 

	// Rotational velocity can't exceed 90% of critical value
	const v_e = Math.min(v_base * randomFactor, v_crit * 0.9); 

	// Calculating rotation period.
	// v = W * R = 2piR / P
	const P = (2 * Math.PI * R_m) / (v_e * 1000);

	return new T.Value(P, T.units.Time.s);
}

/**
 * Calculates a star's lifespan based on its mass, luminosity, radius, and rotational period.
 * 
 * @param {T.Value} starMass - The mass of the star (unit: `Mass`).
 * @param {number} starLuminosity - The luminosity of the star in solar units (L☉).
 * @param {T.Value} starRadius - The radius of the star (unit: `Dist`).
 * @param {T.Value} starRotation - The rotational period of the star (unit: `Time`).
 * 
 * @returns {T.Value} The total lifespan of the star (unit: `Time`).
 */
function getLifespan(starMass, starLuminosity, starRadius, starRotation) {
	const M_Sun = starMass.as(T.units.Mass.M_Sun);
	const M_m = starMass.as(T.units.Mass.kg);
	const R_m = starRadius.as(T.units.Dist.m);
	const P = starRotation.as(T.units.Time.s);

	/*
	// Basic mass-only version
	const a = M_Sun <= 50.0 ? -2.5 : -3.5;
	const lifespan = consts.PHY_SUN_LIFESPAN * Math.pow(M_Sun, a);
	return new T.Value(lifespan, T.units.Time.Gy);
	*/

	const lifespan_base = consts.PHY_SUN_LIFESPAN * (M_Sun / starLuminosity);

	const v = (2 * Math.PI * R_m) / P;
	const v_crit = 0.816 * Math.sqrt((consts.PHY_G * M_m) / R_m); 
	const rotationFactor = 1 + 0.2 * Math.pow(v / v_crit, 2);

	const lifespan = lifespan_base * rotationFactor;

	return new T.Value(lifespan, T.units.Time.Gy);
}
