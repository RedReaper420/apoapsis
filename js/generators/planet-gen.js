
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

import * as nameGen from "./name-gen.js";
import * as planetEvolutionSim from "./planet-evolution-sim.js";
import * as giants from "./giants/giants.js";
import * as terrestrial from "./terrestrial/terrestrial.js";
import * as atmosphere from "./terrestrial/atmosphere.js";
import * as life from "./terrestrial/life.js";

import { temperatureToColor } from "./star-gen.js";

/** @typedef {import("../data/types.js").GenData} GenData */

/**
 * Generates the base of the planet/moon: core mass + possible envelope (ice/gas giants).
 * 
 * The further generation (@see {@link planetGeneration_Stage2}) is applied after simulating migration for planets, and immediately for moons. 
 * 
 * @param {T.GenerationSettings} settings 
 * @param {T.Star|T.BinaryStar|T.Planet|T.BinaryPlanet} parentBody 
 * @param {T.Value} sma 
 * @param {GenData} genData
 * 
 * @returns {T.Planet}
 */
export function generatePlanet(settings, parentBody, sma, genData) {
	const planet = new T.Planet(parentBody, nameGen.generate());
	planet.sma = sma;

	if (genData.isMoon === false) {
		// ====== PLANET GENERATION ======
		
		planet.genData = {
			isMoon: genData.isMoon,
			sma_init: genData.sma_init,
			sma_min: genData.sma_min,
			sma_max: genData.sma_max,
			status: T.migrationStatus.Still,
			impacts: 0,
			retrograde: false,
			sma_norm: sma.as(T.units.Dist.AU) / Math.sqrt(parentBody.luminosity),
			sma_init_norm: genData.sma_init / Math.sqrt(parentBody.luminosity),
			parentStar: planet.parentBody,
		}

		planet.age = planet.genData.parentStar.age;

		planet.core = generatePlanetCore(planet);
		planet.envelope = giants.makeGasGiant(planet);
		
		planet.mass = new T.Value(
			planet.core.mass.as(T.units.Mass.M_Earth) + 
			planet.envelope.mass.as(T.units.Mass.M_Earth), 
			T.units.Mass.M_Earth
		);

		setPlanetRadius(planet);
	}
	else {
		// ====== MOON GENERATION ======
		
		let sma_norm = 0;
		let sma_init_norm = 0;
		let parentStar = null;
		//	Moon.Planet.(Binary) / Moon.Planet.(Star) / Planet.Binary.(Star)
		if (planet.parentBody.parentBody instanceof T.BinaryPlanet) {
			//			Moon.Planet.Binary.Star
			parentStar = planet.parentBody.parentBody.parentBody; 
			//			Moon.Planet.Binary.property
			sma_norm = planet.parentBody.parentBody.sma.as(T.units.Dist.AU) / Math.sqrt(parentStar.luminosity);
			sma_init_norm = planet.parentBody.parentBody.genData.sma_init_norm;
		}
		else {
			//			Moon.Planet.Star / Planet.Binary.Star
			parentStar = planet.parentBody.parentBody; 
			//			Moon.Planet.property
			sma_norm = planet.parentBody.sma.as(T.units.Dist.AU) / Math.sqrt(parentStar.luminosity);
			sma_init_norm = planet.parentBody.genData.sma_init_norm;
		}

		planet.genData = {
			isMoon: true,
			mass: genData.mass,
			retrograde: genData.retrograde,
			moonType: genData.moonType,
			sma_norm: sma_norm,
			sma_init_norm: sma_init_norm,
			parentStar: parentStar,
		}

		planet.age = planet.genData.parentStar.age;
		
		planet.core = generatePlanetCore(planet);
		planet.envelope = planet.genData.moonType === T.moonTypes.Binary
			? giants.makeGasGiant(planet) // Binary component could be converted into a giant planet
			: new T.Envelope(); // Other moon types are never giant planets
		
		planet.mass = new T.Value(
			planet.core.mass.as(T.units.Mass.M_Earth) + 
			planet.envelope.mass.as(T.units.Mass.M_Earth), 
			T.units.Mass.M_Earth
		);

		setPlanetRadius(planet);

		planetGeneration_Stage2(planet);
	}

	return planet;
}

/**
 * Continuation of a planet/moon generation.
 * 
 * @param {T.Planet} planet 
 */
