
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as nameGen from "./name-gen.js";
import * as planetEvolutionSim from "./planet-evolution-sim.js";

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
			status: types.migrationStatus.Still, // Planet status that is used (assigned) later during migration
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

		setPlanetRadius(planet);
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
		planet.envelope = planet.genData.type === types.moonTypes.Binary
			? makeGasGiant(planet)
			: new types.Envelope();
		
		planet.mass = new types.Value(
			planet.core.mass.getValueAs(types.units.Mass.M_Earth) + 
			planet.envelope.mass.getValueAs(types.units.Mass.M_Earth), 
			types.units.Mass.M_Earth
		);

		setPlanetRadius(planet);

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
	
	setInitialRotation(planet);
	setInitialEffectiveTemperature(planet);
	planet.temperature = planet.temperature_eq;
	generateInitialAtmosphere(planet);
}

/**
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
export function planetGeneration_Stage3(settings, planet) {
	planet.planetEvolution = new planetEvolutionSim.PlanetEvolution(settings, planet);
	planet.planetEvolution.doTheEvolution();

	if (planet.type === types.planetTypes.Terrestrial) {
		planet.surface = {
			H2:  { melt:  13.99,	boil:  20.271,	mass: 0, f: 0 },
			He:	 { melt:   0,		boil:   4.222,	mass: 0, f: 0 },
			CH4: { melt:  90.694, 	boil: 111.66,	mass: 0, f: 0 },
			NH3: { melt: 195.42,	boil: 239.81,	mass: 0, f: 0 },
			H2O: { melt: 273.15,	boil: 373.13,	mass: 0, f: 0 },
			N2:  { melt:  63.23,	boil:  77.355,	mass: 0, f: 0 },
			O2:  { melt:  54.36,	boil:  90.188,	mass: 0, f: 0 },
			CO2: { melt: 194.685,	boil: 194.685,	mass: 0, f: 0 },
			SO2: { melt: 201,		boil: 263,		mass: 0, f: 0 },
		}

		const burnMass = Math.min(planet.atmosphere.CH4.mass, planet.atmosphere.O2.mass / 4);
		planet.atmosphere.CH4.mass -= burnMass;
		planet.atmosphere.O2.mass -= burnMass * 4;
		planet.atmosphere.CO2.mass += burnMass * (44 / 16);
		planet.atmosphere.H2O.mass += burnMass * (36 / 16);
		
		const temp_1 = planet.temperature.getValueAs(types.units.Temp.K);
		for (const element in planet.atmosphere) {
			if (temp_1 < planet.surface[element].boil) {
				planet.surface[element].mass = planet.atmosphere[element].mass;
				planet.atmosphere[element].mass = 0;

				if (temp_1 < planet.surface[element].melt) {
					planet.surface[element].mass *= -1;
				}
			}
		}

		planet.atmosphere.CH4.mass *= prng.range(0.0001, 0.01);
		planet.atmosphere.CO2.mass *= 0.2;

		if ( (planet.surface.H2O.mass > 0) && (planet.surface.H2O.mass >= (0.0001 * planet.mass.getValueAs(types.units.Mass.kg))) ) {
			planet.atmosphere.CO2.mass *= 0.01;
		}

		planet.atmosphere.N2.mass += planet.atmosphere.NH3.mass * 0.82;
		planet.atmosphere.NH3.mass *= 0.0001;
		planet.atmosphere.SO2.mass *= 0.0001;
		planet.atmosphere.O2.mass *= 0.01;

		// Absolute total atmospheric mass
		let M_atm_total = 0;
		for (const gas in planet.atmosphere)
			M_atm_total += planet.atmosphere[gas].mass; // in M⊕
		const atmosphereMass = new types.Value(M_atm_total, types.units.Mass.kg)

		// Atmosphere pressure at the surface
		const P_surf_atm = (atmosphereMass.getValueAs(types.units.Mass.M_Earth_atm) * planet.mass.getValueAs(types.units.Mass.M_Earth)) / (planet.core.radius.getValueAs(types.units.Dist.R_Earth)**4);
		const P_surf_bar = P_surf_atm * 1.01325;

		planet.atmosphere_pressure = P_surf_bar;

		// Gases fractions
		for (const gas in planet.atmosphere)
			planet.atmosphere[gas].f = M_atm_total === 0 ? 0 : planet.atmosphere[gas].mass / M_atm_total;

		// Optical depth
		const tau = Math.pow(P_surf_bar, 1.5) * ( 
			(planet.atmosphere.H2O.f * 0.30) + 
			(planet.atmosphere.CO2.f * 0.03) + 
			(planet.atmosphere.CH4.f * 0.06) + 
			(planet.atmosphere.NH3.f * 0.50) + 
			(planet.atmosphere.SO2.f * 0.13)
		) + Math.pow(P_surf_bar, 2) * (
			(planet.atmosphere.H2.f * 1e-4) + 
			(planet.atmosphere.He.f * 1e-5) + 
			(planet.atmosphere.N2.f * 1e-5) + 
			(planet.atmosphere.O2.f * 1e-5) 
		);

		// Calculating surface temperature using a grey-atmosphere approximation
		const temp_surf = planet.temperature_eq.getValueAs(types.units.Temp.K) * Math.pow(1 + 3/4 * tau, 1/4);
		const T_surf = new types.Value(temp_surf, types.units.Temp.K);
		planet.temperature = T_surf;
	}

	if (planet.type === types.planetTypes.Terrestrial) {
		//generateAtmosphere(planet);
		planet.color = '#867470';
	}
	else {
		planet.color = setGasGiantColor(planet);
	}
}

/**
 * 
 * @param {types.Planet} planet
 */
