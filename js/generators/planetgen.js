
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as namegen from "./namegen.js";

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function samplePlanetCoreMass(sma_norm, star) {
	// Defining the curve
	const startMinMass = 2.0;
	const peakMaxMass = 25.0;

	const m = peakMaxMass - startMinMass;
	const x = sma_norm - consts.PHY_DIST_SNOW_LINE;

	const baseCurve = startMinMass - 0.015 * x**2;
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_DIST_SNOW_LINE
		? startMinMass + m * Math.exp(-0.2 * x) - 0.02 * sma_norm
		: 0;
	const baseMass = Math.max(baseCurve * snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.6, 2.1 * star.metallicity);
	const starMassFactor = 1 - (star.mass.getValueAs(types.units.Mass.M_Sun) + 1) ** (-3);
	const variance = utils.randomRangeGaussian(0.05, 1.0);

	let coreMass = utils.clamp(baseMass * metalFactor * starMassFactor * variance, 0.1, 55);
	if (sma_norm > consts.PHY_DIST_SNOW_LINE * 6.66)
		if (prng() < (0.4 + 0.1 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 6.66))) 
			coreMass *= prng.range(0.05, 0.5); // "failed" distant cores

	return coreMass;
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function sampleCoreIronFraction(sma_norm, star) {
	const randomBase = 0.1; const randomScatter = 0.3;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	const starMetallicityFactor = 0.15 * Math.exp(0.6 * star.metallicity);
	const distanceFactor = sma_norm > consts.PHY_DIST_SNOW_LINE
		? Math.exp(-0.2 * (sma_norm - consts.PHY_DIST_SNOW_LINE)) - 0.0005 * (sma_norm - consts.PHY_DIST_SNOW_LINE)
		: 1;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor, 0, 1);
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * @returns {number}
 */