export function planetGeneration_Stage2(planet) {
	if (planet.genData.isMoon === false) {
		// Updating normalized SMA after migration
		planet.genData.sma_norm = planet.sma.as(T.units.Dist.AU) / Math.sqrt(planet.parentBody.luminosity);

		// Recalculating planet's radius and density after giant impacts (merges)
		if (planet.genData.impacts > 0) 
			setPlanetRadius(planet);
	}
	
	planet.g = calculateGravitationalAcceleration(planet);
	planet.v_esc = calculateEscapeVelocity(planet);

	setEccentricity(planet);
	// Increasing eccentricity for retrograde moons
	if (planet.genData.isMoon) {
		if (planet.genData.retrograde) {
			// 0.05 * 10 = 0.5. Higher ecc. values are dampened, e.g. 0.1 -> (0.05 + 0.05^1.5) * 10 = 0.61
			const e_threshold = 0.05; 
			const e_dampened = Math.min(planet.eccentricity, e_threshold) + Math.pow(Math.max(0, planet.eccentricity - e_threshold), 1.5);

			planet.eccentricity = e_dampened * prng.range(5, 10);
		}
	}

	setInitialRotation(planet);

	planet.temperature_bb = calculateBlackBodyTemperature(planet);
	planet.F_tidal = calculateTotalTidalHeating(planet);
	planet.albedo = assumeAlbedo(planet);
	planet.temperature_eq = calculateEquilibriumTemperature(planet);

	planet.mountainHeight = terrestrial.calculateMountainHeight(planet);
}

/**
 * @param {T.GenerationSettings} settings 
 * @param {T.Planet} planet 
 */
export function planetGeneration_Stage3(settings, planet) {
	// Simplified tidal braking caused by the planet's nearest moon
	if (planet.bodies.length > 0) {
		const m_p = planet.mass.as(T.units.Mass.kg);
		const m_m = planet.bodies[0].mass.as(T.units.Mass.kg);
		const massComponent = (m_m / m_p) * Math.min(m_p, m_m);

		const a = planet.bodies[0].sma.as(T.units.Dist.m);
		const t = Math.log(planet.age.as(T.units.Time.s));
		
		const tidalForceFactor = Math.pow(massComponent / (a ** 3) * t, 1/3);
		
		planet.rotationPeriod.value *= 1 + tidalForceFactor;
	}

	generateAtmosphere(planet);

	planet.planetEvolution = new planetEvolutionSim.PlanetEvolution(settings, planet);
	planet.planetEvolution.doTheEvolution();

	setSurfaceTemperature(planet);

	setPlanetColor(planet);
	planet.glowColor = getGlowColor(planet.temperature);

	planet.life = 0;
	planet.lifeHistory = new Map();
	if (planet.type === T.planetTypes.Terrestrial) {
		terrestrial.setOcean(planet);
		planet.albedo = terrestrial.calculateAlbedo(planet);
		terrestrial.setSurfaceTemperature(planet);

		// Simplified simulation of the atmosphere's freezing at T < -223°C
		if (planet.temperature.as(T.units.K) <= 50) {
			planet.atmosphere.pressure.value *= 0.01 * (1 - Math.exp(-0.075 * planet.temperature.as(T.units.K)));

			const A = 4 * Math.PI * (planet.radius.as(T.units.Dist.m) ** 2);
			planet.atmosphere.mass.set(planet.atmosphere.pressure.as(T.units.Press.Pa) * A / planet.g.as(T.units.Acc.m_s2), T.units.Mass.kg);

			planet.albedo = terrestrial.calculateAlbedo(planet);
			terrestrial.setSurfaceTemperature(planet);
		}

		planet.life = life.calculateLife(planet, settings.planet_life_chance);
	}
	
	// Atmosphere molar mass and scale height correction after all atmosphere-related recalculations
	planet.atmosphere.mu = atmosphere.calculateMeanMolarMass(planet.atmosphere.composition);
	planet.atmosphere.scaleHeight = atmosphere.calculateScaleHeight(
		planet.temperature.as(T.units.Temp.K),
		planet.g.as(T.units.Acc.m_s2),
		planet.atmosphere.mu
	);

	// Ocean cover "fix" that makes sure to submerge the entire land if the ocean is deeper than the tallest mountain 
	if (planet.type === T.planetTypes.Terrestrial) {
		if (planet.oceanDepth.as(T.units.Dist.m) > planet.mountainHeight.as(T.units.Dist.m)) {
			planet.oceanCover = 1.0;
			planet.oceanCoverVisual = 1.0;
		}
	}

	planet.esi = calculateESI(planet);
}

