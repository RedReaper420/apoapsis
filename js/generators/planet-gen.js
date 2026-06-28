
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as nameGen from "./name-gen.js";

/**
 * Generates the base of the planet: core mass + possible envelope (ice/gas giants).
 * 
 * Further generation is applied after simulating migration. (@see {@link planetGeneration_Stage2})
 * 
 * @param {types.GenerationSettings} settings 
 * @param {types.Body} parentBody 
 * @param {types.Value} sma 
 * @param {Object} genData
 * 
 * @returns {types.Planet}
 */
export function generatePlanet(settings, parentBody, sma, genData) {
	const planet = new types.Planet(parentBody, nameGen.generate());
	planet.sma = sma;

	if (genData.isMoon === false) {
		// Planet generation

		planet.genData = {
			isMoon: genData.isMoon,
			sma_init: genData.sma_init, // Initial spawn distance, used later during moons generation
			sma_min: genData.sma_min, // Minimum allowed spawn distance, used later during migration
			sma_max: genData.sma_max, // Maximum allowed spawn distance, used later during migration
			status: '', // Planet status that is used (assigned) later during migration
			impacts: 0, // Planet impacts counter, incremented later during migration, then used during moons generation
			retrograde: false,
			sma_norm: sma.getValueAs(types.units.Dist.AU) / Math.sqrt(parentBody.luminosity), // Converting to AU☉ units
			sma_init_norm: genData.sma_init / Math.sqrt(parentBody.luminosity),
			parentStar: planet.parentBody,
		}

		planet.age = planet.genData.parentStar.age;

		planet.core = generatePlanetCore(planet);
		planet.envelope = makeGasGiant(planet);
		
		planet.mass = new types.Value(
			planet.core.mass.getValueAs(types.units.Mass.M_Earth) + 
			planet.envelope.mass.getValueAs(types.units.Mass.M_Earth), 
			types.units.Mass.M_Earth
		);
	}
	else {
		// Moon generation
		
		let sma_norm = 0;
		let sma_init_norm = 0;
		let parentStar = null;
		//	Moon.Planet.(Binary) / Moon.Planet.(Star) / Planet.Binary.(Star)
		if (planet.parentBody.parentBody instanceof types.BinaryPlanet) {
			//			Moon.Planet.Binary.Star
			parentStar = planet.parentBody.parentBody.parentBody; 
			//			Moon.Planet.Binary.property
			sma_norm = planet.parentBody.parentBody.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(parentStar.luminosity);
			sma_init_norm = planet.parentBody.parentBody.genData.sma_init_norm;
		}
		else {
			//			Moon.Planet.Star / Planet.Binary.Star
			parentStar = planet.parentBody.parentBody; 
			//			Moon.Planet.property
			sma_norm = planet.parentBody.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(parentStar.luminosity);
			sma_init_norm = planet.parentBody.genData.sma_init_norm;
		}

		planet.genData = {
			isMoon: true,
			mass: genData.mass,
			retrograde: genData.retrograde,
			type: genData.type,
			sma_norm: sma_norm,
			sma_init_norm: sma_init_norm,
			parentStar: parentStar,
		}

		planet.age = planet.genData.parentStar.age;
		
		planet.core = generatePlanetCore(planet);
		planet.envelope = planet.genData.type === 'binary'
			? makeGasGiant(planet)
			: new types.Envelope();
		
		planet.mass = new types.Value(
			planet.core.mass.getValueAs(types.units.Mass.M_Earth) + 
			planet.envelope.mass.getValueAs(types.units.Mass.M_Earth), 
			types.units.Mass.M_Earth
		);

		planetGeneration_Stage2(settings, planet);
	}

	return planet;
}