function sampleCoreIceFraction(sma_norm, star) {
	const maxIceBase = Math.min(0.65, 0.01 + 0.02 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.00125 * Math.exp(2 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE + 0.01 * sma_norm)));
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
	const planetCoreMass = samplePlanetCoreMass(sma_norm, star);

	const coreIronFraction = sampleCoreIronFraction(sma_norm, star);
	const coreIceFraction = (1.0 - coreIronFraction) * sampleCoreIceFraction(sma_norm, star);
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
	const criticalMass = 5.5 + 22 * Math.exp(-0.6 * Math.sqrt(sma_norm));
	const coreToCritRatio = planet.core.mass / criticalMass;

	let envelopeMass = 0;
	let planetType = 'Terrestrial';

	let giantProbability = 1.3 * Math.pow(Math.max(0, coreToCritRatio - 0.15), 2.2)
	giantProbability *= Math.pow(sma_norm / 4, -0.35);
	giantProbability *= Math.max(1, 1 + star.metallicity * 0.4);
	
	const iceGiantProbability = Math.pow(1 + Math.pow(0.3 * sma_norm, -2.3), -2.75);
	let isIceGiant = false;

	if (coreToCritRatio > 0.65) {
		if (prng() < giantProbability) {
			isIceGiant = (sma_norm > consts.PHY_DIST_SNOW_LINE) && (prng() < iceGiantProbability);

			if (isIceGiant) {
				// Ice Giant
				envelopeMass = planet.core.mass * prng.range(0.7, 2.7);
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

				envelopeMass = planet.core.mass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
				planetType = 'Gas Giant';
			}
		}
		else if (prng() < 0.5) {
			// Mini-Neptune / puffed super-Earth
			isIceGiant = true;
			envelopeMass = planet.core.mass * prng.range(0.05, 0.7);
			planetType = 'Mini-Neptune';
		}
	}

	planet.type = planetType;
	let envelopeIceFraction = isIceGiant ? prng.range(0.65, 0.85) : prng.range(0.05, 0.15);
	let envelopeIceMass = envelopeMass * envelopeIceFraction;
	
	// Transfering ices from the core to the envelope
	if (envelopeMass > 0) {
		// Core mass subtraction
		const coreIceMass = planet.core.mass * planet.core.composition.ice;
		const coreMassIceless = planet.core.mass - coreIceMass;
		
		// Core fractions corrections
		planet.core.composition.iron /= coreMassIceless / planet.core.mass;
		planet.core.composition.rock /= coreMassIceless / planet.core.mass;
		planet.core.composition.ice = 0;

		// Transfer to the envelope
		envelopeMass += coreIceMass;
		envelopeIceMass += coreIceMass;
		envelopeIceFraction = envelopeIceMass / envelopeMass;
	}
	
	return {
		mass: envelopeMass,
		composition: {
			gas: 1.0 - envelopeIceFraction,
			ice: envelopeIceFraction
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
		const ageFactor = star.age.getValueAs(types.units.Time.Gy) / 5;

		const R_Jupiter = new types.Value(1, types.units.Dist.R_Jupiter).getValueAs(types.units.Dist.R_Earth);
		const M_Jupiter = new types.Value(1, types.units.Mass.M_Jupiter).getValueAs(types.units.Mass.M_Earth);

		// Jovian Transition Boundary: Around ~120 Earth Masses (~0.4 Jupiter Mass)
		if (totalMass > 120) {
			// High-Mass Regime (Gas Giants & Super Jupiters)
			// Radius scales slowly with mass downward due to gravitational self-compression: R ~ 11.2 * M^-0.04
			// For Super Jupiters, shrinking slows down and stop at 95% of Jupiter's radius due to electron degeneracy pressure.
			const power = totalMass < M_Jupiter ? -0.04 : -0.02;
			const baseRadius = R_Jupiter * Math.pow(totalMass / M_Jupiter, power);
			totalRadius = baseRadius * fluxPuffFactor * Math.pow(ageFactor, -0.03);
			if (totalMass > M_Jupiter) totalRadius = Math.max(R_Jupiter * 0.95, totalRadius);
			gasThickness = totalRadius - coreRadius;
		}
		else {
			// Low-to-Mid Mass Regime (Sub-Neptunes, Ice Giants, & Saturn-like Gas Giants)
			gasThickness = 2.4 * Math.pow(gasMass / totalCoreMass, 0.22) * fluxPuffFactor * Math.pow(ageFactor, -0.07);
			totalRadius = coreRadius + gasThickness;
		}
	}

	// Calculate final density for sanity checks (Bulk Density in g/cm³)
	// Earth Density ~ 5.51 g/cm³
	const bulkDensity = totalMass / Math.pow(totalRadius, 3) * consts.PHY_EARTH_DENSITY;

	planet.core.radius = new types.Value(coreRadius, types.units.Dist.R_Earth);
	planet.envelope.thickness = new types.Value(gasThickness, types.units.Dist.R_Earth).convertUnitTo(types.units.Dist.km);

	planet.radius = new types.Value(totalRadius, types.units.Dist.R_Earth);
	planet.density = bulkDensity;
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 */
function assumeAlbedo(planet, sma_norm) {
	switch (planet.type) {
		case 'Gas Giant':
			return 0.50;
		case 'Ice Giant':
		case 'Mini-Neptune':
			return 0.45;

		default: { // Terrestrial / Rocky / Icy Worlds
			// 1. Airless/Dry Crusts (e.g., Mercury, Moon, dry Super-Earths)
			if (planet.core.composition.ice < 0.01) {
				return 0.15;
			}

			// 2. Volatile-Rich Worlds (Albedo determined by stellar distance / state of water)
			if (sma_norm < consts.PHY_DIST_HZ_INNER) { // HZ inner bound
				return 0.60; // Runaway Greenhouse / Puffed Steam Clouds (Highly reflective like Venus)
			}

			if (sma_norm > consts.PHY_DIST_HZ_OUTER) { // HZ outer bound
				return 0.75; // Glaciated / Snowball / Deep Freeze (Ice & Snow are highly reflective)
			}

			// 3. Liquid Ocean / Active Hydrological Cycle (e.g., Earth-like balance of water and land)
			return 0.35;
		}
	}
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Star} star 
 * @returns {types.Value} <types.units.Temp.X>
 */
function getEffectiveTemperature(planet, sma_norm) {
	const albedo = assumeAlbedo(planet, sma_norm);
	const T_eq = (consts.PHY_EARTH_EQ_TEMP * Math.pow(1 - albedo, 1/4)) / Math.sqrt(sma_norm);
	return new types.Value(T_eq, types.units.Temp.K);
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 */
function generateAtmosphere(planet, sma_norm) {
	const coreMass = planet.core.mass; // in M⊕
	const atmosphere = {
		// molecular weight | gas escape velocity | mass | fraction
		H2:  { m_w: 0.002,		v_th: 0,			mass: 0, f: 0 },
		H2O: { m_w: 0.018,		v_th: 0,			mass: 0, f: 0 },
		N2:  { m_w: 0.028,		v_th: 0,			mass: 0, f: 0 },
		CO2: { m_w: 0.044,		v_th: 0,			mass: 0, f: 0 },
		CH4: { m_w: 0.016,		v_th: 0,			mass: 0, f: 0 },
		NH3: { m_w: 0.017,		v_th: 0,			mass: 0, f: 0 },
		O2:  { m_w: 0.032,		v_th: 0,			mass: 0, f: 0 },
		Ar:  { m_w: 0.040,		v_th: 0,			mass: 0, f: 0 }
	}

	// Sources fractions
	const f_rock = planet.core.composition.rock;
	const f_ice = planet.core.composition.ice;

	// Scaling factors
	const phi_volcanic = 10**prng.range(-2.0, 2.0) * prng.range(0.5, 1.5); // Some worlds are dead, some are hyper-active
	const phi_sublime = (sma_norm < 0.5 ? 0.01 : 0.01 * Math.min(2.0, 1 + f_ice * 5)) * prng.range(0.5, 1.5);
	
	// Yielding factors
	const Y_rock = 0.000003 * phi_volcanic * Math.pow(coreMass, 1/3);
	const Y_ice = 0.0002 * phi_sublime * Math.pow(coreMass, 1/3);

	// Asssigning primordial gases from volcanic outgassing and volatile vaporization
	atmosphere.H2.mass =  coreMass * ( (f_rock * Y_rock * 0.01) + (f_ice * Y_ice * 0.06) );
	atmosphere.H2O.mass = coreMass * ( (f_rock * Y_rock * 0.05) + (f_ice * Y_ice * 0.70) );
	atmosphere.N2.mass =  coreMass * ( (f_rock * Y_rock * 0.25) + (f_ice * Y_ice * 0.08) );
	atmosphere.CO2.mass = coreMass * ( (f_rock * Y_rock * 0.65) + (f_ice * Y_ice * 0.15) );
	atmosphere.O2.mass =  coreMass * ( (f_rock * Y_rock * 0.03) + (f_ice * Y_ice * 0.01) );
	atmosphere.Ar.mass =  coreMass * ( (f_rock * Y_rock * 0.01) + (f_ice * Y_ice * 0.00) );

	const temp_eq = planet.temperature_eq.getValueAs(types.units.Temp.K);

	if (temp_eq < 150 && f_ice > 0.01) {
		// Cold Reducing Atmosphere (Titan / Pluto archetype)
		// Convert portions of CO2 and N2 into CH4 and NH3
		const conversionFactor = prng.range(0.5, 0.9);

		atmosphere.CH4.mass = atmosphere.CO2.mass * conversionFactor;
		atmosphere.CO2.mass *= (1 - conversionFactor);

		atmosphere.NH3.mass = atmosphere.N2.mass * conversionFactor * 0.5;
		atmosphere.N2.mass *= (1 - conversionFactor * 0.5);
	}
	/*
	// !!! TODO: in the future move this part to a section that will be calculating life-related stuff

	else if (temp_eq > 273 && temp_eq < 340 && prng() < 0.15) {
		// Optional Life Check: Convert CO2 to O2 if inside HZ
		atmosphere.O2.mass = atmosphere.CO2.mass * 0.21;
		atmosphere.CO2.mass *= 0.79;
	}
	*/

	// Calculating escape velocity for the planet
	const coreRadius = planet.radius.getValueAs(types.units.Dist.R_Earth);
	const v_esc = consts.PHY_EARTH_ESCAPE_VELOCITY * Math.sqrt(coreMass / coreRadius);
	
	for (const gas in atmosphere) {
		// Calculating escape velocities for various gases
		atmosphere[gas].v_th = Math.sqrt((3 * consts.PHY_R_GAS * temp_eq) / atmosphere[gas].m_w);

		// Jeans escape check
		// A planet can hold gas for a long time if planet's escape velocity is at least 6 times the thermal velocity of that gas
		if (v_esc < 6 * atmosphere[gas].v_th)
			atmosphere[gas].mass = 0;
	}

	// Stellar Wind Stripping / Photoevaporation
	const stripIntensity = 1 / Math.sqrt(sma_norm); // Near the star = huge modifier
	for (const gas in atmosphere) {
		if (atmosphere[gas].mass > 0) {
			// Heavier molecular weight = resists stripping much better
			const weightProtection = atmosphere[gas].m_w / atmosphere.CO2.m_w;
			atmosphere[gas].mass /= 1 + stripIntensity / weightProtection;
		}
	}

	const strippingFactor = Math.pow(sma_norm / 0.70, 2); // Closer = harsher stripping
	for (const gas in atmosphere) atmosphere[gas].mass *= Math.min(1, (atmosphere[gas].m_w / atmosphere.H2O.m_w) * strippingFactor);

	// Absolute total atmospheric mass
	let M_atm_total = 0;
	for (const gas in atmosphere) M_atm_total += atmosphere[gas].mass; // in M⊕
	const atmosphereMass = new types.Value(M_atm_total, types.units.Mass.M_Earth).convertUnitTo(types.units.Mass.M_Earth_atm);

	// Atmosphere pressure at the surface
	const P_surf = atmosphereMass.getValueAs(types.units.Mass.M_Earth_atm) / (coreRadius**4); // in atm.

	// Gases fractions
	for (const gas in atmosphere) atmosphere[gas].f = M_atm_total === 0 ? 0 : atmosphere[gas].mass / M_atm_total;

	// Optical depth
	const tau = Math.pow(P_surf, 1.2) * ( 
		(atmosphere.H2O.f * 2.50) + // Water vapor is a very potent greenhouse gas
		(atmosphere.CO2.f * 0.15) + // CO2 is a moderate greenhouse gas
		(atmosphere.CH4.f * 0.80) + // Methane is a potent greenhouse gas
		(atmosphere.NH3.f * 1.20) + // Ammonia is a potent greenhouse gas
		(atmosphere.N2.f  * 0.01)   // Nitrogen's influence is very low
	);

	// Calculating surface temperature using a grey-atmosphere approximation
	const temp_surf = temp_eq * Math.pow(1 + 3/4 * tau, 1/4);
	const T_surf = new types.Value(temp_surf, types.units.Temp.K);

	planet.temperature = T_surf;
	planet.atmosphere = {
		mass: atmosphereMass,
		pressure: P_surf,
		composition: { },
	};
	for (const gas in atmosphere) planet.atmosphere.composition[gas] = atmosphere[gas].f;
}

/**
 * Generates the base of the planet: core mass + possible envelope (ice/gas giants).
 * 
 * Further generation is applied after migration simulation. {@see {@link finishGeneration}}
 * @param {types.GenerationSettings} settings 
 * @param {types.Star} star 
 * @param {types.Value} sma 
 * @param {object} genData
 * @returns {types.Planet}
 */
export function generatePlanet(settings, star, sma, genData) {
	const planet = new types.Planet(star);
	planet.name = namegen.generate();
	planet.sma = sma;
	const sma_norm = sma.getValueAs(types.units.Dist.AU) / Math.sqrt(star.luminosity); // Converting to AU☉ units

	planet.core = generatePlanetCore(sma_norm, star);
	planet.envelope = makeGasGiant(planet, sma_norm, star);

	planet.mass = new types.Value(planet.core.mass + planet.envelope.mass, types.units.Mass.M_Earth);
	planet.genData = {
		sma_min: genData.sma_min,
		sma_max: genData.sma_max,
		status: '',
		impacts: 0,
	}
	//console.log(JSON.stringify(planetCore, null, '\t'));
	
	return planet;
}

/**
 * 
 * @param {types.Planet} planet 
 */
export function finishGeneration(planet) {
	const sma_norm = planet.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(planet.parentBody.luminosity); // Converting to AU☉ units
	setPlanetRadius(planet, sma_norm, planet.parentBody);
	planet.temperature_eq = getEffectiveTemperature(planet, sma_norm);
	planet.temperature = planet.temperature_eq;
	if (planet.type === 'Terrestrial')
		generateAtmosphere(planet, sma_norm);
	/*
	console.log(`
TYPE: ${planet.type}
MASS: ${planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(2)} M_E (${planet.mass.getValueAs(types.units.Mass.M_Jupiter).toFixed(2)} M_J)
^ CORE / ENVELOPE: ${planet.core.mass.toFixed(2)} / ${planet.envelope.mass.toFixed(2)}
RADIUS: ${planet.radius.getValueAs(types.units.Dist.R_Earth).toFixed(2)} R_E (${planet.radius.getValueAs(types.units.Dist.km).toFixed(0)} km, ${planet.radius.getValueAs(types.units.Dist.R_Jupiter).toFixed(2)} R_J)
DENSITY: ${planet.density.toFixed(1)} g/cm3
T_SURF: ${planet.temperature.getValueAs(types.units.Temp.C).toFixed(1)} C | T_EQ: ${planet.temperature_eq.getValueAs(types.units.Temp.C).toFixed(1)} C)
Orb. per.: ${new types.Value(Math.sqrt( ((4 * Math.PI**2) / (consts.PHY_G * (planet.mass.getValueAs(types.units.Mass.kg) + planet.parentBody.mass.getValueAs(types.units.Mass.kg)))) * Math.pow(planet.sma.getValueAs(types.units.Dist.m), 3) ), types.units.Time.s).getValueAs(types.units.Time.d).toFixed(2)} d
`);
	console.log(planet.sma.value);
	if (planet.type === 'Terrestrial') {
		console.log('ATMOSPHERE:', planet.atmosphere);
	}
	*/
}