/**
 * Generates a rocky base of a planet/moon, with set mass and core composition.
 * 
 * @param {T.Planet} planet A planet for which the core is being generated.
 * 
 * @returns {T.Core} A planet core with a certain mass and a set of elements' fractions.
 */
function generatePlanetCore(planet) {
	const planetCoreMass = samplePlanetCoreMass(planet.genData);

	const coreIronFraction = sampleCoreIronFraction(planet.genData, planetCoreMass);
	const coreIceFraction = (1.0 - coreIronFraction) * sampleCoreIceFraction(planet.genData);
	const coreRockFraction = 1.0 - (coreIronFraction + coreIceFraction);

	if (planet.genData.isMoon === false) {
		// Generating a planet
		return new T.Core(planetCoreMass, coreIronFraction, coreRockFraction, coreIceFraction);
	}
	else {
		// Generating a moon
		const parentBody = planet.parentBody;
		switch (planet.genData.moonType) {
			case T.moonTypes.Impact: {
				let f_iron = parentBody.core.composition.iron ** 2; // Not much of heavy iron leaves the parent planet
				let f_rock = parentBody.core.composition.rock;
				let f_ice  = (parentBody.core.composition.ice * 0.1) ** 2; // Most of the ice evaporates and escapes into outer space

				// Re-normalization
				const f_total = f_iron + f_rock + f_ice;
				f_iron /= f_total;
				f_rock /= f_total;
				f_ice /= f_total;
				
				return new T.Core(planet.genData.mass, f_iron, f_rock, f_ice);
			}
			default: {
				const likeness_min = 0.25;
				const likeness_max = 0.75;
				const likeness = prng.range(likeness_min, likeness_max);

				let f_iron = parentBody.core.composition.iron * likeness + coreIronFraction * (1 - likeness);
				let f_rock = parentBody.core.composition.rock * likeness + coreRockFraction * (1 - likeness);
				let f_ice  = parentBody.core.composition.ice  * likeness + coreIceFraction  * (1 - likeness);

				f_iron = f_iron ** prng.range(1.0, 1.3); // Less iron
				f_rock = f_rock ** prng.range(0.9, 1.1);
				f_ice  = f_ice  ** prng.range(0.7, 1.0); // More ice

				// Re-normalization
				const f_total = f_iron + f_rock + f_ice;
				f_iron /= f_total;
				f_rock /= f_total;
				f_ice /= f_total;
				
				return new T.Core(planet.genData.mass, f_iron, f_rock, f_ice);
			}
		}
	}
}

/**
 * Samples mass for the core of a planet/moon.
 * 
 * @param {GenData} genData - Generation data of a planet.
 * 
 * @returns {T.Value} Planet core mass (unit: `Mass`)
 */
function samplePlanetCoreMass(genData) {
	const star = genData.parentStar;
	const sma_norm = genData.sma_norm;
	
	const starMass = star.mass.as(T.units.Mass.M_Sun);
	const starMassFactor = -0.35 + 4.0 * Math.log10((starMass ** 2) + 1.5);

	// Defining the curve
	const curveBaseMass = 2.5 * starMassFactor;
	const peakMaxMass = 20.0 * starMassFactor;

	const m = peakMaxMass - curveBaseMass;
	const x = sma_norm - consts.PHY_DIST_SNOW_LINE;

	// Defines a base floor mass curve before (3.5 + 1) AU: ~3.5 M⊕ at 1 AU, ~6.15 M⊕ at 3.5 AU
	const baseCurve = x <= 1
		? Math.pow(curveBaseMass * (1 - Math.exp(-5 * sma_norm / consts.PHY_DIST_SNOW_LINE)), 2)
		: 0;
	
	// Defines a peak that adds ~17.5 M⊕ around 3.5 AU
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));

	// Defines an exponencially decreasing curve from 3.5 AU to infinity, dropping from 20 M⊕ to ~0.01 M⊕ at 50 AU
	const postSnowLineSlope = sma_norm > consts.PHY_DIST_SNOW_LINE
		? curveBaseMass * Math.exp(-0.3 * (x ** 2)) + m * Math.exp(-0.125 * x)
		: 0;
	
	// Final mass curve (the peak before 4.5 AU, the slope after)
	const baseMass = Math.max(baseCurve + snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.2, 2 * star.metallicity);
	
	const varianceMin = 0.05;
	const variance = Math.max(varianceMin, ( prng() + utils.randomRangeGaussian() ) / 2);

	let coreMass = baseMass * metalFactor * variance;
	if (sma_norm > consts.PHY_DIST_SNOW_LINE * 5)
		if (prng() < (0.2 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 5))) 
			coreMass *= prng.range(0.1, 0.5); // "failed" distant cores
	
	// Filtering out very small bodies. Those will be automatically removed during the migration simulation.
	if (coreMass < 0.001)
		genData.status = T.migrationStatus.Ejected;

	// Heavy core mass dampening
	const heavyCoreThreshold = 25;
	if (coreMass > heavyCoreThreshold)
		coreMass = heavyCoreThreshold + Math.pow(coreMass - heavyCoreThreshold, 1/2);

	return new T.Value(coreMass, T.units.Mass.M_Earth);
}

