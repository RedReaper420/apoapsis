
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as namegen from "./name-gen.js";
import * as moonsystemgen from "./moon-system-gen.js";

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 * 
 * @returns {number} Planet core mass in M⊕
 */
function samplePlanetCoreMass(sma_norm, star) {
	// Defining the curve
	const startMinMass = 2.0;
	const peakMaxMass = 30.0;

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
 * @param {types.Body} parentBody 
 * 
 * @returns {number}
 */
function sampleCoreIronFraction(sma_norm, parentBody, genData) {
	const starMetallicity = (parentBody instanceof types.Star) || (parentBody instanceof types.BinaryStar)
		? parentBody.metallicity
		: parentBody.parentBody.metallicity;
	
	const randomBase = 0.1; const randomScatter = 0.3;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	
	const starMetallicityFactor = 0.15 * Math.exp(0.6 * starMetallicity);
	const distanceFactor = sma_norm > consts.PHY_DIST_SNOW_LINE
		? Math.exp(-0.2 * (sma_norm - consts.PHY_DIST_SNOW_LINE)) - 0.0005 * (sma_norm - consts.PHY_DIST_SNOW_LINE)
		: 1;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor, 0, 1);
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Body} parentBody 
 * 
 * @returns {number} Ice fraction of the planet core's mass
 */
function sampleCoreIceFraction(sma_norm, parentBody, genData) {
	const starMetallicity = genData.isMoon === false ? parentBody.metallicity : parentBody.parentBody.metallicity;
	const metallicityFactor = Math.exp(0.1 * starMetallicity);
	
	const maxIceBase = Math.min(0.65, 0.01 + 0.02 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.00125 * Math.exp(2 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE + 0.01 * sma_norm)));
	const maxIce = maxIceBase * metallicityFactor;
	return (utils.randomRangeGaussian(0, maxIce) + prng.range(0, maxIce)) / 2; // Avg. of gaussian random and uniform random
}

/**
 * 
 * @param {number} sma_norm 
 * @param {types.Body} parentBody 
 * @param {object} genData 
 */
function generatePlanetCore(sma_norm, parentBody, genData) {
	const planetCoreMass = genData.isMoon === false
		? samplePlanetCoreMass(sma_norm, parentBody) // Sampling mass for a planet
		: undefined; // 

	const coreIronFraction = sampleCoreIronFraction(sma_norm, parentBody, genData);
	const coreIceFraction = (1.0 - coreIronFraction) * sampleCoreIceFraction(sma_norm, parentBody, genData);
	const coreRockFraction = 1.0 - coreIronFraction - coreIceFraction;

	if (genData.isMoon === false) {
		return new types.Core(
			planetCoreMass, 
			coreIronFraction, 
			coreRockFraction, 
			coreIceFraction
		);
	}
	else {
		const likeness = utils.clamp(utils.randomRangeGaussian(0.0, 0.7*2), 0.3, 0.9);
		return new types.Core(
			genData.mass.getValueAs(types.units.Mass.M_Earth),
			parentBody.core.composition.iron * likeness + coreIronFraction * (1 - likeness),
			parentBody.core.composition.rock * likeness + coreRockFraction * (1 - likeness),
			parentBody.core.composition.ice * likeness + coreIceFraction * (1 - likeness)
		);
	}
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 * @param {types.Star} star 
 */
function makeGasGiant(planet, sma_norm, star) {
	const criticalMass = 5.5 + 22 * Math.exp(-0.6 * Math.sqrt(sma_norm));
	const coreToCritRatio = planet.core.mass / criticalMass;

	let envelopeMass = 0;
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
				planet.type = 'Ice Giant';
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
				planet.type = 'Gas Giant';
			}
		}
		else if (prng() < 0.5) {
			// Mini-Neptune / puffed super-Earth
			isIceGiant = true;
			envelopeMass = planet.core.mass * prng.range(0.05, 0.7);
			planet.type = 'Mini-Neptune';
		}
	}
	
	let envelopeIceFraction = isIceGiant ? prng.range(0.65, 0.85) : prng.range(0.05, 0.15);
	
	/*
	// Transfering ices from the core to the envelope
	let envelopeIceMass = envelopeMass * envelopeIceFraction;
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
	*/

	return new types.Envelope(envelopeMass, 1.0 - envelopeIceFraction, envelopeIceFraction);
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
 * 
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
 * Assumes the planet's albedo based on the planet's type and its black-body temperature.
 * @param {types.Planet} planet 
 * @param {types.Value} T_blackbody Black-body temperature (unit: types.units.Temp)
 */
