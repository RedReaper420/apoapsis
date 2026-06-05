
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js"; // consts.PHY_SNOW_LINE = 2.7

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function getPlanetCoreMass(sma_norm, star) {
	// Defining the curve
	const startMinMass = 2.5;
	const peakMaxMass = 30;

	const m = peakMaxMass - startMinMass;
	const x = sma_norm - consts.PHY_SNOW_LINE;

	const baseCurve = startMinMass - 0.015 * x**2;
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_SNOW_LINE
		? startMinMass + m * Math.exp(-0.2 * x) - 0.02 * sma_norm
		: 0;
	const baseMass = Math.max(baseCurve * snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.6, 2.1 * star.metallicity);
	const starMassFactor = 1 - (star.mass.getValueAs(types.units.Mass.M_Sun) + 1) ** (-3);
	const variance = utils.randomRangeGaussian(0.05, 1.0);

	let coreMass = utils.clamp(baseMass * metalFactor * starMassFactor * variance, 0.1, 55);
	if (sma_norm > consts.PHY_SNOW_LINE * 6.66)
		if (prng() < (0.4 + 0.1 * (sma_norm - consts.PHY_SNOW_LINE * 6.66))) 
			coreMass *= prng.range(0.05, 0.5); // "failed" distant cores

	return coreMass;
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function getCoreIronFraction(sma_norm, star) {
	const randomBase = 0.1; const randomScatter = 0.3;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	const starMetallicityFactor = 0.15 * Math.exp(0.6 * star.metallicity);
	const distanceFactor = sma_norm > consts.PHY_SNOW_LINE
		? Math.exp(-0.2 * (sma_norm - consts.PHY_SNOW_LINE)) - 0.0005 * (sma_norm - consts.PHY_SNOW_LINE)
		: 1;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor, 0, 1);
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function getCoreIceFraction(sma_norm, star) {
	const maxIceBase = Math.min(0.75, 0.01 + 0.02 * Math.min(sma_norm, consts.PHY_SNOW_LINE) + 0.0015 * Math.exp(2 * Math.min(sma_norm, consts.PHY_SNOW_LINE + 0.01 * sma_norm)));
	const starMetalFactor = Math.exp(0.1 * star.metallicity);
	const maxIce = maxIceBase * starMetalFactor;
	return (utils.randomRangeGaussian(0, maxIce) + prng.range(0, maxIce)) / 2;
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns
 */
function generatePlanetCore(sma_norm, star) {
	const planetCoreMass = getPlanetCoreMass(sma_norm, star);

	const coreIronFraction = getCoreIronFraction(sma_norm, star);
	const coreIceFraction = (1.0 - coreIronFraction) * getCoreIceFraction(sma_norm, star);
	const coreRockFraction = 1.0 - coreIronFraction - coreIceFraction;

	return {
		mass: planetCoreMass,
		composition: {
			iron: coreIronFraction,
			rock: coreRockFraction,
			ice: coreIceFraction
		}
	};
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns 
 */
function makeGasGiant(planet, sma_norm, star) {
	const planetCore = planet.core;
	const criticalMass = 5.5 + 22 * Math.exp(-0.6 * Math.sqrt(sma_norm));
	const coreToCritRatio = planetCore.mass / criticalMass;

	let envelopeMass = 0;
	let planetType = 'Terrestrial';

	let giantProbability = 1.3 * Math.pow(Math.max(0, coreToCritRatio - 0.15), 2.2)
	giantProbability *= Math.pow(sma_norm / 4, -0.35);
	giantProbability *= Math.max(1, 1 + star.metallicity * 0.4);
	
	const iceGiantProbability = Math.pow(1 + Math.pow(0.3 * sma_norm, -2.3), -2.75);
	const isIceGiant = (sma_norm > consts.PHY_SNOW_LINE) && (prng() < iceGiantProbability);

	if (coreToCritRatio > 0.65) {
		if (prng() < giantProbability) {
			if (isIceGiant) {
				// Ice Giant
				envelopeMass = planetCore.mass * prng.range(0.7, 2.7);
				planetType = 'Ice Giant';
			}
			else {
				// True Gas Giant
				let envelopeMult;

				if (coreToCritRatio > 1.8) // Very massive core - very big chance for a large gas giant
					envelopeMult = prng.range(16, 62);
				else if (coreToCritRatio > 1.1)
					envelopeMult = prng.range(7, 24);
				else 
					envelopeMult = prng.range(3, 11);

				// Additional "luck" for enlarged gas giants (enabling super-Jupiters and brown dwarfs)
				if (prng() < (0.1 + star.metallicity * 0.3))
					envelopeMult *= prng.range(1.5, 3.0);

				envelopeMass = planetCore.mass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
				planetType = 'Gas Giant';
			}
		}
		else if (prng() < 0.5) {
			// Mini-Neptune / puffed super-Earth
			envelopeMass = planetCore.mass * prng.range(0.08, 0.7);
			planetType = 'Mini-Neptune';
		}
	}

	planet.type = planetType;
	const envelopeGasFraction = isIceGiant
		? prng.range(0.1, 0.3)
		: prng.range(0.85, 0.95);
	
	return {
		mass: envelopeMass,
		composition: {
			gas: envelopeGasFraction,
			ice: 1.0 - envelopeGasFraction
		}
	};
}

// Constants derived from Seager et al. and Lopez & Fortney
const EOS = {
	iron: { r0: 0.70, alpha: 0.266, beta: -0.015, gamma: 0.50 },
	rock: { r0: 1.00, alpha: 0.274, beta: -0.021, gamma: 0.51 },
	ice:  { r0: 1.25, alpha: 0.282, beta: -0.033, gamma: 0.53 }
};

/**
 * 
 * @param {number} mass 
 * @param {string} material 
 * @returns {number}
 */
function getMaterialRadius(mass, material) {
	if (mass <= 0) return 0;
	const config = EOS[material];
	// R = r0 * M^alpha + beta * M^gamma
	return config.r0 * Math.pow(mass, config.alpha) + config.beta * Math.pow(mass, config.gamma);
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 */
function setPlanetRadius(planet, sma_norm, star) {
	// 1. Separate Gas and Ice fractions from the envelope
	const totalEnvelopeMass = planet.envelope.mass;
	const gasFraction = planet.envelope.composition.gas;

	const gasMass = totalEnvelopeMass * gasFraction;
	const extraIceMass = totalEnvelopeMass * (1 - gasFraction);

	// 2. Re-balance Core Mass to include volatile envelope ice
	const baseCoreMass = planet.core.mass;
	const totalCoreMass = baseCoreMass + extraIceMass;
	const totalMass = totalCoreMass + gasMass;

	// Adjust fractions based on added ice mass
	let f_iron = 0, f_rock = 0, f_ice = 0;
	f_iron = (baseCoreMass * planet.core.composition.iron) / totalCoreMass;
	f_rock = (baseCoreMass * planet.core.composition.rock) / totalCoreMass;
	f_ice = ((baseCoreMass * planet.core.composition.ice) + extraIceMass) / totalCoreMass;

	// 3. Compute pure component radii at total core mass
	const r_iron = getMaterialRadius(totalCoreMass, 'iron');
	const r_rock = getMaterialRadius(totalCoreMass, 'rock');
	const r_ice = getMaterialRadius(totalCoreMass, 'ice');

	// Volumetric averaging to find the structural core radius
	const coreRadius = Math.cbrt(
		f_iron * Math.pow(r_iron, 3) +
		f_rock * Math.pow(r_rock, 3) +
		f_ice * Math.pow(r_ice, 3)
	);

	// 4. Compute Gas Envelope thickness if gas mass exists
	let totalRadius = coreRadius;
	let gasThickness = 0;
	if (gasMass > 0) {
		const stellarFlux = 1 / Math.pow(sma_norm, 2); // Solar flux scaling
		const fluxPuffFactor = Math.pow(stellarFlux, 0.05);
		const ageFactor = 1;//star.age.getValueAs(types.units.Time.Gy) / 5;

		const R_Jupiter = new types.Value(1, types.units.Dist.R_Jupiter).getValueAs(types.units.Dist.R_Earth);
		const M_Jupiter = new types.Value(1, types.units.Mass.M_Jupiter).getValueAs(types.units.Mass.M_Earth);

		// Jovian Transition Boundary: Around ~120 Earth Masses (~0.4 Jupiter Mass)
		if (totalMass > 120) {
			// High-Mass Regime (Gas Giants & Super Jupiters)
			// Radius scales slowly with mass downward due to gravitational self-compression: R ~ 11.2 * M^-0.04
			// For Super Jupiters, shrinking slows down and stop at 95% of Jupiter's radius due to electron degeneracy pressure.
			const power = totalMass < M_Jupiter ? -0.04 : -0.02;
			const baseRadius = R_Jupiter * Math.pow(totalMass / M_Jupiter, power);
			totalRadius = baseRadius * fluxPuffFactor * Math.pow(ageFactor, -0.06);
			if (totalMass > M_Jupiter) totalRadius = Math.max(R_Jupiter * 0.95, totalRadius);
			gasThickness = totalRadius - coreRadius;
		}
		else {
			// Low-to-Mid Mass Regime (Sub-Neptunes, Ice Giants, & Saturn-like Gas Giants)
			gasThickness = 2.4 * Math.pow(gasMass / totalCoreMass, 0.22) * fluxPuffFactor * Math.pow(ageFactor, -0.11);
			totalRadius = coreRadius + gasThickness;
		}
	}

	// Calculate final density for sanity checks (Bulk Density in g/cm³)
	// Earth Density ~ 5.51 g/cm³
	const bulkDensity = totalMass / Math.pow(totalRadius, 3) * consts.PHY_DENSITY_EARTH;

	planet.core.radius = new types.Value(coreRadius, types.units.Dist.R_Earth);
	planet.envelope.thickness = new types.Value(gasThickness, types.units.Dist.R_Earth).convertUnitTo(types.units.Dist.km);

	planet.radius = new types.Value(totalRadius, types.units.Dist.R_Earth);
	planet.density = bulkDensity;
}

function assumeAlbedo(planet, sma_norm) {
	switch (planet.type) {
		case 'Gas Giant':
			return 0.5;
		case 'Ice Giant':
		case 'Mini-Neptune':
			return 0.4;

		default: { // Terrestrial / Rocky / Icy Worlds
			// 1. Airless/Dry Crusts (e.g., Mercury, Moon, dry Super-Earths)
			if (planet.core.composition.ice < 0.01) {
				return 0.15;
			}

			// 2. Volatile-Rich Worlds (Albedo determined by stellar distance / state of water)
			if (sma_norm < 0.95) { // HZ inner bound
				return 0.60; // Runaway Greenhouse / Puffed Steam Clouds (Highly reflective like Venus)
			}

			if (sma_norm > 1.37) { // HZ outer bound
				return 0.75; // Glaciated / Snowball / Deep Freeze (Ice & Snow are highly reflective)
			}

			// 3. Liquid Ocean / Active Hydrological Cycle (e.g., Earth-like balance of water and land)
			return 0.30;
		}
	}
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Star} star 
 * @returns {types.Value}
 */
function getEffectiveTemperature(planet, sma_norm) {
	const albedo = assumeAlbedo(planet, sma_norm);
	console.log(albedo);
	const T = (consts.PHY_TEMP_EARTH_EQ * Math.pow(1 - albedo, 1/4)) / Math.sqrt(sma_norm);
	return new types.Value(T, types.units.Temp.K);
}

/**
 * @todo terrestrial planets
 * @todo moons
 * @todo binaries
 * @param {types.GenerationSettings} settings 
 * @param {types.Star} star 
 * @param {types.Value} sma 
 * @returns {types.Planet}
 */
export function generatePlanet(settings, star, sma) {
	const planet = new types.Planet(star);
	planet.sma = sma;
	const sma_norm = sma.getValueAs(types.units.Dist.AU) / Math.sqrt(star.luminosity); // Converting to AU☉ units

	planet.core = generatePlanetCore(sma_norm, star);
	planet.envelope = makeGasGiant(planet, sma_norm, star);
	setPlanetRadius(planet, sma_norm, star);
	planet.temperature = getEffectiveTemperature(planet, sma_norm);

	planet.mass = new types.Value(planet.core.mass + planet.envelope.mass, types.units.Mass.M_Earth);

	console.log(`
${planet.type}
${planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(2)} M_E (${planet.mass.getValueAs(types.units.Mass.M_Jupiter).toFixed(1)} M_J)
${planet.core.mass.toFixed(1)} / ${planet.envelope.mass.toFixed(1)}
${planet.radius.getValueAs(types.units.Dist.R_Earth).toFixed(2)} R_E (${planet.radius.getValueAs(types.units.Dist.km).toFixed(0)} km, ${planet.radius.getValueAs(types.units.Dist.R_Jupiter).toFixed(2)} R_J)
${planet.density.toFixed(1)} g/cm3
${planet.temperature.getValueAs(types.units.Temp.C).toFixed(1)} C;
${new types.Value(Math.sqrt( ((4 * Math.PI**2) / (consts.PHY_G * (planet.mass.getValueAs(types.units.Mass.kg) + star.mass.getValueAs(types.units.Mass.kg)))) * Math.pow(sma.getValueAs(types.units.Dist.m), 3) ), types.units.Time.s).getValueAs(types.units.Time.d)} d
`);
	//console.log(JSON.stringify(planetCore, null, '\t'));

	return planet;
}