/**
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
export function planetGeneration_Stage2(settings, planet) {
	if (planet.genData.isMoon === false)
		planet.genData.sma_norm = planet.sma.getValueAs(types.units.Dist.AU) / Math.sqrt(planet.parentBody.luminosity);

	setPlanetRadius(planet);

	planet.temperature_eq = getEffectiveTemperature(planet);
	planet.temperature = planet.temperature_eq;

	if (planet.type === 'Terrestrial') {
		generateAtmosphere(planet);
		planet.color = '#867470';
	}
	else {
		planet.color = setGasGiantColor(planet);
	}

	setInitialRotation(planet);
}

/**
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
export function planetGeneration_Stage3(settings, planet) {
	adjustRotationTime(settings, planet);
	calculatePlanetMagneticField(planet);
}

/**
 * 
 * @param {types.Planet} planet
 */
function generatePlanetCore(planet) {
	const planetCoreMass = samplePlanetCoreMass(planet.genData);
	const coreIronFraction = sampleCoreIronFraction(planet.genData, planetCoreMass);
	const coreIceFraction = (1.0 - coreIronFraction) * sampleCoreIceFraction(planet.genData);
	const coreRockFraction = 1.0 - coreIronFraction - coreIceFraction;

	if (planet.genData.isMoon === false) {
		// Generating a planet
		return new types.Core(
			planetCoreMass, 
			coreIronFraction, 
			coreRockFraction, 
			coreIceFraction
		);
	}
	else {
		// Generating a moon
		const parentBody = planet.parentBody;
		switch (planet.genData.type) {
			case 'impact':
				const f_iron = parentBody.core.composition.iron**2;
				const f_rock = parentBody.core.composition.rock;
				const f_ice = parentBody.core.composition.ice**2;
				const f_total = f_iron + f_rock + f_ice;
				
				return new types.Core(
					planet.genData.mass,
					f_iron / f_total,
					f_rock / f_total,
					f_ice / f_total
				);
			default:
				const likeness = planet.genData.type === 'binary'
					? utils.randomRangeGaussian(0.9, 1.0)
					: utils.clamp(utils.randomRangeGaussian(0.0, 0.7*2), 0.3, 0.9);
				
				return new types.Core(
					planet.genData.mass,
					parentBody.core.composition.iron * likeness + coreIronFraction * (1 - likeness),
					parentBody.core.composition.rock * likeness + coreRockFraction * (1 - likeness),
					parentBody.core.composition.ice * likeness + coreIceFraction * (1 - likeness)
				);
		}
	}
}

/**
 * 
 * @param {object} genData 
 * 
 * @returns {types.Value} Planet core mass
 */
function samplePlanetCoreMass(genData) {
	const star = genData.parentStar;
	const sma_norm = genData.sma_norm;

	// Defining the curve
	const curveMinMass = 2.0;
	const peakMaxMass = 25.0;

	const m = peakMaxMass - curveMinMass;
	const x = sma_norm - consts.PHY_DIST_SNOW_LINE;

	const baseCurve = curveMinMass - 0.015 * x**2;
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_DIST_SNOW_LINE
		? curveMinMass + m * Math.exp(-0.2 * x) - 0.02 * sma_norm
		: 0;
	const baseMass = Math.max(baseCurve * snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.6, 2.1 * star.metallicity);
	const starMass = star.mass.getValueAs(types.units.Mass.M_Sun);
	const starMassFactor = 1 - (starMass + 1)**(-3) + 0.2 * Math.log10(starMass);
	const variance = utils.randomRangeGaussian(0.05, 1.0);

	let coreMass = utils.clamp(baseMass * metalFactor * starMassFactor * variance, 0.1, 55);
	if (sma_norm > consts.PHY_DIST_SNOW_LINE * 6.66)
		if (prng() < (0.4 + 0.1 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 6.66))) 
			coreMass *= prng.range(0.05, 0.5); // "failed" distant cores

	return new types.Value(coreMass, types.units.Mass.M_Earth);
}

/**
 * 
 * @param {object} genData
 * @param {number} coreMass 
 * 
 * @returns {number}
 */
