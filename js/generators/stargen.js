
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import consts from "../data/consts.js";
import * as types from "../data/types.js";
import * as namegen from "./namegen.js";

/**
 * Get a star's lifespan from its mass and luminosity.
 * @param {types.Value} starMass - <types.units.Mass.X>
 * @param {number} starLuminosity - in L☉
 * @returns {types.Value} <types.units.Time.X>
 */
function getLifespan(starMass, starLuminosity) {
	const mass = starMass.getValueAs(types.units.Mass.M_Sun);
	/*
	// Mass-only version
	const pow = mass <= 50.0 ? -2.5 : -3.5;
	const lifespan = consts.PHY_SUN_LIFESPAN * Math.pow(mass, pow);
	return new types.Value(lifespan, types.units.Time.Gy);
	*/
	const lifespan = consts.PHY_SUN_LIFESPAN * (mass / starLuminosity);
	return new types.Value(lifespan, types.units.Time.Gy);
}

/**
 * Get a star's basic luminosity from its mass.
 * 
 * @param {types.Value} starMass - <types.units.Mass.X>
 * @returns {number} value in L☉
 * 
 * @see {@link https://en.wikipedia.org/wiki/Mass-luminosity_relation#Advanced_forms} - slightly modified to make the curve almost seamless.
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
 * Get a star's basic radius from its mass.
 * @param {types.Value} starMass - <types.units.Mass.X>
 * @returns {types.Value} <types.units.Dist.X>
 * @see {@link https://academic.oup.com/mnras/article/479/4/5491/5056185}
 */
function getRadius(starMass) {
	const mass = starMass.getValueAs(types.units.Mass.M_Sun);

	if (mass <= 1.5)
		return new types.Value(0.438 * (mass**2) + 0.479 * mass + 0.075, types.units.Dist.R_Sun);
	else
		return new types.Value(Math.pow(mass, 0.8), types.units.Dist.R_Sun);
}

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
 * Get a star's spectral type from its temperature.
 * @param {types.Value} starTemperature - <types.units.Temp.X>
 * @returns {string} letter+number 2-char string, from "O0" to "M9"
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
 * Get a star's temperature from its luminosity and radius.
 * @param {number} starLuminosity - in L☉
 * @param {types.Value} starRadius - <types.units.Dist.X>
 * @returns {types.Value} <types.units.Temp.X>
 */
function getTemperature(starLuminosity, starRadius) {
	const radius = starRadius.getValueAs(types.units.Dist.R_Sun);
	const temperature = consts.PHY_SUN_TEMPERATURE * Math.pow(starLuminosity / (radius**2), 1/4);
	return new types.Value(temperature, types.units.Temp.K);
}

/**
 * Get a star's absolute magnitude from its luminosity.
 * @param {number} starLuminosity - in L☉
 * @returns {number}
 */
function getAbsMagnitude(starLuminosity) {
	return 4.74 - 2.5 * Math.log10(starLuminosity);
}

/**
 * Get a B-V color index of a star from its temperature.
 * @param {types.Value} starTemperature - <types.units.Temp.X>
 * @returns {number}
 */
function getBV(starTemperature) {
	// Ballesteros 2012 approximation inverted (T -> B-V)
	
	const temperature = starTemperature.getValueAs(types.units.Temp.K);

	// Rough but good enough for visualization
	if (temperature >= 10000) {
		return -0.35 + (10000 - temperature) * 0.00004; // very blue
	}
	const x = Math.log10(temperature);
	// Polynomial fit for 2300K - 10000K
	return 6.014 - 5.606 * x + 1.866 * x * x - 0.212 * Math.pow(x, 3);
}

/**
 * Get a RGB color of a star from its temperature.
 * @param {types.Value} starTemperature - <types.units.Temp.X>
 * @returns {string} "#RRGGBB"
 * @see {@link https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html}
 */
