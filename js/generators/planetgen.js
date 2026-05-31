
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

/**
 * Get planet core's maximal mass depending on normalized distance.
 * @param {number} sma_norm - planet's normalized distance (in AU☉)
 * @returns {number} value in Earth masses
 */
function getBaseMass(sma_norm) {
	const baseCurve = 2.2 + sma_norm ** 0.4;
	const snowLinePeak = 1 + 7 * Math.exp(-Math.pow((sma_norm - consts.PHY_SNOW_LINE) / 1.0, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_SNOW_LINE
		? 2.25 + 27 * Math.exp(-0.2 * (sma_norm - consts.PHY_SNOW_LINE)) - 0.02 * sma_norm
		: 0;

	return Math.max(baseCurve * snowLinePeak, postSnowLineSlope);
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function generatePlanetCore(sma_norm, star) {
	const baseMass = getBaseMass(sma_norm);
	const metalFactor = Math.pow(1.7, 2.1 * star.metallicity);
	const starMassFactor = 1 - (star.mass.getValueAs(types.units.Mass.M_Sun) + 1) ** (-3);
	const variation = prng.range(0.2, 1.65);

	let coreMass = utils.clamp(baseMass * metalFactor * starMassFactor * variation, 0.1, 55);

	if (sma_norm > consts.PHY_SNOW_LINE * 6.66)
		if (prng() < 0.4) coreMass *= prng.range(0.1, 0.4); // "failed" distant cores

	return coreMass;
}

function generateGasGiant(giantProbability, coreMass, coreToCritRatio, sma_norm) {
	let envelopeMass = 0;

	if (prng() < giantProbability) {
		const isIceGiant = sma_norm > 4.5 && prng() < 0.65;
		if (isIceGiant) {
			// Ice Giant
			envelopeMass = coreMass * prng.range(3.5, 12);
		}
		else {
			// True Gas Giant
			let envelopeMult;

			if (coreToCritRatio > 1.8) {
				// Очень массивное ядро → очень большой шанс на крупный гигант
				envelopeMult = prng.range(18, 65);
			}
			else if (coreToCritRatio > 1.1) {
				envelopeMult = prng.range(9, 38);
			}
			else {
				envelopeMult = prng.range(4.5, 22);
			}

			envelopeMass = coreMass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
		}
		// Дополнительная "удача" для супер-юпитеров (редко)
		if (prng() < 0.12) {
			envelopeMass *= prng.range(1.6, 3.2);
		}
	}
	else {
		// Mini-Neptune / puffed super-Earth
		envelopeMass = coreMass * prng.range(0.35, 6.8);
	}

	return envelopeMass;
}

export function generatePlanet(
	settings = new types.GenerationSettings(),
	star = new types.Star(),
	sma = new types.Value(1.0, types.units.Dist.AU)
) {
	const planet = new types.Planet(star);
	planet.sma = sma;

	const sma_norm = sma.getValueAs(types.units.Dist.AU) / Math.sqrt(star.luminosity); // Converting to AU☉ units

	const coreMass = generatePlanetCore(sma_norm, star);

	const criticalMass = 5.5 + 22 * Math.exp(-0.6 * Math.sqrt(sma_norm));
	let envelopeMass = 0;
	const coreToCritRatio = coreMass / criticalMass;

	if (coreToCritRatio > 0.65) {
		let giantProbability = Math.pow(Math.max(0, coreToCritRatio - 0.62), 2.1) * 1.1;
		giantProbability *= Math.pow(star.metallicity + 0.3, 1.8);
		giantProbability *= Math.pow(sma_norm / 4, -0.35);
		envelopeMass = generateGasGiant(giantProbability, coreMass, coreToCritRatio, sma_norm);
	}

	const totalMass = coreMass + envelopeMass;

	planet.mass = new types.Value(totalMass, types.units.Mass.M_Earth);
	console.log(totalMass.toFixed(2), planet.mass.getValueAs(types.units.Mass.M_Jupiter).toFixed(2));

	return planet;
}