function sampleCoreIronFraction(genData, coreMass) {
	const randomBase = 0.20; const randomScatter = 0.25;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	
	const starMetallicity = genData.parentStar.metallicity;
	const starMetallicityFactor = 0.15 * Math.exp(0.5 * starMetallicity);

	const sma_norm = genData.sma_norm;
	const distanceFactor = Math.exp(-0.125 * (sma_norm - consts.PHY_DIST_SNOW_LINE));

	const massFactor = coreMass > 1 ? 1.0 + 0.05 * Math.log10(planetMass_MEarth) : 1.0;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor * massFactor, 0.01, 0.85);
}

/**
 * 
 * @param {object} genData
 * 
 * @returns {number} Ice fraction of the planet core's mass
 */
function sampleCoreIceFraction(genData) {
	const starMetallicity = genData.parentStar.metallicity;
	const metallicityFactor = Math.exp(0.1 * starMetallicity);
	
	const sma_norm = genData.sma_norm;
	const maxIceBase = Math.min(0.65, 0.01 + 0.02 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.00125 * Math.exp(2 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE + 0.01 * sma_norm)));
	const maxIce = maxIceBase * metallicityFactor;

	return (utils.randomRangeGaussian(0, maxIce) + prng.range(0, maxIce)) / 2; // Avg. of gaussian random and uniform random
}

/**
 * 
 * @param {types.Planet} planet 
 */