/**
 * Samples an iron fraction in the planet's core.
 * 
 * @param {GenData} genData - Generation data of a planet.
 * @param {T.Value} coreMass - Planet's core mass (unit: `Mass`).
 * 
 * @returns {number} Iron fraction [0.01, 0.85]
 */
function sampleCoreIronFraction(genData, coreMass) {
	const randomBase = 0.20; const randomScatter = 0.25;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	
	const starMetallicity = genData.parentStar.metallicity;
	const starMetallicityFactor = 0.15 * Math.exp(0.5 * starMetallicity);

	const sma_norm = genData.sma_norm;
	const distanceFactor = Math.exp(-0.125 * (sma_norm - consts.PHY_DIST_SNOW_LINE));

	const coreMass_MEarth = genData.isMoon ? genData.mass : coreMass.as(T.units.Mass.M_Earth);
	const massFactor = coreMass_MEarth > 1 ? 1.0 + 0.025 * Math.log10(coreMass_MEarth) : 1.0;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor * massFactor, 0.01, 0.85);
}

/**
 * Samples an ice fraction in the planet's core.
 * 
 * @param {GenData} genData - Generation data of a planet.
 * 
 * @returns {number} Ice fraction [0, 0.65]
 */
function sampleCoreIceFraction(genData) {
	const starMetallicity = genData.parentStar.metallicity;
	const metallicityFactor = Math.exp(0.1 * starMetallicity);
	
	const sma_norm = genData.sma_norm;
	const maxIceBase = Math.min(0.65, 0.0005 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.00000025 * Math.exp(3.75 * Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) + 0.05 * sma_norm));
	const maxIce = maxIceBase * metallicityFactor;

	return (utils.randomRangeGaussian(0, maxIce) + prng.range(0, maxIce)) / 2; // Avg. of gaussian random and uniform random
}

/**
 * Calculates and sets radius and density for a planet.
 * 
 * @param {T.Planet} planet
 */
function setPlanetRadius(planet) {
	const sma_norm = planet.genData.sma_norm;
	const star = planet.genData.parentStar;

	// 1. Separate Gas and Ice fractions from the envelope
	const totalEnvelopeMass = planet.envelope.mass.as(T.units.Mass.M_Earth);
	const gasFraction = planet.envelope.composition.gas;

	const gasMass = totalEnvelopeMass * gasFraction;
	const extraIceMass = totalEnvelopeMass * (1 - gasFraction);

	// 2. Re-balance Core Mass to include volatile envelope ice
	const baseCoreMass = planet.core.mass.as(T.units.Mass.M_Earth);
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
		const ageFactor = star.age.as(T.units.Time.Gy) / 5;

		const R_Jupiter = new T.Value(1, T.units.Dist.R_Jupiter).as(T.units.Dist.R_Earth);
		const M_Jupiter = new T.Value(1, T.units.Mass.M_Jupiter).as(T.units.Mass.M_Earth);

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

	planet.core.radius = new T.Value(coreRadius, T.units.Dist.R_Earth);
	planet.envelope.thickness = new T.Value(gasThickness, T.units.Dist.R_Earth).convertTo(T.units.Dist.km);

	planet.radius = new T.Value(totalRadius, T.units.Dist.R_Earth);
	planet.density = new T.Value(bulkDensity, T.units.Dens.g_cm3);
}