function temperatureToColor(starTemperature) {
	const temp = utils.clamp(starTemperature.getValueAs(types.units.Temp.K), 1000, 40000) / 100;
	let r; let g; let b;

	// Red
	if (temp <= 66) {
		r = 255;
	}
	else {
		r = temp - 60;
		r = 329.698727446 * Math.pow(r, -0.1332047592);
	}
	r = utils.clamp(Math.round(r), 0, 255);

	// Green
	if (temp <= 66) {
		g = temp;
		g = 99.4708025861 * Math.log(g) - 161.1195681661;
	}
	else {
		g = temp - 60;
		g = 288.1221695283 * Math.pow(g, -0.0755148492);
	}
	g = utils.clamp(Math.round(g), 0, 255);

	// Blue
	if (temp <= 19) {
		b = 255;
	}
	else {
		b = temp - 10;
		b = 138.5177312231 * Math.log(b) - 305.0447927307;
	}
	b = utils.clamp(Math.round(b), 0, 255);
	
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Sample stellar mass from Kroupa (2001) IMF.
 * 
 * Broken power-law: a = 0.3 (0.01-0.08), 1.3 (0.08-0.5), 2.3 (>0.5)
 * 
 * Uses inverse transform sampling with proper normalization.
 */
function sampleKroupaIMF(minMass = consts.PHY_STAR_MASS_MIN, maxMass = consts.PHY_STAR_MASS_MAX) {
	// Kroupa 2001 exponents
	const alpha1 = 0.3;   // 0.01 - 0.08 M☉ (brown dwarfs, optional)
	const alpha2 = 1.3;   // 0.08 - 0.5 M☉
	const alpha3 = 2.3;   // > 0.5 M☉

	const m1 = 0.01;
	const m2 = 0.08;
	const m3 = 0.5;
	const m4 = maxMass;

	// We usually start from 0.08 for stars, but support lower if wanted
	const lowLimit = Math.max(minMass, 0.01);

	// Compute cumulative distribution function (CDF) segments
	let cdf1 = 0, cdf2 = 0, cdf3 = 0;

	// Segment 1: very low mass (rarely used for stars)
	if (lowLimit < m2) {
		const norm1 = (Math.pow(m2, 1 - alpha1) - Math.pow(m1, 1 - alpha1)) / (1 - alpha1);
		cdf1 = norm1;
	}

	// Segment 2: 0.08 - 0.5
	const norm2 = (Math.pow(m3, 1 - alpha2) - Math.pow(m2, 1 - alpha2)) / (1 - alpha2);
	cdf2 = cdf1 + norm2;

	// Segment 3: 0.5 - maxMass
	const norm3 = (Math.pow(m4, 1 - alpha3) - Math.pow(m3, 1 - alpha3)) / (1 - alpha3);
	const total = cdf2 + norm3;

	const u = prng() * total;  // uniform [0, total)

	// Inverse sampling
	if (u < cdf1) {
		// Very low mass regime
		return Math.pow(Math.pow(m1, 1 - alpha1) + u * (1 - alpha1), 1 / (1 - alpha1));
	}
	else if (u < cdf2) {
		const u2 = u - cdf1;
		return Math.pow(Math.pow(m2, 1 - alpha2) + u2 * (1 - alpha2), 1 / (1 - alpha2));
	}
	else {
		const u3 = u - cdf2;
		return Math.pow(Math.pow(m3, 1 - alpha3) + u3 * (1 - alpha3), 1 / (1 - alpha3));
	}
}

/**
 * Sample stellar mass from IMF, truncating the mass value within the specified range.
 * @param {number} minMass - minimal allowed star mass (in M☉)
 * @param {number} maxMass - maximal allowed star mass (in M☉)
 * @returns {types.Value}
 * @see {@link sampleKroupaIMF}
 */
function sampleIMF(minMass, maxMass) {
	let mass = 0;
	let attempts = 0;
	do {
		mass = sampleKroupaIMF();
		attempts++;
	} while((mass < minMass || mass > maxMass) && attempts < 100);

	return new types.Value(utils.clamp(mass, minMass, maxMass), types.units.Mass.M_Sun);
}

/**
 * Sample metallicity [Fe/H] from a truncated normal distribution.
 * @param {number} mean      - Center of the distribution (usually 0 or -0.1)
 * @param {number} stdev     - Standard deviation (typical: 0.2 to 0.4)
 * @param {number} min       - Minimum allowed [Fe/H]
 * @param {number} max       - Maximum allowed [Fe/H]
 * @returns {number}
 */
function sampleMetallicity(mean, stdev, min, max) {
	let feh;
	let attempts = 0;

	do {
		feh = utils.gaussianRandom(mean, stdev);
		attempts++;
	} while ((feh < min || feh > max) && attempts < 100);

	// Fallback: clamp if we fail to sample inside bounds after many tries
	return utils.clamp(feh, min, max);
}

/**
 * Generate a star instance.
 * @param {types.GenerationSettings} settings
 * @param {types.Star} constraint - [optional] other star constraint, will restrict the generated star's mass, and will assign a simillar metallicity an age values to it.
 * @returns {types.Star}
 */
export function generateStar(settings, constraint = null) {
	const star = new types.Star();

	// A constraint is influencing on: mass, metallicity, age

	// Mass
	let mass_min = settings.star_mass_min;
	let mass_max = settings.star_mass_max;
	if (constraint !== null) {
		mass_min = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.1);
		mass_max = Math.max(consts.PHY_STAR_MASS_MIN, constraint.mass.value * 0.9);
	}
	star.mass = settings.star_mass_use_imf
		? sampleIMF(mass_min, mass_max)
		: new types.Value(prng.range(mass_min, mass_max), types.units.Mass.M_Sun);
	
	// Metallicity (positive = metal-rich)
	let feh = 0;
	if (constraint === null) {
		feh = settings.star_metallicity_use_gaussian
		? sampleMetallicity(
			settings.star_metallicity_mean,
			settings.star_metallicity_std,
			settings.star_metallicity_min,
			settings.star_metallicity_max)
		: prng.range(settings.star_metallicity_min, settings.star_metallicity_max);
	}
	else {
		feh = utils.clamp(constraint.metallicity * prng.range(0.9, 1.1), 
			consts.PHY_STAR_METALLICITY_MIN, consts.PHY_STAR_METALLICITY_MAX);
		star.metallicity = feh;
	}
	star.metallicity = feh;

	// Basic luminosity and radius
	let L = getLuminosity(star.mass);
	let R = getRadius(star.mass);

	// Metallicity-adjusted luminosity and radius
	L *= Math.pow(10, -0.15 * feh); // Metal-rich -> dimmer
	R.value *= (1 + 0.08 * feh); // Metal-rich -> bigger

	// Parameters random scatter
	const lum_scatter = 0.04 + 0.08 * Math.abs(feh); // Bigger scattering for extreme metallicity
	const rad_scatter = 0.025;
	L *= Math.pow(10, utils.gaussianRandom(0, lum_scatter));
	R.value *= Math.exp(utils.gaussianRandom(0, rad_scatter));

	star.luminosity = L;
	star.radius = R;
	star.density = star.mass.getValueAs(types.units.Mass.kg) / ((4/3)*Math.PI*(R.getValueAs(types.units.Dist.m)**3)) / 1000;
	star.temperature = getTemperature(star.luminosity, star.radius);
	star.type = getType(star.temperature);
	star.absMag = getAbsMagnitude(star.luminosity);
	star.bv = getBV(star.temperature);
	star.color = temperatureToColor(star.temperature);
	
	star.lifespan = getLifespan(star.mass, star.luminosity);
	if (constraint === null)
		star.age = new types.Value(star.lifespan.getValueAs(types.units.Time.Gy) * prng.range(0.1, 0.9), types.units.Time.Gy);
	else
		star.age = constraint.age;

	star.name = namegen.generate();

	return star;
}
