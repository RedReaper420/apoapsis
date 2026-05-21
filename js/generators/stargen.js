
import prng from "../utils/prng.js";
import consts from "../data/consts.js";
import * as types from "../data/types.js";
import * as namegen from "./namegen.js";

function getLifespan(star_mass, star_luminosity) {
	/*
	// Mass-only version
	const pow = star_mass <= 50.0 ? -2.5 : -3.5;
	return consts.PHY_SUN_LIFESPAN * Math.pow(star_mass, pow);
	*/

	return consts.PHY_SUN_LIFESPAN * (star_mass / star_luminosity);
}

function getLuminosity(star_mass) {
	// https://en.wikipedia.org/wiki/Mass-luminosity_relation#Advanced_forms
	if (star_mass < 0.43)
		return 0.23 * Math.pow(star_mass, 2.3);
	else if (star_mass < 2.0)
		return Math.pow(star_mass, 4);
	else if (star_mass < 53.0)
		return 1.4 * Math.pow(star_mass, 3.5);
	else
		return 32000 * star_mass;
}

function getRadius(star_mass) {
	// https://academic.oup.com/mnras/article/479/4/5491/5056185
	if (star_mass <= 1.5)
		return 0.438*(star_mass*star_mass) + 0.479*star_mass + 0.075;
	else
		return Math.pow(star_mass, 0.8);
}

const starTypeChart = new Map([
	['M', [ 3700,  2300]],
	['K', [ 5200,  3700]],
	['G', [ 6000,  5200]],
	['F', [ 7300,  6000]],
	['A', [10000,  7300]],
	['B', [33000, 10000]],
	['O', [50000, 33000]]
]);

function getType(temperature) {
	for (const [type, [t_max, t_min]] of starTypeChart) {
		if (temperature > t_max) {
			if (type === 'O') {
				// Extremely hot O star or beyond
				return 'O0';
			}
			continue;
		}
		// Found the right bin
		const fraction = (t_max - temperature) / (t_max - t_min);
		const subtype = Math.max(0, Math.min(9, Math.round(fraction * 9)));
		return type + subtype;
	}
	// Fallback (very cool)
	return 'M9';
}

function getTemperature(star_luminosity, star_radius) {
	return consts.PHY_SUN_TEMPERATURE * Math.pow(star_luminosity / (star_radius*star_radius), 1/4);
}

function getAbsMagnitude(star_luminosity) {
	return 4.74 - 2.5 * Math.log10(star_luminosity);
}

// Ballesteros 2012 approximation inverted (T -> B-V)
function getBV(temperature) {
	// Rough but good enough for visualization
	if (temperature >= 10000) {
		return -0.35 + (10000 - temperature) * 0.00004; // very blue
	}
	const x = Math.log10(temperature);
	// Polynomial fit for 2300K - 10000K
	return 6.014 - 5.606 * x + 1.866 * x * x - 0.212 * Math.pow(x, 3);
}