function generatePlanetCore(planet) {
	const planetCoreMass = samplePlanetCoreMass(planet.genData);
	const coreIronFraction = sampleCoreIronFraction(planet.genData, planetCoreMass);
	const coreIceFraction = (1.0 - coreIronFraction) * sampleCoreIceFraction(planet.genData);
	const coreRockFraction = 1.0 - (coreIronFraction + coreIceFraction);

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
			case types.moonTypes.Impact:
				const f_iron = parentBody.core.composition.iron**2; // Not much of heavy iron leaves the parent planet
				const f_rock = parentBody.core.composition.rock;
				const f_ice = parentBody.core.composition.ice**2; // Portion of ices evaporates and escapes into space
				const f_total = f_iron + f_rock + f_ice;
				
				return new types.Core(
					planet.genData.mass,
					f_iron / f_total,
					f_rock / f_total,
					f_ice / f_total
				);
			default:
				const likeness = utils.clamp(utils.randomRangeGaussian(0.0, 0.7*2), 0.35, 0.95);
				
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
	
	const starMass = star.mass.getValueAs(types.units.Mass.M_Sun);
	//const starMassFactor = -0.5 + 4.0 * Math.log10(starMass + 1.5);
	const starMassFactor = 1 - 0.75 * Math.exp(-5 * starMass);

	// Defining the curve
	const curveBaseMass = 2.5;
	const peakMaxMass = Math.max(curveBaseMass, 25.0 * starMassFactor);

	const m = peakMaxMass - curveBaseMass;
	const x = sma_norm - consts.PHY_DIST_SNOW_LINE;

	const baseCurve = sma_norm <= consts.PHY_DIST_SNOW_LINE
		? Math.pow(curveBaseMass * (1 - Math.exp(-5 * sma_norm / consts.PHY_DIST_SNOW_LINE)), 2)
		: curveBaseMass * Math.exp(-x);
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_DIST_SNOW_LINE
		? curveBaseMass * Math.exp(-0.2 * x) + m * Math.exp(-0.125 * x)
		: 0;
	const baseMass = Math.max(baseCurve + snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.2, 2 * star.metallicity);
	
	//const varianceRange = 1/2;
	//const variance = utils.randomRangeGaussian(1-varianceRange, 1+varianceRange);
	
	const varianceMin = 0.05;
	const variance = ( prng.range(varianceMin, 1.0) + utils.randomRangeGaussian(varianceMin, 1.0) ) / 2;

	let coreMass = baseMass * metalFactor * variance;
	if (sma_norm > consts.PHY_DIST_SNOW_LINE * 5)
		if (prng() < (0.4 + 0.1 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 5))) 
			coreMass *= prng.range(0.1, 0.5); // "failed" distant cores
	
	// Filtering out very small bodies. Those will be automatically removed during the migration simulation.
	if (coreMass < 0.001)
		genData.status = types.migrationStatus.Ejected; 

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
	const maxIceBase = Math.min(0.65, 0.01 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.0000003 * Math.exp(4 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.05 * sma_norm));
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
				if (isIceGiant !== (planet.parentBody.type === types.planetTypes.IceGiant)) {
					if (prng() < 0.5) isIceGiant = !isIceGiant;
				}
			}

			if (isIceGiant) {
				// Ice Giant
				envelopeMass = coreMass * prng.range(0.5, 2.7);
				planet.type = (coreMass + envelopeMass) < 15
					? types.planetTypes.MiniNeptune
					: types.planetTypes.IceGiant;
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
				if (prng() < (0.05 + star.metallicity * 0.2))
					envelopeMult *= prng.range(1.5, 3.0);

				envelopeMass = coreMass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
				planet.type = (coreMass + envelopeMass) < 3900
					? types.planetTypes.GasGiant
					: types.planetTypes.BrownDwarf;
			}
		}
		else if (prng() < 0.5) {
			// Mini-Neptune / puffed super-Earth
			isIceGiant = true;
			envelopeMass = coreMass * prng.range(0.05, 0.5);
			planet.type = (coreMass + envelopeMass) < 15
				? types.planetTypes.MiniNeptune
				: types.planetTypes.IceGiant;
		}
	}
	
	let envelopeIceFraction = isIceGiant
		? prng.range(0.65, 0.85)
		: prng.range(0.05, 0.15);
	
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
	const bulkDensity = totalMass / Math.pow(totalRadius, 3) * consts.PHY_EARTH_DENSITY;

	planet.core.radius = new types.Value(coreRadius, types.units.Dist.R_Earth);
	planet.envelope.thickness = new types.Value(gasThickness, types.units.Dist.R_Earth).convertUnitTo(types.units.Dist.km);

	planet.radius = new types.Value(totalRadius, types.units.Dist.R_Earth);
	planet.density = bulkDensity;
}