/** Constants for planet radius calculation derived from Seager et al. and Lopez & Fortney. */
const RadiusEOS = {
	iron: { r0: 0.70, alpha: 0.266, beta: -0.015, gamma: 0.50 },
	rock: { r0: 1.00, alpha: 0.274, beta: -0.021, gamma: 0.51 },
	ice:  { r0: 1.25, alpha: 0.282, beta: -0.033, gamma: 0.53 }
};

/**
 * Calculates radius of a sphere with a certain mass, made from the specified material. 
 * 
 * @param {number} mass - in M⊕
 * @param {string} material - `iron`, `rock`, or `ice`
 * 
 * @returns {number} Sphere radius in R⊕
 */
export function getMaterialRadius(mass, material) {
	if (mass <= 0) return 0;
	const config = RadiusEOS[material];
	// R = r0 * M^alpha + beta * M^gamma
	return config.r0 * Math.pow(mass, config.alpha) + config.beta * Math.pow(mass, config.gamma);
}

/**
 * Calculates gravitational acceleration for a planet.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value} g (unit: `Acc`)
 */
function calculateGravitationalAcceleration(planet) {
	const M = planet.mass.as(T.units.Mass.kg);
	const R = planet.radius.as(T.units.Dist.m);
	const g = consts.PHY_G * M / (R ** 2);
	return new T.Value(g, T.units.Acc.m_s2);
}

/**
 * Calculates escape velocity for a planet.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value} (unit: `Spd`)
 */
function calculateEscapeVelocity(planet) {
	const M = planet.mass.as(T.units.Mass.kg);
	const R = planet.radius.as(T.units.Dist.m);
	const v_esc = Math.sqrt(2 * consts.PHY_G * M / R);
	return new T.Value(v_esc, T.units.Spd.m_s);
}

/**
 * Sets eccentricity value for a planet based on the distance from the host expressed in Roche radii.
 * 
 * @param {T.Planet} planet 
 */
export function setEccentricity(planet) {
	if (planet.parentBody === null) {
		planet.eccentricity = 0;
		return;
	}
	
	let host = planet.parentBody;
	if (planet.parentBody instanceof T.BinaryPlanet) {
		if (planet.parentBody.primary === planet) {
			host = planet.parentBody.secondary;
		}
		else if (planet.parentBody.secondary === planet) {
			host = planet.parentBody.primary;
		}
	}
	
	const R_host = host.radius.as(T.units.Dist.m);
	const a = planet.sma.as(T.units.Dist.m);
	const rho_host = host.density.as(T.units.Dens.g_cm3);
	const rho_planet = planet.density.as(T.units.Dens.g_cm3);
	const R_roche = 2.44 * R_host * Math.pow(rho_host / rho_planet, 1/3);
	const x = a / R_roche;
	const exp = Math.exp(-5 * (x / 3500));
	const e = 0.001 + 0.125 * (1 - exp) * utils.randomRangeGaussian(1 - 0.20 * exp, 1 + 0.20 * exp);

	planet.eccentricity = e;
}

/**
 * Sets initial rotation period for a planet.
 * 
 * @param {T.Planet} planet - Current planet
 */
function setInitialRotation(planet) {
	planet.isRotationRetrograde = false;

	// Setting an initial rotation period from an empirical formula.
	let rotationPeriod_h = 24 * Math.pow(planet.mass.as(T.units.Mass.M_Earth), -utils.randomRangeGaussian(0.3, 0.5)) * (10 ** utils.clamp(utils.gaussianRandom(0, 0.2), -0.75, 0.75));

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

	planet.rotationPeriod = new T.Value(rotationPeriod_h, T.units.Time.h);
	planet.isTidallyLocked = false;
}

/**
 * Prevents the planet's rotation period from getting too fast.
 * 
 * @param {T.Planet} planet - Current planet
 * @param {number} currentRotationPeriod_h - Current rotation period in hours
 * 
 * @returns {number} Same rotation period value in hours if it's safe, a new rotation period value slightly above critical threshold otherwise.
 */