function makeGasGiant(planet) {
	const sma_norm = planet.genData.sma_init_norm;
	const star = planet.genData.parentStar;

	const critBaseMin = 5.5;
	const critBaseMax = 30.0;
	const criticalMass = critBaseMin + (critBaseMax - critBaseMin) * Math.exp(-0.6 * Math.sqrt(sma_norm));

	const coreMass = planet.core.mass.getValueAs(types.units.Mass.M_Earth);
	const coreToCritRatio = coreMass / criticalMass;

	let envelopeMass = 0;
	
	const critRatioFactor = Math.pow(coreToCritRatio, 2);
	const distanceFactor = Math.pow(sma_norm, -0.5);
	const metallicityFactor = Math.max(1, 1 + star.metallicity * 0.4);
	let giantProbability = critRatioFactor * distanceFactor * metallicityFactor;
	
	const iceGiantProbability = Math.pow(1 + Math.pow(0.3 * sma_norm, -2), -4);
	let isIceGiant = false;
	
	if (coreToCritRatio > 0.5) {
		if (prng() < giantProbability) {
			isIceGiant = (sma_norm > consts.PHY_DIST_SNOW_LINE) && (prng() < iceGiantProbability);
			if (planet.genData.isMoon) {
				if (isIceGiant !== (planet.parentBody.type === 'Ice Giant')) {
					if (prng() < 0.5) isIceGiant = !isIceGiant;
				}
			}

			if (isIceGiant) {
				// Ice Giant
				envelopeMass = coreMass * prng.range(0.7, 2.7);
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
				if (prng() < (0.1 + star.metallicity * 0.2))
					envelopeMult *= prng.range(1.5, 3.0);

				envelopeMass = coreMass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
				planet.type = 'Gas Giant';
			}
		}
		else if (prng() < 0.5) {
			// Mini-Neptune / puffed super-Earth
			isIceGiant = true;
			envelopeMass = coreMass * prng.range(0.05, 0.7);
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

	return new types.Envelope(
		new types.Value(envelopeMass, types.units.Mass.M_Earth), 
		1.0 - envelopeIceFraction, 
		envelopeIceFraction
	);
}

/**
 * 
 * @param {types.Planet} planet
 */
function setPlanetRadius(planet) {
	const sma_norm = planet.genData.sma_norm;
	const star = planet.genData.parentStar;

	// 1. Separate Gas and Ice fractions from the envelope
	const totalEnvelopeMass = planet.envelope.mass.getValueAs(types.units.Mass.M_Earth);
	const gasFraction = planet.envelope.composition.gas;

	const gasMass = totalEnvelopeMass * gasFraction;
	const extraIceMass = totalEnvelopeMass * (1 - gasFraction);

	// 2. Re-balance Core Mass to include volatile envelope ice
	const baseCoreMass = planet.core.mass.getValueAs(types.units.Mass.M_Earth);
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
 * 
 * @returns {types.Value} (unit: types.units.Temp)
 */
function getEffectiveTemperature(planet) {
	const sma_norm = planet.genData.sma_norm;

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
 * Assumes the planet's albedo based on the planet's type and its black-body temperature.
 * 
 * @param {types.Planet} planet 
 * @param {types.Value} T_blackbody Black-body temperature (unit: Temp)
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
				return 0.40; // Far and cold (like Uranus and Neptune)
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

import {temperatureToColor} from "./star-gen.js";

/**
 * 
 * @param {types.Planet} planet 
 */
function setGasGiantColor(planet) {
	const temp = planet.temperature.getValueAs(types.units.Temp.K);

	if (temp >= 1400) {
		return temperatureToColor(planet.temperature);
	}

	switch (planet.type) {
		case 'Gas Giant': {
			// Sudarsky's classification based on temperature
			if (temp < 150) {
				return "#D2B48C"; // Type I: Ammonia clouds (high albedo, like Jupiter's)
			}
			if (temp >= 150 && temp < 250) {
				return "#CFECEC"; // Type II: Water clounds (very bright)
			}
			if (temp >= 250 && temp < 350) {
				return "#4682B4"; // Type III: No clouds (pure hydrogen absorbs light, Rayleigh scattering is on)
			}
			if (temp >= 350 && temp < 900) {
				return "#5F9EA0"; // Intermediate zone (semi-transparent atmosphere, salts clouds)
			}
			if (temp >= 900 && temp < 1200) {
				return "#1A1A1A"; // Type IV: Hot Jupiters (alkali metals absorb light; the planet is blacker than coal)
			}
			if (temp >= 1200 && temp < 1300) {
				return "#3A0000"; // // Type V: Super-hot (clouds of liquid iron and silicates are deflecting light)
			}
			// temp >= 1300
			return "#3A0000"; // Type V: Super-hot (clouds of liquid iron and silicates are deflecting light)
		}

		case 'Ice Giant':
		case 'Mini-Neptune': {
			if (temp < 100) {
				return "#6ebad5"; // Far and cold (like Uranus and Neptune)
			}
			if (temp >= 100 && temp < 300) {
				return "#3b73a0"; // Temperate ice giants (methane evaporates, atmosphere darkens)
			}

			// If an ice giant got too close to its star, it turns into a "hot Neptune", similar to Sudarsky's type III/IV gas giant
			if (temp >= 300 && temp < 900) {
				return "#7ab0b2";
			}
			if (temp >= 900 && temp < 1300) {
				return "#1B1010";
			}
			// temp >= 1300
			return "#3A0000";
		}
	}
}

/**
 * 
 * @param {types.Planet} planet 
 */
function generateAtmosphere(planet) {
	const sma_norm = planet.genData.sma_norm;
	const coreMass = planet.core.mass.getValueAs(types.units.Mass.M_Earth);
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
 * Sets the initial rotation period for a planet.
 * 
 * @param {types.Planet} planet - Current planet
 */
function setInitialRotation(planet) {
	planet.isRotationRetrograde = false;

	// Setting an initial rotation period from an empirical formula.
	let rotationPeriod_h = 24.0 * Math.pow(planet.mass.getValueAs(types.units.Mass.M_Earth), -utils.randomRangeGaussian(0.3, 0.5)) * prng.range(0.8, 1.2);
	
	// Cumulatively modifying rotation period from giant impacts.
	let rotationSpeedModifier = 1.0;
	for (let i = 0; i < planet.genData.impacts; i++) {
		if (prng() < 0.25) {// 25% chance for a significant impact.
			if (Math.pow(prng(), 2) < 0.5) {
				// ~71% chance (sqrt(0.5)) for a moderate impact, can decelerate or accelerate rotation.
				rotationSpeedModifier *= prng.range(0.5, 2.0);
			}
			else {
				// ~29% chance for a strong impact, decelerates rotation.
				rotationSpeedModifier *= prng.range(0.05, 0.5);

				// Chance for turning the planet around.
				if (prng() < 0.5)
					planet.isRotationRetrograde = !planet.isRotationRetrograde;
			}
		}
	}
	rotationPeriod_h /= rotationSpeedModifier; // Applying rotation speed modifier.

	// Preventing too fast rotation that would lead to planet's breakdown.
	rotationPeriod_h = correctRotationPeriod(planet, rotationPeriod_h);

	planet.rotationPeriod = new types.Value(rotationPeriod_h, types.units.Time.h);
	planet.isTidallyLocked = false;
}

/**
 * Prevents the planet's rotation period from getting too fast.
 * 
 * @param {types.Planet} planet - Current planet
 * @param {number} currentRotationPeriod_h - Current rotation period in hours
 * 
 * @returns {number} Same rotation period value in hours if it's safe, a new rotation period value slightly above critical threshold otherwise.
 */
function correctRotationPeriod(planet, currentRotationPeriod_h) {
	const currentRotationPeriod_s = new types.Value(currentRotationPeriod_h, types.units.Time.h).getValueAs(types.units.Time.s);

	const R_m = planet.radius.getValueAs(types.units.Dist.m);
	const M_kg = planet.mass.getValueAs(types.units.Mass.kg);

	// Orbital period at the planet's surface
	const surfOrbitPeriod_s = 2 * Math.PI * R_m * Math.sqrt(R_m / (consts.PHY_G * M_kg));

	if (currentRotationPeriod_s > surfOrbitPeriod_s)
		// Current rotation speed is slower than critical limit, leaving the value as is.
		return currentRotationPeriod_h;
	else {
		// Current rotation speed passed the limit, setting the slightly slowed down limit value.
		const surfOrbitPeriod_h = new types.Value(surfOrbitPeriod_s, types.units.Time.s).getValueAs(types.units.Time.h);
		return surfOrbitPeriod_h * prng.range(1.1, 1.6);
	}
}

/**
 * 
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
function adjustRotationTime(settings, planet) {
	let parent = planet.parentBody;
	if (parent instanceof types.BinaryPlanet) {
		if (planet.parentBody.primary === planet)
			parent = planet.parentBody.secondary;
		else if (planet.parentBody.secondary === planet)
			parent = planet.parentBody.primary;
	}

	const age_s = planet.age.getValueAs(types.units.Time.s);
	const tidalLockTime_s = getTidalLockTime(planet, parent).getValueAs(types.units.Time.s);

	const ageToTLRatio = Math.min(1, age_s / tidalLockTime_s);

	const interpolationFactor = 1 - Math.pow(1 - ageToTLRatio, 2);

	const targetRotationPeriod_s = getTidalLockRotationPeriod(planet, parent).getValueAs(types.units.Time.s);
	const targetOmega = 2 * Math.PI / targetRotationPeriod_s;

	const currentRotationPeriod_s = planet.rotationPeriod.getValueAs(types.units.Time.s);
	let currentOmega = 2 * Math.PI / currentRotationPeriod_s;
	if (planet.isRotationRetrograde) currentOmega = -currentOmega;

	const adjustedOmega = currentOmega * (1 - interpolationFactor) + targetOmega * interpolationFactor;

	if (ageToTLRatio === 1.0) {
		planet.isTidallyLocked = true;
		planet.isRotationRetrograde = false;
		planet.rotationPeriod = new types.Value(targetRotationPeriod_s, types.units.Time.s);
	}
	else {
		planet.isTidallyLocked = false;

		if (adjustedOmega < 0) {
			planet.isRotationRetrograde = true;
			const newPeriod_s = 2 * Math.PI / Math.abs(adjustedOmega);
			planet.rotationPeriod = new types.Value(newPeriod_s, types.units.Time.s);
		}
		else if (adjustedOmega > 0) {
			planet.isRotationRetrograde = false;
			const newPeriod_s = 2 * Math.PI / adjustedOmega;
			planet.rotationPeriod = new types.Value(newPeriod_s, types.units.Time.s);
		}
		else {
			planet.rotationPeriod = new types.Value(Infinity, types.units.Time.s);
			/*
			planet.isRotationRetrograde = false;
			planet.rotationPeriod = new types.Value(100000, types.units.Time.h);
			*/
		}
	}

	planet.rotationPeriod.convertUnitTo(types.units.Time.h);
}

/**
 * Calculates planet's tidal lock time.
 * 
 * @param {types.Planet} planet - Current planet
 * @param {types.Planet|types.BinaryPlanet|types.Star|types.BinaryStar} parent - Planet's parent body (star or binary companion)
 * 
 * @returns {types.Value} Approximate tidal lock time (unit: Time)
 */
function getTidalLockTime(planet, parent) {
	const m_s = planet.mass.getValueAs(types.units.Mass.kg); // Satellite's mass
	const m_p = parent.mass.getValueAs(types.units.Mass.kg); // Parent body's mass
	const R = planet.radius.getValueAs(types.units.Dist.m); // Satellite's radius

	const w = 2 * Math.PI / planet.rotationPeriod.getValueAs(types.units.Time.s); // Satellite's spin rate, rad/s
	const a = planet.sma.getValueAs(types.units.Dist.m); // Satellite's SMA

	const I_factor = calculateMomentOfInertiaFactor(planet);
	const I = I_factor * m_s * (R**2); // Satellite's moment of inertia

	const Q = calculateTidalQ(planet); // Satellite's dissipation function value

	const rho = planet.density * 1000; // Satellite's density, kg/m^3
	const g = consts.PHY_G * m_s / (R**2); // Satellite's surface gravity

	const totalMass = m_s;
	const coreIce = planet.core.composition.ice * planet.core.mass.getValueAs(types.units.Mass.kg);
	const envIce = planet.envelope.composition.ice * planet.envelope.mass.getValueAs(types.units.Mass.kg);
	const totalIceFraction = (coreIce + envIce) / totalMass;

	const mu = 3e10 * (1 - totalIceFraction) + 4e9 * totalIceFraction; // Linear interpolation of satellite's rigidity ("rocky" and "icy" regimes)
	const k2 = 1.5 / (1 + ((19 * mu) / (2 * rho * g * R))); // Satellite's tidal Love number 

	const t = (w * (a**6) * I * Q) / (3 * consts.PHY_G * (m_p**2) * k2 * (R**5)); // Approximate satellite's tidal locking time
	return new types.Value(t, types.units.Time.s);
}

/**
 * Calculates planet's moment of inertia factor.
 * 
 * @param {types.Planet} planet - Current planet
 * 
 * @returns {number} Moment of inertia factor (0.205-0.38)
 */
function calculateMomentOfInertiaFactor(planet) {
	const m_core = planet.core.mass.getValueAs(types.units.Mass.kg);
	const m_env = planet.envelope.mass.getValueAs(types.units.Mass.kg);
	const m_total = m_core + m_env;

	const f_env = m_env / m_total;
	
	const ironFraction = planet.core.composition.iron;
	const baseCoreFactor = 0.38 - (ironFraction * 0.07);

	if (f_env === 0) {
		return baseCoreFactor;
	}

	const targetGasFactor = 0.21;

	const i_factor = baseCoreFactor * (1 - f_env) + targetGasFactor * f_env;

	return Math.max(0.205, i_factor);
}

/**
 * Calculates planet's approximate dissipation function value (Q).
 * 
 * @param {types.Planet} planet - Current planet
 * 
 * @returns {number} Q value (\~50...\~100,000).
 */
function calculateTidalQ(planet) {
	const m_core = planet.core.mass.getValueAs(types.units.Mass.kg);
	const m_env = planet.envelope.mass.getValueAs(types.units.Mass.kg);
	const m_total = m_core + m_env;
	
	const f_env = m_env / m_total;

	// 1. Bodies w/o envelope
	if (f_env === 0) {
		const iceFraction = planet.core.composition.ice;
		// Ice is more flexible under pressure than rock and dissipates energy more effectively (lower Q).
		return 100 * (1 - iceFraction) + 25 * iceFraction;
	}

	// 2. Mini-Neptunes / Puffy Super-Earths
	// Q starts to increase since the gas envelope partially absorbs the tidal wave.
	if (f_env < 0.5) {
		// A smooth transition from the Q of a rigid body (about 100) to that of a gaseous (about 10,000)
		return 100 * Math.pow(100, f_env / 0.5);
	}

	// 3. Ice Giants, Gas Giants, Brown Dwarfs
	// Jupiter's Q is estimated to be 10^5 - 10^6. Saturn's is even larger.
	// Brown dwarfs must have a huge Q value.
	const mass_M_Earth = planet.mass.getValueAs(types.units.Mass.M_Earth);
	
	if (mass_M_Earth > 400) { 
		// Super-Jupiters and Brown Dwarfs
		return 1e6 * (mass_M_Earth / 400); 
	} else {
		// Classic giant planets
		// Ice giants dissipate better than gas giants.
		const envIceFraction = planet.envelope.composition.ice;
		const baseGiantQ = 1e5;

		// Expected Q values for ice giants are ~30,000, for gas giants - ~100,000
		return baseGiantQ * (1 - envIceFraction * 0.7); 
	}
}

/**
 * Calculates planet's rotation period at tidal lock.
 * 
 * @param {types.Planet} planet - Current planet
 * @param {types.Planet|types.BinaryPlanet|types.Star|types.BinaryStar} parent - Planet's parent body (star or binary companion)
 * 
 * @returns {types.Value} Rotation period at tidal lock (unit: Time)
 */
function getTidalLockRotationPeriod(planet, parent) {
	const m1 = planet.mass.getValueAs(types.units.Mass.kg);
	const m2 = parent.mass.getValueAs(types.units.Mass.kg);
	const a = planet.sma.getValueAs(types.units.Dist.m);

	// Rotation period = Orbital period
	const t = Math.sqrt( ((4 * (Math.PI**2)) / (consts.PHY_G * (m1 + m2))) * (a**3) );

	return new types.Value(t, types.units.Time.s);
}

/**
 * 
 * @param {types.Planet} planet 
 * 
 * @returns {types.Value}
 */
function getMagnetosphereSize(planet) {
	const B = 7.906e31 / 1e4;
	const P = getSolarWindPressure(planet);
	const Rp = planet.radius.getValueAs(types.units.Dist.m);
	const Rcf = Math.pow( (B**2) / (consts.PHY_MU_0 * P) , 1/6) * Rp;
	return new types.Value(Rcf, types.units.Dist.m);
}

/**
 * 
 * @param {types.Planet} planet 
 * 
 * @returns {number}
 */
function getSolarWindPressure(planet) {
	const star = planet.genData.parentStar;
	const L = star.luminosity;
	const dist_AU = planet.genData.sma_norm * Math.sqrt(L); // Converting AU☉ back to actual AU
	const D = new types.Value(dist_AU, types.units.Dist.AU).getValueAs(types.units.Dist.m);
	const c = new types.Value(1, types.units.Spd.c).getValueAs(types.units.Spd.m_s);
	const P = L / (4 * Math.PI * (D**2) * c);
	return P;
}

/**
 * 
 * @param {types.Planet} planet 
 * 
 * @returns {number}
 */
export function calculatePlanetMagneticField(planet) {
	const planetMass_MEarth = planet.mass.getValueAs(types.units.Mass.M_Earth);
	const planetMass_MJup = planet.mass.getValueAs(types.units.Mass.M_Jupiter);

	const planetRadius_m = planet.radius.getValueAs(types.units.Dist.m);

	let r_core, rho_core, f_ad, k_tectonics, c;
	if (planet.type === 'Terrestrial') {
		const coreMass_MEarth = planet.core.mass.getValueAs(types.units.Mass.M_Earth);
		const r_core_iron_REarth = getMaterialRadius(coreMass_MEarth * planet.core.composition.iron, 'iron');
		r_core = new types.Value(r_core_iron_REarth, types.units.Dist.R_Earth).getValueAs(types.units.Dist.m);
		rho_core = 7500;
		f_ad = 0.04;
		if (planet.temperature.getValueAs(types.units.Temp.C) > -10)
			k_tectonics = planet.core.composition.ice > 0.005 ? 0.25 : 0.08;
		else
			k_tectonics = planet.core.composition.ice > 0.2 ? 0.15 : 0.08;
		c = 20;
	}
	else if (planet.type !== 'Gas Giant') {
		r_core = planet.core.radius.getValueAs(types.units.Dist.m);
		rho_core = 3500;
		f_ad = 0.04;
		k_tectonics = 0.3;
		c = 20;
	}
	else {
		r_core = planetRadius_m * Math.min(0.9, 0.7 + 0.15 * Math.log10(3 * planetMass_MJup + 1));
		rho_core = 4000;
		f_ad = 0.6;
		k_tectonics = 1.0;
		c = 35;
	}

	const planetAge_Gy = planet.age.getValueAs(types.units.Time.Gy);
	let q_total;
	if (planetMass_MJup < 0.15)
		q_total = 4.6e13 * planetMass_MEarth * Math.pow(4.5 / planetAge_Gy, 0.5);
	else if (planetMass_MJup < 13) 
		q_total = 4.0e17 * Math.pow(planetMass_MJup, 1.5) * Math.pow(4.5 / planetAge_Gy, 0.5);
	else 
		q_total = 4.0e17 * Math.pow(planetMass_MJup, 2.5) * Math.pow(1.0 / planetAge_Gy, 0.4);

	const q_core = q_total * k_tectonics;
	const area_core = 4 * Math.PI * (r_core**2);
	const f_total_core = q_core / area_core;

	const f_c = f_total_core - f_ad;

	if (f_c <= 0) {
		planet.magneticField = 0;
		console.log(
			(0).toFixed(2), 
			(r_core / planetRadius_m).toFixed(2), 
			planet.radius.getValueAs(types.units.Dist.R_Earth).toFixed(2), 
			planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(2), 
			planet.age.getValueAs(types.units.Time.Gy).toFixed(2),
			planet.type
		);
		return;
	}
	
	const b_core = c * Math.sqrt(consts.PHY_MU_0) * Math.pow(rho_core, 1/6) * Math.pow(f_c / r_core, 1/3);
	
	const b_surf = b_core * Math.pow(r_core / planetRadius_m, 3) * utils.randomRangeGaussian(0.8, 1.2);

	planet.magneticField = b_surf;
	console.log(
		(b_surf * 1e6).toFixed(2), 
		(r_core / planetRadius_m).toFixed(2), 
		planet.radius.getValueAs(types.units.Dist.R_Earth).toFixed(2), 
		planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(2), 
		planet.age.getValueAs(types.units.Time.Gy).toFixed(2),
		planet.type
	);
}
