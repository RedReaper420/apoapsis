
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
 * @param {T.GeneratorSettings} settings 
 * @param {T.Star|T.BinaryStar|T.Planet|T.BinaryPlanet} parentBody 
 * @param {T.Value} sma 
 * @param {GenData} genData
 * @param {object|undefined} profile - Mass curve warping profile.
 * 
 * @returns {T.Planet}
 */
export function generatePlanet(settings, parentBody, sma, genData, profile = undefined) {
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

		planet.core = generatePlanetCore(planet, profile);
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
			companion: genData.companion,
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
 * Continuation of a planet/moon's generation.
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
 * @param {T.GeneratorSettings} settings 
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

	if (planet.type === T.planetTypes.Terrestrial) {
		const T_eq = planet.temperature_eq.as(T.units.Temp.K);
		const F_tidal = planet.F_tidal.total;

		const T_eff = Math.pow( (T_eq ** 4) + (F_tidal / consts.PHY_SIGMA) , 1/4);
		planet.temperature_eff = new T.Value(T_eff, T.units.Temp.K);
	}
	else {
		planet.temperature_eff = new T.Value(planet.temperature.value, planet.temperature.unit);
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
	planet.category = getPlanetCategory(planet);
}

/**
 * Generates a rocky base of a planet/moon, with setted up mass and core composition.
 * 
 * @param {T.Planet} planet A planet for which the core is being generated.
 * @param {object|undefined} profile - Mass curve warping profile.
 * 
 * @returns {T.Core} A planet core with a certain mass and a set of elements' fractions.
 */
function generatePlanetCore(planet, profile) {
	const planetCoreMass = samplePlanetCoreMass(planet.genData, profile);

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
				let f_iron = parentBody.core.composition.iron ** prng.range(1.5, 2); // Not much of heavy iron leaves the parent planet
				let f_rock = parentBody.core.composition.rock;
				let f_ice  = (parentBody.core.composition.ice * prng.range(0.1, 0.5)) ** prng.range(1.5, 2); // Most of the ice evaporates and escapes into outer space

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
 * @param {object|undefined} profile - Mass curve warping profile.
 * 
 * @returns {T.Value} Planet core mass (unit: `Mass`)
 */
function samplePlanetCoreMass(genData, profile) {
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
		? 0.1 * curveBaseMass + 0.9 * curveBaseMass * (1 - Math.exp(-5 * sma_norm / consts.PHY_DIST_SNOW_LINE))
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
	
	if (profile) {
		const { c1, c2, p1, p2, f1, f2 } = profile;
		coreMass *= (1 + c1 * Math.cos(Math.pow(sma_norm, p1) * f1)) * (1 + c2 * Math.cos(Math.pow(sma_norm, p2) * f2));
	}

	// Filtering out very small planets. Those will be automatically removed during the migration simulation.
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
	const randomBase = 0.1; const randomScatter = 0.25;
	const randIronFraction = randomBase + utils.randomRangeGaussian(-randomScatter, randomScatter);
	
	const starMetallicity = genData.parentStar.metallicity;
	const starMetallicityFactor = 0.15 * Math.exp(0.4 * starMetallicity);

	const sma_norm = genData.sma_norm;
	const distanceFactor = Math.exp(-0.1 * (sma_norm - consts.PHY_DIST_SNOW_LINE));

	const coreMass_MEarth = genData.isMoon ? genData.mass : coreMass.as(T.units.Mass.M_Earth);
	const massFactor = coreMass_MEarth > 1 ? 1.0 + 0.25 * Math.log10(coreMass_MEarth) : 1.0;

	return utils.clamp((randIronFraction + starMetallicityFactor) * distanceFactor * massFactor, 0.001, 0.85);
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
		if (planet.companion)
			host = planet.companion;
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
 * Calculates planet's tidal heating caused by its star, host planet, and nearest moon.
 * @param {T.Planet} planet 
 * @returns
 */
function calculateTotalTidalHeating(planet) {
	const star = planet.genData.parentStar;
	const sma_star = new T.Value(planet.genData.sma_norm * Math.sqrt(planet.genData.parentStar.luminosity), T.units.Dist.AU);
	const F_tidal_star = calculateTidalHeating(planet, star, sma_star, planet.eccentricity);

	let host = planet.parentBody;
	if (planet.parentBody instanceof T.BinaryPlanet) {
		if (planet.companion)
			host = planet.companion;
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
	const e = eccentricity;

	const k2 = planetEvolutionSim.calculateLoveNumber(planet);
	const Q = planetEvolutionSim.calculateTidalQ(planet);

	// Peale-Cassen equation
	const E_tidal = (21/2) * (k2 / Q) * ( (consts.PHY_G * (M_host ** 2) * (R_p ** 5) * n) / (a ** 6) ) * (e ** 2);
	const F_tidal = E_tidal / (4 * Math.PI * (R_p ** 2));

	return F_tidal;
}

/**
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
 * @see {@link terrestrial.assumeAlbedo}
 * @see {@link giants.assumeAlbedo}
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
 * Gets base/surface color for a planet.
 * 
 * @see {@link terrestrial.getColor}
 * @see {@link giants.getColor}
 * 
 * @param {T.Planet} planet 
 */
function setPlanetColor(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		planet.color = terrestrial.getColor(planet);
	else
		planet.color = giants.getColor(planet)
}

/**
 * Gets heat glow color from the temperature.
 * @param {T.Value} temperature 
 * @returns `#RRGGBBAA`
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
 * @param {T.Planet} planet 
 */
function setSurfaceTemperature(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		terrestrial.setSurfaceTemperature(planet);
	else
		giants.setSurfaceTemperature(planet);
}

/**
 * @param {T.Planet} planet 
 */
export function calculateSynodicDay(planet) {
	const isNotMoon = (!planet.genData.isMoon) && (planet.companion === undefined);

	const T_rot = planet.rotationPeriod.as(T.units.Time.s);
	const sign = isNotMoon 
		? planet.isRotationRetrograde ? 1 : -1 // Accounting for retrograde rotation for planets
		: planet.genData.retrograde ? 1 : -1; // Accounting for retrograde orbital motion for moons
	const P_orb = isNotMoon // (Host) planet orbital period
		? planet.orbitalPeriod.as(T.units.Time.s)
		: planet.parentBody.orbitalPeriod.as(T.units.Time.s);
	const T_syn = (T_rot * P_orb) / Math.abs(P_orb + sign * T_rot);

	return new T.Value(T_syn, T.units.Time.s);
}

/**
 * Calculates and sets minimal and maximal temperatures for a planet.
 * @param {T.Planet} planet 
 */
export function setMinMaxTemperature(planet) {
	const temp = planet.temperature.as(T.units.Temp.K);
	const t_eq = planet.temperature_eq.as(T.units.Temp.K);
	const t_eff = planet.temperature_eff.as(T.units.Temp.K);
	
	const t_int = t_eff - t_eq; // Internal heat
	const e_gh = temp / t_eff; // Greenhouse coefficient

	const p0 = 0.75; // bar
	const p = planet.type === T.planetTypes.Terrestrial
		? planet.atmosphere.pressure.as(T.units.Press.bar)
		: 100000;
	const f_atm_trans = 1 - Math.exp(-1 * p / p0); // Atmosphere heat transfer

	// Getting surface properties
	const { tau_surf, ocean_trans } = getSurfaceThermalProperties(planet);

	// Total heat transfer (atmosphere + ocean)
	const f_trans = 1 - (1 - f_atm_trans) * (1 - ocean_trans);

	// Time for surface to cool down 
	const tau_0 = 20; // days
	const tau_rad = tau_surf + tau_0 * Math.pow(p, 0.8);

	// Solar day
	const P_sol = planet.synodicDay.as(T.units.Time.d);
	const rot_ratio = tau_rad / P_sol;

	const f_rot = 1 - Math.exp(-0.75 * rot_ratio); // Rotational smoothing coefficient
	const d_phi = Math.atan(2 * Math.PI * rot_ratio); // Phase shift

	// Subsolar point temperature
	const t_sub = t_eq * ( (1 - f_rot) * Math.SQRT2 + f_rot * Math.pow(4 / Math.PI, 1/4) ) * e_gh;

	// Daily temperature amplitude
	const d_t = (t_sub - t_eq) * (1 - f_rot) * (1 - f_trans);

	// Maximal daytime peak w/ phase shift
	const t_max = t_sub + d_t * Math.cos(d_phi);

	// Night temperature floor
	// For tidally-locked bodies temperature drops to the radiation floor defined by the atmospheric transfer
	const t_night_floor = t_eq * (0.15 + 0.85 * f_trans);
	const cooling_factor = Math.exp(-1 / (2 * rot_ratio));

	// Interpolation between daytime/mean temperature and night floor
	const t_min_base = t_night_floor + (t_eq - t_night_floor) * (1 - (1 - f_trans) * (1 - cooling_factor));
	const t_min = Math.min(t_eq, t_min_base);

	// Orbit eccentricity accounting
	const eccentricity = (!planet.genData.isMoon) && (planet.companion === undefined)
		? planet.eccentricity
		: planet.parentBody.eccentricity;
	const peri_factor = Math.sqrt(1 / (1 - eccentricity));
	const apo_factor = Math.sqrt(1 / (1 + eccentricity));

	// Final results
	const temp_max = t_int + t_max * peri_factor;
	const temp_min = Math.max(t_int + t_min * apo_factor, consts.PHY_TEMP_COSMIC_BACKGROUND);

	planet.temperature_max = new T.Value(temp_max, T.units.Temp.K);
	planet.temperature_min = new T.Value(temp_min, T.units.Temp.K);
}

/**
 * Gets the thermal properties of planet's surface.
 * @param {T.Planet} planet
 * @returns {{ tau_surf: number, ocean_trans: number }}
 */
function getSurfaceThermalProperties(planet) {
	// For giant planets, their "surface" is their giant atmosphere
	if (planet.type !== T.planetTypes.Terrestrial) {
		return { tau_surf: 1000, ocean_trans: 1.0 };
	}

	const ocean = planet.ocean;
	if (ocean === 'Dry') {
		// Basic heat capacity of a dry regolith
		return { tau_surf: 0.08, ocean_trans: 0.0 };
	}

	const coverage = planet.oceanCover;
	let tau_surf = 0; 
	let ocean_trans = 0;

	switch (ocean) {
		case 'Lava':
			tau_surf = 1.5;
			ocean_trans = 0.4; // Lava convection
			break;
		case 'Water':
			// Gigantic heat capacity, heat convection
			tau_surf = 30.0; 
			ocean_trans = 0.75;
			break;
		case 'Water (frozen)':
			// Average heat capacity, no heat conduction via convection
			tau_surf = 1.2;
			break;
		case 'Ammonia water':
			// Similar to pure water
			tau_surf = 25.0;
			ocean_trans = 0.65;
			break;
		case 'Ammonia water (frozen)':
			tau_surf = 1.0;
			break;
		case 'Methane':
			// Lower heat capacity than water's
			tau_surf = 8.0;
			ocean_trans = 0.5;
			break;
	}
	tau_surf *= coverage;
	ocean_trans *= coverage;
	
	const landFraction = 1 - coverage;
	tau_surf += landFraction * 0.08;

	return {
		tau_surf: tau_surf,
		ocean_trans: ocean_trans
	};
}

/**
 * Calculates Earth Similarity Index for a planet.
 * 
 * Radius, density, escape velocity, and surface temperature are accounted.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns (`(0..1]`)
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

/**
 * Gets a planet's classification.
 * 
 * Temperature - composition - mass
 * 
 * @param {T.Planet} planet 
 */
function getPlanetCategory(planet) {
	const capitalizeFirstLetter = (str) => { return str.charAt(0).toUpperCase() + str.slice(1) };

	const temp = planet.temperature.as(T.units.Temp.K);
	const mass = planet.mass.as(T.units.Mass.M_Earth);

	let tempCat = '';
	let tempCatStyle = '';

	if (temp < 110) { 
		// < -163°C, below methane's boiling point (-161.58°C)
		tempCat = 'super-cold'; 
		tempCatStyle = 'cornflowerblue';
	}
	else if (temp < 260) {
		// < -13°C, below 18%-salty water's freezing point
		// Common sea water is ~3.5% salty and freezes at -1.9°C
		// Dead Sea's salinity is up to 35%, freezing point is -20°C
		tempCat = 'cold';
		tempCatStyle = 'lightblue';
	}
	else if (temp < 360) {
		// < 87°C
		tempCat = 'temperate';
		tempCatStyle = 'lightgreen';
	}
	else if (temp < 800) {
		// < 527°C
		tempCat = 'hot';
		tempCatStyle = 'goldenrod';
	}
	else {
		// Above ~525°C things start to glow in visible light (Draper point)
		tempCat = 'super-hot';
		tempCatStyle = 'crimson';
	}

	tempCat = capitalizeFirstLetter(tempCat);
	tempCat = `<span style="color: ${tempCatStyle};">${tempCat}</span>`;

	let compCat = '';
	switch (planet.type) {
		case T.planetTypes.Terrestrial: {
			const compProperties = [];
			if ((mass >= 7.5) && (planet.genData.sma_norm <= 0.1))
				compProperties.push('chtonian');

			if (planet.core.composition.ice >= 0.1)
				compProperties.push('oceanic');

			if (planet.core.composition.iron >= 0.5)
				compProperties.push('iron');
			else if (planet.core.composition.iron < 0.01)
				compProperties.push('coreless');

			compCat = compProperties.join(' ');

			break;
		}

		case T.planetTypes.MiniNeptune:
		case T.planetTypes.IceGiant:
		case T.planetTypes.GasDwarf:
		case T.planetTypes.GasGiant: {
			if (planet.envelope.composition.ice < 0.4)
				compCat = 'gas';
			else if (planet.envelope.composition.ice > 0.6)
				compCat = 'ice';
			else
				compCat = 'hybrid';

			break;
		}

		case T.planetTypes.BrownDwarf: {
			compCat = planet.spectralClass + ' spectral class';

			break;
		}

		default: compCat = '???';
	}

	let massCat = '';
	switch (planet.type) {
		case T.planetTypes.Terrestrial: {
			if (mass < 0.001) massCat = 'asteroid';
			else if (mass < 0.02) massCat = 'micro-Earth';
			else if (mass < 0.2) massCat = 'sub-Earth';
			else if (mass < 2.0) massCat = 'Earth';
			else if (mass < 10) massCat = 'super-Earth';
			else massCat = 'mega-Earth';

			break;
		}
		case T.planetTypes.MiniNeptune:
		case T.planetTypes.IceGiant: {
			if (mass < 10) massCat = 'sub-Neptune';

			else if (mass < 20) massCat = 'Neptune';

			else if (mass < 90) massCat = 'super-Neptune';

			// Saturn-like mass (90+ M⊕) for theoreticized very massive ice giants up to ~140 M⊕
			else massCat = 'mega-Neptune';

			break;
		}

		case T.planetTypes.GasDwarf:
		case T.planetTypes.GasGiant: {
			if (mass < 10) massCat = 'sub-Neptune';

			else if (mass < 20) massCat = 'Neptune';

			// Saturn's mass is 95 M⊕
			else if (mass < 90) massCat = 'sub-Saturn';

			// Value a bit less than 2 M♃
			else if (mass < 635)  massCat = 'Jupiter';

			else massCat = 'super-Jupiter';
			
			break;
		}

		case T.planetTypes.BrownDwarf: {
			// Separation around 63 M♃, defining if a brown dwarf can burn lithium or not (lithium test)
			massCat = `${mass < 20000 ? 'low' : 'high'}-mass brown dwarf`;
			
			break;
		}

		default: massCat = '???';
	}
	
	return [tempCat, compCat, massCat].join(' ');
}
