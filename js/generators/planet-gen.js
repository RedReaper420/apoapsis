
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

	const T_eq = consts.PHY_EARTH_TEMP_EQ * Math.pow(1 / (planet.genData.sma_norm ** 2), 1/4);
	planet.temperature_eq = new types.Value(T_eq, types.units.Temp.K);
	planet.temperature = new types.Value(T_eq, types.units.Temp.K);

	if (planet.type === types.planetTypes.Terrestrial)
		generateAtmosphere(planet);
}

/**
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
export function planetGeneration_Stage3(settings, planet) {
	planet.planetEvolution = new planetEvolutionSim.PlanetEvolution(settings, planet);
	planet.planetEvolution.doTheEvolution();
	
	if (planet.type === types.planetTypes.Terrestrial) {
		const T_surf = planet.temperature.getValueAs(types.units.Temp.K);
		const P_surf = planet.atmosphere.pressure;
		const f_ice = planet.core.composition.ice;
		if (
			( (273 <= T_surf) && (T_surf <= 340) ) &&
			( (0.4 <= P_surf) && (10.0 <= P_surf) ) &&
			( f_ice >= 0.005 ) &&
			( (planet.atmosphere.composition["H2"] || 0) === 0 )
		) { // (K_ret < 2.5)
			const lifeChance = 1//Math.pow((planet.age.getValueAs(types.units.Time.My) - 2500) / (10000 - 2500), 10);
			if (prng() < lifeChance) {
				let compositionNew = {
					N2: prng.range(0.73, 0.80),
					O2: prng.range(0.18, 0.24),
					Ar: prng.range(0.008, 0.012),
					CO2: prng.range(0.0003, 0.0005),
					H2O: prng.range(0.005, 0.02),
				}
				compositionNew = normalizeComposition(compositionNew);
				planet.atmosphere.composition = compositionNew;

				planet.hasLife = true;
			}
		}

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
	const starMassFactor = -0.35 + 4.0 * Math.log10((starMass ** 2) + 1.5);

	// Defining the curve
	const curveBaseMass = 2.5 * starMassFactor;
	const peakMaxMass = 20.0 * starMassFactor;

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

	if (coreMass > 25)
		coreMass = 25 + Math.pow(coreMass - 25, 1/3);

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
	const maxIceBase = Math.min(0.65, 0.01 + 0.01 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.00000025 * Math.exp(4 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.05 * sma_norm));
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

	const critBaseMin = 5.0;
	const critBaseMax = 25.0;
	const criticalMass = critBaseMin + (critBaseMax - critBaseMin) * Math.exp(-0.75 * Math.sqrt(sma_norm));

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

			let envelopeMult = 0;
			if (isIceGiant) {
				// Ice Giant
				envelopeMult = prng.range(0.5, 1.9);
				const dampeningThreshold = 0.9;
				if (envelopeMult > dampeningThreshold) {
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * star.mass.getValueAs(types.units.Mass.M_Sun)));
				}

				envelopeMass = coreMass * envelopeMult;

				planet.type = (coreMass + envelopeMass) < 15
					? types.planetTypes.MiniNeptune
					: types.planetTypes.IceGiant;
			}
			else {
				// True Gas Giant

				if (coreToCritRatio > 1.8) // Very massive core - very big chance for a large gas giant
					envelopeMult = prng.range(15, 64);
				else if (coreToCritRatio > 1.1)
					envelopeMult = prng.range(7, 28);
				else 
					envelopeMult = prng.range(3, 14);

				// Additional "luck" for enlarged gas giants (enabling super-Jupiters and brown dwarfs)
				if (prng() < (0.05 + star.metallicity * 0.2))
					envelopeMult *= prng.range(1.5, 3.5);

				const dampeningThreshold = 4;
				if (envelopeMult > dampeningThreshold) {
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * star.mass.getValueAs(types.units.Mass.M_Sun)));
				}

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

function generateAtmosphere(planet) {
	const planetMass_MEarth = planet.mass.getValueAs(types.units.Mass.M_Earth);
	const planetRadius_REarth = planet.radius.getValueAs(types.units.Dist.R_Earth);

	const T_eq = planet.temperature_eq.getValueAs(types.units.Temp.K);

	const star = planet.genData.parentStar;
	const sma_star = new types.Value(planet.genData.sma_norm * Math.sqrt(planet.genData.parentStar.luminosity), types.units.Dist.AU);
	const F_tidal_star = calculateTidalHeating(planet, star, sma_star);

	let host = planet.parentBody;
	if (planet.parentBody instanceof types.BinaryPlanet) {
		if (planet.parentBody.primary === planet) {
			host = planet.parentBody.secondary;
		}
		else if (planet.parentBody.secondary === planet) {
			host = planet.parentBody.primary;
		}
	}
	const F_tidal_host = host instanceof types.Star ? 0 : calculateTidalHeating(planet, host, planet.sma);

	const F_tidal = F_tidal_star + F_tidal_host;

	const T_eff = Math.pow( (T_eq ** 4) + (F_tidal / consts.PHY_SIGMA) , 1/4);
	planet.temperature_eff = new types.Value(T_eff, types.units.Temp.K);

	/*
	K_ret < 0.2: Planet can't hold even heavy gases
	0.2 <= K_ret < 0.6: Thin atmosphere
	0.6 <= K_ret < 2.5: Thick atmosphere
	K_ret >= 2.5: Planet can hold hydrogen and helium
	*/
	const K_ret = (planetMass_MEarth / planetRadius_REarth) / ((T_eff / consts.PHY_EARTH_TEMP_SURF) ** 1.5);

	if (K_ret < 0.2) {
		planet.atmosphere = {
			pressure: 0,
			scaleHeight: 0,
			mu: 0,
			composition: {},
		}
		planet.hasLife = false;
		planet.temperature = new types.Value(planet.temperature_eff.value, planet.temperature_eff.unit);
		
		return;
	}

	const f_ice = planet.core.composition.ice;
	const f_rock = planet.core.composition.rock;
	const f_iron = planet.core.composition.iron;

	const P_base = (f_ice * 10.0) + (f_rock * 0.1) + (f_iron * 0.01);
	const f_ret = utils.clamp( (K_ret - 0.20) / 0.70 , 0.0, 10.0) ** 2;
	const g_Earth = planetMass_MEarth / (planetRadius_REarth ** 2);
	const tidalOutgassing = 1.0 + Math.min(F_tidal / 0.1, 50.0);
	const M_press = Math.pow(10, utils.clamp( utils.gaussianRandom(0, 0.5) , -2, 2));

	const P_surf = P_base * f_ret * g_Earth * tidalOutgassing * M_press;

	const T_surf = T_eff * (1 + 0.4 * Math.log10(1 + P_surf));
	planet.temperature = new types.Value(T_surf, types.units.Temp.K);
	
	let compositionRaw = {};

	if (T_surf > 1500) {
		compositionRaw = {
			SiO2: prng.range(0.50, 0.70),
			 SO2: prng.range(0.10, 0.30),
			  CO: prng.range(0.05, 0.20),
		};
	}
	else if (T_surf > 600) {
		if (f_ice < 0.05) {
			compositionRaw = {
				CO2: prng.range(0.85, 0.95),
				SO2: prng.range(0.01, 0.05),
				 N2: prng.range(0.02, 0.08),
			};
		}
		else {
			compositionRaw = {
				H2O: prng.range(0.70, 0.90),
				CO2: prng.range(0.10, 0.25),
				 N2: prng.range(0.01, 0.05),
			};
		}
	}
	else if (T_surf > 250) {
		if (f_ice < 0.01) {
			compositionRaw = {
				CO2: prng.range(0.90, 0.97),
				 N2: prng.range(0.02, 0.07),
				 Ar: prng.range(0.005, 0.02),
			};
		}
		else if (f_ice < 0.2) {
			compositionRaw = {
				CO2: prng.range(0.75, 0.90),
				 N2: prng.range(0.08, 0.20),
				H2O: prng.range(0.01, 0.05),
			};
		}
		else {
			compositionRaw = {
				H2O: prng.range(0.50, 0.80),
				CO2: prng.range(0.15, 0.40),
				 N2: prng.range(0.02, 0.10)
			};
		}
	}
	else if (T_surf > 100) {
		if (f_ice < 0.1) {
			compositionRaw = {
				CO2: prng.range(0.80, 0.95),
				 N2: prng.range(0.05, 0.15),
				 Ar: prng.range(0.01, 0.03),
			};
		}
		else {
			compositionRaw = {
				 N2: prng.range(0.75, 0.90),
				CH4: prng.range(0.05, 0.15),
				 CO: prng.range(0.01, 0.05),
			};
		}
	}
	else {
		compositionRaw = {
			 N2: prng.range(0.80, 0.95),
			CH4: prng.range(0.01, 0.10),
			 Ne: prng.range(0.01, 0.05),
		};
	}

	if (K_ret >= 2.5) {
		const envelope = {
			 H2: prng.range(0.70, 0.80),
			 He: prng.range(0.15, 0.25),
			CH4: prng.range(0.01, 0.04),
		};
		const envelopeWeight = prng.range(0.65, 0.95);

		const compositionMixed = {};
		for (const gas in envelope)
			compositionMixed[gas] = (compositionMixed[gas] || 0) + envelope[gas] * envelopeWeight;
		for (const gas in compositionRaw)
			compositionMixed[gas] = (compositionMixed[gas] || 0) + compositionRaw[gas] * (1 - envelopeWeight);
		
		compositionRaw = compositionMixed;
	}
	
	const compositionFinal = normalizeComposition(compositionRaw);
	const mu = calculateMeanMolarMass(compositionFinal);

	const H_Earth = 8.5; // km
	const H = (T_surf / (g_Earth * mu)) * H_Earth;

	planet.atmosphere = {
		pressure: P_surf,
		scaleHeight: H,
		composition: compositionFinal,
		mu: mu,
	}
	planet.hasLife = false;
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Planet|types.Star} host 
 * @param {types.Value} sma 
 */