function correctRotationPeriod(planet, currentRotationPeriod_h) {
	const currentRotationPeriod_s = new T.Value(currentRotationPeriod_h, T.units.Time.h).as(T.units.Time.s);

	const R_m = planet.radius.as(T.units.Dist.m);
	const M_kg = planet.mass.as(T.units.Mass.kg);

	// Orbital period at the planet's surface
	const surfOrbitPeriod_s = 2 * Math.PI * R_m * Math.sqrt(R_m / (consts.PHY_G * M_kg));

	if (currentRotationPeriod_s > surfOrbitPeriod_s * 1.2)
		// Current rotation speed is slower than critical limit, leaving the value as is.
		return currentRotationPeriod_h;
	else {
		// Current rotation speed passed the limit, setting the slightly slowed down limit value.
		const surfOrbitPeriod_h = new T.Value(surfOrbitPeriod_s, T.units.Time.s).as(T.units.Time.h);
		return surfOrbitPeriod_h * 1.25 * prng.range(1.0, 3.0);
	}
}


/**
 * 
 * @param {T.Planet} planet 
 * 
 * @returns
 */
function calculateTotalTidalHeating(planet) {
	const star = planet.genData.parentStar;
	const sma_star = new T.Value(planet.genData.sma_norm * Math.sqrt(planet.genData.parentStar.luminosity), T.units.Dist.AU);
	const F_tidal_star = calculateTidalHeating(planet, star, sma_star, planet.eccentricity);

	let host = planet.parentBody;
	if (planet.parentBody instanceof T.BinaryPlanet) {
		if (planet.parentBody.primary === planet) {
			host = planet.parentBody.secondary;
		}
		else if (planet.parentBody.secondary === planet) {
			host = planet.parentBody.primary;
		}
	}
	const F_tidal_host = host instanceof T.Star ? 0 : calculateTidalHeating(planet, host, planet.sma, planet.eccentricity);
	const F_tidal_sat = planet.bodies.length > 0 ? calculateTidalHeating(planet, planet.bodies[0], planet.bodies[0].sma, planet.bodies[0].eccentricity) : 0;

	const F_tidal = F_tidal_star + F_tidal_host + F_tidal_sat;

	return {
		star: F_tidal_star,
		host: F_tidal_host,
		sat: F_tidal_sat,
		total: F_tidal
	};
}

/**
 * 
 * @param {T.Planet} planet 
 * @param {T.Planet|T.Star} host 
 * @param {T.Value} sma 
 * @param {number} eccentricity 
 */
function calculateTidalHeating(planet, host, sma, eccentricity) {
	const R_p = planet.radius.as(T.units.Dist.m);
	const M_p = planet.mass.as(T.units.Mass.kg);
	const M_host = host.mass.as(T.units.Mass.kg);
	const a = sma.as(T.units.Dist.m);
	const n = Math.sqrt((consts.PHY_G * (M_host + M_p)) / (a ** 3));
	const e = planet.eccentricity;

	const k2 = planetEvolutionSim.calculateLoveNumber(planet);
	const Q = planetEvolutionSim.calculateTidalQ(planet);

	// Peale-Cassen equation
	const E_tidal = (21/2) * (k2 / Q) * ( (consts.PHY_G * (M_host ** 2) * (R_p ** 5) * n) / (a ** 6) ) * (e ** 2);
	const F_tidal = E_tidal / (4 * Math.PI * (R_p ** 2));

	return F_tidal;
}

/**
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value} (unit: `Temp`)
 */
function calculateBlackBodyTemperature(planet) {

	// Calculating black-body temperature (albedo = 0) from Earth's effective temperature w/o its albedo (0.3)
	const T_bb_prim = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(planet.genData.sma_norm) / Math.pow(1 - 0.30, 1/4);

	let T_bb_sec = 0;
	planet.genData.secondStar = null;
	const parentStar = planet.genData.parentStar;
	if (parentStar.parentBody instanceof T.BinaryStar) {
		let companionStar = parentStar.parentBody;
		if (parentStar.parentBody.primary === parentStar) {
			companionStar = parentStar.parentBody.secondary;
		}
		else if (parentStar.parentBody.secondary === parentStar) {
			companionStar = parentStar.parentBody.primary;
		}
		
		const sma_norm = companionStar !== parentStar.parentBody
			? parentStar.sma.as(T.units.Dist.AU) / Math.sqrt(companionStar.luminosity)
			: parentStar.sma.as(T.units.Dist.AU) / Math.sqrt(parentStar.parentBody.luminosity);
		T_bb_sec = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(sma_norm) / Math.pow(1 - 0.30, 1/4);

		planet.genData.secondStar = companionStar;
		planet.genData.secondStarSmaNorm = sma_norm;
	}
	else if (parentStar.parentBody instanceof T.Star) {
		const sma_norm = parentStar.sma.as(T.units.Dist.AU) / Math.sqrt(parentStar.parentBody.luminosity);
		T_bb_sec = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(sma_norm) / Math.pow(1 - 0.30, 1/4);

		planet.genData.secondStar = parentStar.parentBody;
		planet.genData.secondStarSmaNorm = sma_norm;
	}

	if (planet.genData.secondStar === null) {
		const childStar = parentStar.bodies.find(body => { return (body instanceof T.Star) || (body instanceof T.BinaryStar); });
		if (childStar) {
			const sma_norm = childStar.sma.as(T.units.Dist.AU) / Math.sqrt(childStar.luminosity);
			T_bb_sec = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(sma_norm) / Math.pow(1 - 0.30, 1/4);

			planet.genData.secondStar = childStar;
			planet.genData.secondStarSmaNorm = sma_norm;
		}
	}

	const T_bb = Math.pow((T_bb_prim ** 4) + (T_bb_sec ** 4), 1/4);
	return new T.Value(T_bb, T.units.Temp.K);
}