function temperatureToColor(star_temperature) {
	// https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html

	const temp = Math.max(1000, Math.min(40000, star_temperature)) / 100;
	let r; let g; let b;

	// Red
	if (temp <= 66) {
		r = 255;
	}
	else {
		r = temp - 60;
		r = 329.698727446 * Math.pow(r, -0.1332047592);
	}
	r = Math.max(0, Math.min(255, Math.round(r)));

	// Green
	if (temp <= 66) {
		g = temp;
		g = 99.4708025861 * Math.log(g) - 161.1195681661;
	}
	else {
		g = temp - 60;
		g = 288.1221695283 * Math.pow(g, -0.0755148492);
	}
	g = Math.max(0, Math.min(255, Math.round(g)));

	// Blue
	if (temp <= 19) {
		b = 255;
	}
	else {
		b = temp - 10;
		b = 138.5177312231 * Math.log(b) - 305.0447927307;
	}
	b = Math.max(0, Math.min(255, Math.round(b)));
	
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Samples stellar mass from Kroupa (2001) IMF
 * Broken power-law: a = 0.3 (0.01-0.08), 1.3 (0.08-0.5), 2.3 (>0.5)
 * Uses inverse transform sampling with proper normalization.
 */
function sampleKroupaIMF(minMass = 0.08, maxMass = 150) {
	// Kroupa 2001 exponents
	const alpha1 = 0.3;   // 0.01 - 0.08 Msun (brown dwarfs, optional)
	const alpha2 = 1.3;   // 0.08 - 0.5 Msun
	const alpha3 = 2.3;   // > 0.5 Msun

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

function sampleIMF(minMass = 0.08, maxMass = 150) {
	let mass = 0;
	let counter = 0;
	while((mass < minMass) || (mass > maxMass)) {
		counter++;
		mass = sampleKroupaIMF(minMass, maxMass);
	}

	//console.log("Mass sampled in < ", counter," > attempts.");
	return mass;
}

/**
 * Sample metallicity [Fe/H] from a truncated normal distribution
 * @param {number} mean      - Center of the distribution (usually 0 or -0.1)
 * @param {number} stdev     - Standard deviation (typical: 0.2 to 0.4)
 * @param {number} min       - Minimum allowed [Fe/H]
 * @param {number} max       - Maximum allowed [Fe/H]
 * @returns {number}
 */
function sampleMetallicity(mean = 0.0, stdev = 0.35, min = -2.5, max = 0.5) {
    let feh;
    let attempts = 0;
    
    do {
        feh = gaussianRandom(mean, stdev);
        attempts++;
    } while ((feh < min || feh > max) && attempts < 50);

    // Fallback: clamp if we fail to sample inside bounds after many tries
    return Math.max(min, Math.min(max, feh));
}

/**
 * Generates a random number following a normal (Gaussian) distribution
 * @param {number} mean - mean value (usually 0)
 * @param {number} stdev - standard deviation (width of scatter)
 * @returns {number}
 */
function gaussianRandom(mean = 0, stdev = 1) {
	// Box-Muller transform
	let u = 0, v = 0;
	while (u === 0) u = prng(); // avoiding zero
	while (v === 0) v = prng();

	const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
	return z * stdev + mean;
}

export function generateStar(settings=new types.GenerationSettings()) {
	const star = new types.Star();

	star.mass = settings.star_mass_use_imf
		? sampleIMF(settings.star_mass_min, settings.star_mass_max)
		: prng.range(settings.star_mass_min, settings.star_mass_max);

	// Metallicity (positive = metal-rich)
	const feh = settings.star_metallicity_use_gaussian
		? sampleMetallicity(settings.star_metallicity_min, settings.star_metallicity_max)
		: prng.range(settings.star_metallicity_min, settings.star_metallicity_max);
	star.metallicity = feh;

	let L = getLuminosity(star.mass);
	let R = getRadius(star.mass);

	// luminosity: metal-rich -> dimmer
    L *= Math.pow(10, -0.15 * feh);

	// Radius: metal-rich -> bigger
    R *= (1 + 0.08 * feh);

	// Parameters random scatter
	const lum_scatter = 0.04 + 0.08 * Math.abs(feh); // bigger scattering for extreme metallicity
    const rad_scatter = 0.025;
	L *= Math.pow(10, gaussianRandom(0, lum_scatter));
	R *= Math.exp(gaussianRandom(0, rad_scatter));

	star.luminosity = L;
	star.radius = R;
	star.temperature = getTemperature(star.luminosity, star.radius);
	star.type = getType(star.temperature);
	star.lifespan = getLifespan(star.mass, star.luminosity); // in Byr
	star.age = prng.range(0.1, 0.9); // age as fraction of lifespan
	star.abs_mag = getAbsMagnitude(star.luminosity);
	star.bv = getBV(star.temperature);
	star.color = temperatureToColor(star.temperature);

	star.name = namegen.generate();

	return star;
}