// Constants derived from Seager et al. and Lopez & Fortney
const RadiusEOS = {
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
export function getMaterialRadius(mass, material) {
	if (mass <= 0) return 0;
	const config = RadiusEOS[material];
	// R = r0 * M^alpha + beta * M^gamma
	return config.r0 * Math.pow(mass, config.alpha) + config.beta * Math.pow(mass, config.gamma);
}

/**
 * 
 * @param {types.Planet} planet 
 */
function setInitialEffectiveTemperature(planet) {
	const sma_norm = planet.genData.sma_norm;

	// 1. Calculating black-body temperature (albedo = 0)
	// Using Earth's effective temperature w/o its albedo (0.3)
	const T_earth_blackbody = consts.PHY_EARTH_TEMP_EQ / Math.pow(1 - 0.30, 1/4);
	const T_blackbody = new types.Value(T_earth_blackbody / Math.sqrt(sma_norm), types.units.Temp.K);

	// 2. Getting a realistic albedo based on the black-body temperature
	planet.albedo = assumeAlbedo(planet, T_blackbody);

	// 3. Calculating final effective temperature based on assumed albedo
	const T_eq = (consts.PHY_EARTH_TEMP_EQ * Math.pow(1 - planet.albedo, 1/4)) / Math.sqrt(sma_norm);
	planet.temperature_eq = new types.Value(T_eq, types.units.Temp.K);
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
		case types.planetTypes.BrownDwarf: {
			return 0.4;
		}

		case types.planetTypes.GasGiant: {
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

		case types.planetTypes.IceGiant:
		case types.planetTypes.MiniNeptune: {
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
			if (planet.core.composition.ice >= 0.3) return 0.6;
			if (planet.core.composition.rock >= 0.5) return 0.2;
			if (planet.core.composition.iron >= 0.5) return 0.1;
			return 0.3;
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
		case types.planetTypes.BrownDwarf: {
			return "#43202b";
		}

		case types.planetTypes.GasGiant: {
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
function generateInitialAtmosphere(planet) {
	planet.atmosphere = {
		// molecular weight (kg/mol) | gas escape velocity | mass | fraction
		H2:  { m_w: 0.002,				v_th: 0,			mass: 0, f: 0 },
		He:	 { m_w: 0.004,				v_th: 0,			mass: 0, f: 0 },
		CH4: { m_w: 0.016,				v_th: 0,			mass: 0, f: 0 },
		NH3: { m_w: 0.017,				v_th: 0,			mass: 0, f: 0 },
		H2O: { m_w: 0.018,				v_th: 0,			mass: 0, f: 0 },
		N2:  { m_w: 0.028,				v_th: 0,			mass: 0, f: 0 },
		O2:  { m_w: 0.032,				v_th: 0,			mass: 0, f: 0 },
		CO2: { m_w: 0.044,				v_th: 0,			mass: 0, f: 0 },
		SO2: { m_w: 0.064,				v_th: 0,			mass: 0, f: 0 },
	}

	const planetMass_MEarth = planet.mass.getValueAs(types.units.Mass.M_Earth);
	const planetMass_kg = planet.mass.getValueAs(types.units.Mass.kg);

	const atmosphereMassFactor = planetMass_MEarth < 1
		? Math.pow(planetMass_MEarth, 3/4)
		: Math.pow(planetMass_MEarth, 1/4);

	// Primary atmosphere
	const primordialGasAmount = 0.001 * Math.exp(-1 * planet.genData.sma_norm) * Math.pow(prng(), 2) * atmosphereMassFactor;
	const H2_to_He_ratio = utils.randomRangeGaussian(0.8, 0.9) - 0.02;
	planet.atmosphere.H2.mass = planetMass_kg * primordialGasAmount * H2_to_He_ratio;
	planet.atmosphere.He.mass = planetMass_kg * primordialGasAmount * (1 - H2_to_He_ratio - 0.02);
	planet.atmosphere.NH3.mass = planetMass_kg * primordialGasAmount * 0.01;
	planet.atmosphere.CH4.mass = planetMass_kg * primordialGasAmount * 0.01;
	
	// Secondary atmosphere
	const f_rock = planet.core.composition.rock;
	const f_ice = planet.core.composition.ice;
	const Y_rock = 0.001 * f_rock * prng.range(0.5, 1.0) * atmosphereMassFactor;
	const Y_ice = 0.01 * f_ice * (0.1 + 0.9 * Math.exp(-5 * planet.genData.sma_norm / consts.PHY_DIST_SNOW_LINE)) * atmosphereMassFactor;
	const outgassingMode = Math.min(0.99, (f_ice / (f_rock + f_ice)) / 0.2);

	planet.atmosphere.H2O.mass += planetMass_kg * Y_ice * 0.60 * utils.randomRangeGaussian(0.5, 1.5) * outgassingMode;
	planet.atmosphere.CO2.mass += planetMass_kg * Y_ice * 0.20 * utils.randomRangeGaussian(0.5, 1.5) * outgassingMode;
	planet.atmosphere.CH4.mass += planetMass_kg * Y_ice * 0.10 * utils.randomRangeGaussian(0.5, 1.5) * outgassingMode;
	planet.atmosphere.NH3.mass += planetMass_kg * Y_ice * 0.10 * utils.randomRangeGaussian(0.5, 1.5) * outgassingMode;
	
	planet.atmosphere.CO2.mass += planetMass_kg * Y_rock * 0.60 * utils.randomRangeGaussian(0.5, 1.5) * (1 - outgassingMode);
	planet.atmosphere.SO2.mass += planetMass_kg * Y_rock * 0.10 * utils.randomRangeGaussian(0.5, 1.5) * (1 - outgassingMode);
	planet.atmosphere.H2O.mass += planetMass_kg * Y_rock * 0.05 * utils.randomRangeGaussian(0.5, 1.5) * (1 - outgassingMode);
	planet.atmosphere.N2.mass +=  planetMass_kg * Y_rock * 0.15 * utils.randomRangeGaussian(0.5, 1.5) * (1 - outgassingMode);
	planet.atmosphere.O2.mass +=  planetMass_kg * Y_rock * 0.10 * utils.randomRangeGaussian(0.5, 1.5) * (1 - outgassingMode);

	let M_atm_total = 0;
	for (const gas in planet.atmosphere)
		M_atm_total += planet.atmosphere[gas].mass; // in M⊕
	const atmosphereMass = new types.Value(M_atm_total, types.units.Mass.kg);

	// Gases fractions
	for (const gas in planet.atmosphere)
		planet.atmosphere[gas].f = M_atm_total === 0 ? 0 : planet.atmosphere[gas].mass / M_atm_total;

	const ratioAfterAbsorption = 1//Math.max(0.01, M_atm_total - planetMass_kg * f_rock * 0.0005) / M_atm_total;

	for (const gas in planet.atmosphere) {
		planet.atmosphere[gas].mass *= ratioAfterAbsorption;
	}
}

class PlanetaryOutgassingSimulation {
	/**
	 * 
	 * @param {types.Planet} planet 
	 */
	constructor(planet) {
		// Параметры планеты
		this.M_p = planet.core.mass.getValueAs(types.units.Mass.kg); // кг
		this.R_p = planet.core.radius.getValueAs(types.units.Dist.m); // м
		this.A_planet = 4 * Math.PI * Math.pow(this.R_p, 2); // м^2
		this.g = (consts.PHY_G * this.M_p) / Math.pow(this.R_p, 2); // м/с^2
		
		// Масса мантии (приблизительно 67% от общей массы для железо-каменных планет)
		this.M_mantle = this.M_p * planet.core.composition.rock; 

		// Геодинамические параметры
		this.F_int_0 = 0.36; // Вт/м^2 (в 4 раза выше современного земного)
		this.beta = 0.5; // Индекс затухания конвекции мантии
		
		// Начальные запасы летучих веществ в мантии (массовые доли)
		this.mantleVolatiles = {
			H2O: 0.001, // 0.1% от массы мантии
			CO2: 0.0003, // 0.03%
			N2:  0.000005 // 0.0005%
		};

		// Текущее состояние атмосферы (массы газов в кг)
		this.atmosphere = { H2O: 0, CO2: 0, N2: 0 };
		this.totalAtmosphereMass = 0;
		this.P_surface = 0; // Паскали (Н/м^2)

		this.v_esc = consts.PHY_EARTH_ESCAPE_VELOCITY * Math.sqrt(this.M_p / this.R_p);
		this.planet = planet;
		this.oceanMass = 0;
		this.dryIceMass = 0;
	}

	/**
	 * Расчет шага дегазации за промежуток времени dt
	 * @param {number} t_Myr - Текущий возраст системы в миллионах лет
	 * @param {number} dt_Myr - Шаг симуляции в миллионах лет
	 */
	runStep(t_Myr, dt_Myr) {
		const YEAR_IN_SECONDS = 31536000;
		const dt_seconds = dt_Myr * 1e6 * YEAR_IN_SECONDS;
		
		const coolingFactor = Math.pow(this.R_p / 6371e3, -0.5);
		const t_effective = t_Myr / coolingFactor;

		// 1. Расчет внутреннего теплового потока планеты на момент времени t
		// За базовую точку t0 берем 100 млн лет (время окончания бурной аккреции)
		const t0 = 100;
		const t_current = Math.max(t0, t_effective);
		const F_int = this.F_int_0 * Math.pow(t_current / t0, -this.beta);

		// Если планета остыла ниже критического значения, вулканизм прекращается
		if (F_int < 0.04) {
			console.log('stop at', t_Myr);
			return this.getAtmosphereState();
		}

		// 2. Расчет объема генерируемой магмы в секунду (м^3/с)
		const rho_m = 3300;   // Плотность мантии, кг/м^3
		const C_p = 1200;     // Удельная теплоемкость, Дж/(кг*К)
		const DeltaT = 100;   // Перегрев мантии, К
		const L_f = 4.0e5;    // Теплота плавления, Дж/кг
		const chi = 0.2;      // Эффективность выноса тепла расплавом
		
		const V_magma_dot = (this.A_planet * F_int) / (rho_m * (C_p * DeltaT + L_f)) * chi;

		// Масса плавящейся породы в секунду
		const M_magma_dot = V_magma_dot * rho_m;

		// 3. Расчет частичного плавления (Melt fraction). Допустим, плавится в среднем 10% плюма
		const F_m = 0.1; 
		const f_ext = 0.15; // Только 15% магмы доходит до поверхности (эффузивный вулканизм)
		
		let temp_eq = this.planet.temperature_eq.getValueAs(types.units.Temp.K);

		// 4. Расчет дегазации каждого компонента
		for (let gas in this.mantleVolatiles) {
			if (this.mantleVolatiles[gas] <= 0) continue;

			// Концентрация газа в жидкой магме (Критерий несовместимых элементов, D ~ 0)
			const C_magma = this.mantleVolatiles[gas] / F_m;

			// Эффективность выхода газа из лавы на поверхности
			let epsilon_degas = 0.95; // Для CO2 и N2 выход почти полный

			if (this.P_surface > 100 * 100000) { // Если давление > 100 бар
				// Атмосфера настолько плотная, что газам тяжело покидать магму
				epsilon_degas *= Math.max(0.01, 100 / (this.P_surface / 100000));
			}
			/*
			if (gas === 'H2O') {
				// Закон Генри для воды: сильное атмосферное давление удерживает воду в лаве
				// 100000 Па = 1 бар. При давлении > 100 бар дегазация воды падает почти до нуля
				const P_bar = this.P_surface / 100000;
				epsilon_degas = Math.max(0.01, 1.0 / (1.0 + 0.1 * Math.sqrt(P_bar)));
			}
			*/

			// Масса выделенного газа за секунду (кг/с)
			let M_gas_dot = M_magma_dot * C_magma * epsilon_degas * f_ext;
			let pressureFactor = Math.max(0.01, 1.0 - (this.P_surface / 50000000)); // затухание к 500 барам
			M_gas_dot *= pressureFactor;

			// Всего выделилось за шаг dt
			let total_gas_outgassed = M_gas_dot * dt_seconds;

			// Проверяем, чтобы не выжать из мантии больше, чем там есть
			const max_available = this.mantleVolatiles[gas] * this.M_mantle;
			if (total_gas_outgassed > max_available) {
				total_gas_outgassed = max_available;
			}

			// Обновляем состояние
			this.atmosphere[gas] += total_gas_outgassed;
			this.mantleVolatiles[gas] -= (total_gas_outgassed / this.M_mantle);

			// Calculating escape velocity for the planet
			const planetAge_y = this.planet.age.getValueAs(types.units.Time.y);

			/*
			const magnetopauseRatio = planet.magnetosphereRadius.getValueAs(types.units.Dist.R_Earth) / coreRadius;
			if (magnetopauseRatio < 2.5) {
				// The closer magnetosphere is, the stronger stellar wind heats up exosphere
				const exposureFactor = Math.max(1, 4 - magnetopauseRatio); 
				temp_ex *= exposureFactor; 
			}
			*/
			let temp_ex = temp_eq * 3.5; // Exosphere temperature
			let m_w;
			switch (gas) {
				case 'H2O': m_w = 0.018; break;
				case 'CO2': m_w = 0.044; break;
				case  'N2': m_w = 0.028; break
			}
			let v_th = Math.sqrt( (3 * consts.PHY_R_GAS * (temp_ex * 3)) / m_w );
			const escapeRatio = (this.v_esc / v_th);
			const tau = 0.001 * Math.exp(Math.pow(escapeRatio, 2));
			this.atmosphere[gas] *= Math.exp(-(dt_Myr*1e6) / tau);
		}

		if (temp_eq < 470) {
			let water_f = temp_eq > 370 ? 0.95 : 1.0;
			this.oceanMass += this.atmosphere['H2O'] * water_f;
			this.atmosphere['H2O'] *= (1.0 - water_f);
		}

		if (temp_eq < 195) {
			this.dryIceMass += this.atmosphere['CO2'] * 0.95;
			this.atmosphere['CO2'] *= 0.05;
		}

		// 5. Пересчет глобального атмосферного давления
		this.updateAtmosphericPressure();
		
		return this.getAtmosphereState();
	}

	updateAtmosphericPressure() {
		this.totalAtmosphereMass = this.atmosphere.H2O + this.atmosphere.CO2 + this.atmosphere.N2;
		// P = (M * g) / A
		this.P_surface = (this.totalAtmosphereMass * this.g) / this.A_planet;
	}

	getAtmosphereState() {
		return {
			pressureBar: this.P_surface / 100000,
			totalMassKg: this.totalAtmosphereMass,
			composition: {
				H2O: this.atmosphere.H2O / this.totalAtmosphereMass,
				CO2: this.atmosphere.CO2 / this.totalAtmosphereMass,
				N2:  this.atmosphere.N2 / this.totalAtmosphereMass
			},
			mantleRemaining: { ...this.mantleVolatiles },
			oceanMass: this.oceanMass,
			dryIceMass: this.dryIceMass,
		};
	}
}

/**
 * 
 * @param {types.Planet} planet 
 */
function generateAtmosphere(planet) {
	const sim = new PlanetaryOutgassingSimulation(planet);

	console.log('-------------------');
	console.log(planet.name, planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(3));

	// Эволюционный цикл от 100 млн лет до 4.5 млрд лет с шагом 100 млн лет
	const currentAge_My = planet.age.getValueAs(types.units.Time.My);
	for (let age = 100; age <= currentAge_My; age += 100) {
		sim.runStep(age, 100);
	}

	console.log(`--- РЕЗУЛЬТАТ ЧЕРЕЗ ${(currentAge_My/1000).toFixed(2)} МЛРД ЛЕТ ---`);
	console.log(sim.getAtmosphereState());
}

/**
 * 
 * @param {types.Planet} planet 
 */
function generateAtmosphere1(planet) {
	const sma_norm = planet.genData.sma_norm;
	const coreMass = planet.core.mass.getValueAs(types.units.Mass.M_Earth);
	const atmosphere = {
		// molecular weight (kg/mol) | gas escape velocity | mass | fraction
		H2:  { m_w: 0.002,				v_th: 0,			mass: 0, f: 0 },
		H2O: { m_w: 0.018,				v_th: 0,			mass: 0, f: 0 },
		N2:  { m_w: 0.028,				v_th: 0,			mass: 0, f: 0 },
		CO2: { m_w: 0.044,				v_th: 0,			mass: 0, f: 0 },
		CH4: { m_w: 0.016,				v_th: 0,			mass: 0, f: 0 },
		NH3: { m_w: 0.017,				v_th: 0,			mass: 0, f: 0 },
		O2:  { m_w: 0.032,				v_th: 0,			mass: 0, f: 0 },
		Ar:  { m_w: 0.040,				v_th: 0,			mass: 0, f: 0 }
	}

	// Sources fractions
	const f_rock = planet.core.composition.rock;
	const f_ice = planet.core.composition.ice;

	// Scaling factors
	//const phi_volcanic = 10**prng.range(-2.0, 2.0) * prng.range(0.5, 1.5); // Some worlds are dead, some are hyper-active
	const phi_volcanic = 1;
	const phi_sublime = (sma_norm < 0.5 ? 0.01 : 0.01 * Math.min(2.0, 1 + f_ice * 5)) * prng.range(0.5, 1.5);
	
	// Yielding factors
	const Y_rock = 0*0.000002 * phi_volcanic * Math.pow(coreMass, 1/3);
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
	const planetAge_y = planet.age.getValueAs(types.units.Time.y);
	
	let temp_ex = temp_eq * 3.5; // Exosphere temperature
	const magnetopauseRatio = planet.magnetosphereRadius.getValueAs(types.units.Dist.R_Earth) / coreRadius;
	if (magnetopauseRatio < 2.5) {
		// The closer magnetosphere is, the stronger stellar wind heats up exosphere
		const exposureFactor = Math.max(1, 4 - magnetopauseRatio); 
		temp_ex *= exposureFactor; 
	}
	for (const gas in atmosphere) {
		// Calculating escape velocities for various gases
		atmosphere[gas].v_th = Math.sqrt((3 * consts.PHY_R_GAS * (temp_eq * 3)) / atmosphere[gas].m_w);

		// Jeans dissipation
		const escapeRatio = (v_esc / atmosphere[gas].v_th);
		const tau = 0.001 * Math.exp(Math.pow(escapeRatio, 2));
		atmosphere[gas].mass *= Math.exp(-planetAge_Gy / tau);
	}

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

	console.log(planet.mass.getValueAs(types.units.Mass.M_Earth).toFixed(3), planet.atmosphere.pressure.toFixed(3), planet.age.getValueAs(types.units.Time.Gy).toFixed(2));
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
		return surfOrbitPeriod_h * prng.range(1.2, 2.4);
	}
}