function assumeAlbedo(planet, T_blackbody) {
	const temp = T_blackbody.getValueAs(types.units.Temp.K);
	switch (planet.type) {
		case 'Gas Giant': {
			// Sudarsky's classification based on temperature
			if (temp < 150) {
				return 0.57; // Type I: Ammonia clouds (high albedo, like Jupiter's)
			}
			if (temp >= 150 && temp < 250) {
				return 0.81; // Type II: Water clounds (very bright)
			}
			if (temp >= 250 && temp < 350) {
				return 0.12; // Type III: No clouds (pure hydrogen absorbs light, Rayleigh scattering is on)
			}
			if (temp >= 350 && temp < 900) {
				return 0.30; // Intermediate zone (semi-transparent atmosphere, salts clouds)
			}
			if (temp >= 900 && temp < 1400) {
				return 0.03; // Type IV: Hot Jupiters (alkali metals absorb light; the planet is blacker than coal)
			}
			// temp >= 1400
			return 0.55; // Type V: Super-hot (clouds of liquid iron and silicates are deflecting light)
		}

		case 'Ice Giant':
		case 'Mini-Neptune': {
			if (temp < 100) {
				return 0.41; // Far and cold (like Uranus and Neptune)
			}
			if (temp >= 100 && temp < 300) {
				return 0.30; // Temperate ice giants (methane evaporates, atmosphere darkens)
			}
			// If an ice giant got too close to its star, it turns into a "hot Neptune", similar to Sudarsky's type III/IV gas giant
			return 0.10;
		}

		default: { // Terrestrial worlds
			const mass = planet.mass.getValueAs(types.units.Mass.M_Earth);
			const canHaveAtmosphere = (mass > 0.05) && (temp < 1000) && (planet.core.composition.ice > 0.001);

			if (canHaveAtmosphere) {
				if (temp > 350) {
					return 0.65; // Venus-like reflective atmosphere
				}
				else if (temp < 240) {
					return 0.75; // Snowball
				}

				if (planet.core.composition.ice < 0.005) {
					return 0.25; // Dry desert with rare clouds
				}

				// Ocean world with patches of land. Dark ocean (0.06), land (0.2), and clouds (0.6) give average albedo around 0.3.
				return planet.core.composition.ice > 0.01 ? 0.25 : 0.3;
			}
			else {
				if (planet.core.composition.ice > 0.50) {
					return 0.60; // Icy airless world (Europa, Enceladus)
				}
				if (planet.core.composition.ice > 0.10) {
					return 0.35; // Mixed dirty-icy world (Gannymed, Callysto)
				}
				return 0.12; // Regolith (Mercury, Moon) — очень темные
			}
		}
	}
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {number} sma_norm 
 * 
 * @returns {types.Value} (unit: types.units.Temp)
 */
function getEffectiveTemperature(planet, sma_norm) {
	// 1. Calculating black-body temperature (albedo = 0)
	// T_bb = T_earth_eq / sqrt(sma_norm) * (1 - 0)^1/4
	// Using Earth's effective temperature w/o its albedo (0.3)
	const T_earth_blackbody = consts.PHY_EARTH_EQ_TEMP / Math.pow(1 - 0.30, 1/4);
	const T_blackbody = new types.Value(T_earth_blackbody / Math.sqrt(sma_norm), types.units.Temp.K);

	// 2. Getting a realistic albedo based on black-body temperature
	const albedo = assumeAlbedo(planet, T_blackbody);

	// 3. Calculating final effective temperature based on assumed albedo
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
 * Further generation is applied after simulating migration. (@see {@link finishGeneration})
 * 
 * @param {types.GenerationSettings} settings 
 * @param {types.Body} parentBody 
 * @param {types.Value} sma 
 * @param {Object} genData
 * 
 * @returns {types.Planet}
 */
export function generatePlanet(settings, parentBody, sma, genData) {
	const planet = new types.Planet(parentBody);
	
	planet.sma = sma;
	if (genData.isMoon === false) {
		// Planet generation

		const sma_norm = sma.getValueAs(types.units.Dist.AU) / Math.sqrt(parentBody.luminosity); // Converting to AU☉ units
		planet.core = generatePlanetCore(sma_norm, parentBody, genData);
		planet.envelope = makeGasGiant(planet, sma_norm, parentBody);
		planet.genData = {
			isMoon: genData.isMoon,
			sma_init: genData.sma_init, // Initial spawn distance, used later during moons generation
			sma_min: genData.sma_min, // Minimum allowed spawn distance, used later during migration
			sma_max: genData.sma_max, // Maximum allowed spawn distance, used later during migration
			status: '', // Planet status that is used (assigned) later during migration
			impacts: 0, // Planet impacts counter, incremented later during migration, then used during moons generation
			retrograde: false,
		}
		planet.mass = new types.Value(planet.core.mass + planet.envelope.mass, types.units.Mass.M_Earth);

		// Finish generation process after the migration simulation
		eventBus.on(events.Generator.Generation.FinishPlanets, () => {
			finishGeneration(planet);
			moonsystemgen.generateMoons(settings, planet);
		});
	}
	else {
		// Moon generation

		const sma_norm = planet.parentBody.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(planet.parentBody.parentBody.luminosity);
		planet.genData = {
			isMoon: true,
			sma_init_norm: planet.parentBody.genData.sma_init / Math.sqrt(planet.parentBody.parentBody.luminosity),
			retrograde: genData.retrograde,
		}
		planet.core = generatePlanetCore(sma_norm, parentBody, genData);
		planet.envelope = new types.Envelope();
		planet.mass = new types.Value(planet.core.mass + planet.envelope.mass, types.units.Mass.M_Moon);
		finishGeneration(planet);
	}

	planet.name = namegen.generate();

	return planet;
}

/**
 * 
 * @param {types.Planet} planet 
 */
function finishGeneration(planet) {
	let sma_norm = 0;
	if (planet.genData.isMoon === false) {
		sma_norm = planet.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(planet.parentBody.luminosity); // Converting to AU☉ units
		setPlanetRadius(planet, sma_norm, planet.parentBody);
	}
	else {
		sma_norm = planet.parentBody.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(planet.parentBody.parentBody.luminosity);
		setPlanetRadius(planet, sma_norm, planet.parentBody.parentBody);
	}
	planet.temperature_eq = getEffectiveTemperature(planet, sma_norm);
	planet.temperature = planet.temperature_eq;
	if (planet.type === 'Terrestrial')
		generateAtmosphere(planet, sma_norm);
}