function calculateTidalHeating(planet, host, sma) {
	const M_p = planet.mass.getValueAs(types.units.Mass.kg);
	const R_p = planet.radius.getValueAs(types.units.Dist.m);
	const M_host = host.mass.getValueAs(types.units.Mass.kg);
	const R_host = host.radius.getValueAs(types.units.Dist.m);
	const a = sma.getValueAs(types.units.Dist.m);

	const R_roche = 2.44 * R_host * Math.pow(host.density / planet.density, 1/3);
	const x = a / R_roche;
	const e = 0.2 * prng.range(0.5, 1.5) * (1 - Math.exp(-5 * (x / 2000))); // Simulated excentricity value

	const k2 = planetEvolutionSim.calculateLoveNumber(planet);
	const Q = planetEvolutionSim.calculateTidalQ(planet);

	const E_tidal = (21/2) * (k2 / Q) * ( (consts.PHY_G * (M_host ** 2) * (R_p ** 5) * (e ** 2)) / (a ** 6) );
	const F_tidal = E_tidal / (4 * Math.PI * (R_p ** 2));

	return F_tidal;
}

function normalizeComposition(composition) {
	let sum = 0;
	for (const gas in composition)
		sum += composition[gas];

	if (sum === 0)
		return composition;

	for (const gas in composition)
		composition[gas] = composition[gas] / sum;
	return composition;
}

function calculateMeanMolarMass(composition) {
	const items = Object.keys(composition).length;
	if (items === 0)
		return 0;

	let sum = 0;
	for (const gas in composition)
		sum += composition[gas] * consts.PHY_MOLAR_MASSES[gas];
	
	return sum / items;
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
				return "#258285"; // Intermediate zone (semi-transparent atmosphere, salts clouds)
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