/**
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value} (unit: `Temp`)
 */
function calculateEquilibriumTemperature(planet) {
	const T_bb = planet.temperature_bb.as(T.units.Temp.K);
	const T_eq = T_bb * Math.pow(1 - planet.albedo, 1/4);
	return new T.Value(T_eq, T.units.Temp.K);
}

/**
 * Assumes the planet's albedo based on the planet's composition and blackbody temperature.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns
 */
function assumeAlbedo(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		return terrestrial.assumeAlbedo(planet);
	else
		return giants.assumeAlbedo(planet);
}

/**
 * 
 * @param {T.Planet} planet 
 */
function setPlanetColor(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		planet.color = terrestrial.setColor(planet);
	else
		planet.color = giants.setColor(planet)
}

/**
 * 
 * @param {T.Value} temperature 
 */
function getGlowColor(temperature) {
	const temp = temperature.as(T.units.Temp.K);

	if (temp < 700) {
		return '#00000000';
	}
	else {
		const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
		
		const a = Math.min(255, Math.floor(Math.pow((1400, temp - 700) / (1400 - 700), 2) * 255));

		if (temp < 1000) {
			// Calculating color from #170000 at 700K to #ff4400 at 1000K.
			const x = temp - 700 + 23;

			const r = Math.min(255, Math.floor(x));
			const g = Math.max(255, Math.floor(x)) % 255;
			const b = 0;

			return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
		}
		else {
			return temperatureToColor(temperature) + toHex(a);
		}
	}
	
}

/**
 * 
 * @param {T.Planet} planet 
 */
function generateAtmosphere(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		terrestrial.generateAtmosphere(planet);
	else
		giants.setDummyAtmosphere(planet);
}

/**
 * 
 * @param {T.Planet} planet 
 */
function setSurfaceTemperature(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		terrestrial.setSurfaceTemperature(planet);
	else
		giants.setSurfaceTemperature(planet);
}

/**
 * 
 * @param {T.Planet} planet 
 */
function calculateESI(planet) {
	const R = planet.radius.as(T.units.Dist.km);
	const rho = planet.density.as(T.units.Dens.g_cm3);
	const v_esc = planet.v_esc.as(T.units.Spd.m_s);
	const T_surf = planet.temperature.as(T.units.Temp.K);

	const ESI_R = Math.pow(1 - Math.abs((R - consts.PHY_EARTH_RADIUS) / (R + consts.PHY_EARTH_RADIUS)), 0.57);
	const ESI_rho = Math.pow(1 - Math.abs((rho - consts.PHY_EARTH_DENSITY) / (rho + consts.PHY_EARTH_DENSITY)), 1.07);
	const ESI_ve = Math.pow(1 - Math.abs((v_esc - consts.PHY_EARTH_ESCAPE_VELOCITY) / (v_esc + consts.PHY_EARTH_ESCAPE_VELOCITY)), 0.7);
	const ESI_Ts = Math.pow(1 - Math.abs((T_surf - consts.PHY_EARTH_TEMP_SURF) / (T_surf + consts.PHY_EARTH_TEMP_SURF)), 5.58);

	const ESI_I = Math.sqrt(ESI_R * ESI_rho); // Interior ESI
	const ESI_S = Math.sqrt(ESI_ve * ESI_Ts); // Surface ESI

	const ESI = Math.sqrt(ESI_I * ESI_S);

	return ESI;
}
