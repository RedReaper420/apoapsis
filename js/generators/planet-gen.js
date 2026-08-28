
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

import * as nameGen from "./name-gen.js";
import * as planetEvolutionSim from "./planet-evolution-sim.js";

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
		planet.envelope = makeGasGiant(planet);
		
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
			? makeGasGiant(planet) // Binary component could be converted into a giant planet
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

	planet.mountainHeight = calculateMountainHeight(planet);

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
}

/**
 * @param {T.GenerationSettings} settings 
 * @param {T.Planet} planet 
 */
export function planetGeneration_Stage3(settings, planet) {

	if (planet.type === T.planetTypes.Terrestrial) {
		generateAtmosphere(planet);
	}
	else {
		planet.atmosphere = {
			scaleHeight: planet.radius.as(T.units.Dist.km) * 0.05,
			pressure: 0.5,
			cloudCover: 0.95,
			composition: { }
		}
		planet.temperature_eff = new T.Value(planet.temperature.value, planet.temperature.unit);
	}

	planet.planetEvolution = new planetEvolutionSim.PlanetEvolution(settings, planet);
	planet.planetEvolution.doTheEvolution();
	planet.temperature = calculateSurfaceTemperature(planet);
	
	/*
	if (planet.type === T.planetTypes.Terrestrial) {
		const T_surf = planet.temperature.as(T.units.Temp.K);
		const P_surf = planet.atmosphere.pressure;
		const f_ice = planet.core.composition.ice;
		if (
			( (273 <= T_surf) && (T_surf <= 340) ) &&
			( (0.4 <= P_surf) && (10.0 <= P_surf) ) &&
			( f_ice >= 0.005 ) &&
			( (planet.atmosphere.composition["H2"] || 0) === 0 )
		) { // (K_ret < 2.5)
			const lifeChance = Math.pow((planet.age.as(T.units.Time.My) - 2500) / (10000 - 2500), 10);
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
	}
	*/

	if (planet.type !== T.planetTypes.Terrestrial) {
		planet.albedo = assumeAlbedo(planet, planet.temperature_eq);

		planet.temperature.convertTo(T.units.Temp.K);
		planet.temperature_eq.convertTo(T.units.Temp.K);
		planet.temperature_eff.convertTo(T.units.Temp.K);

		planet.temperature_eq.value *= Math.pow(1 - planet.albedo, 1/4);
		planet.temperature.value = planet.temperature_eq.value;
		planet.temperature_eff.value = planet.temperature_eq.value;
	}

	setPlanetColor(planet);
	planet.glowColor = getGlowColor(planet.temperature);
	
	planet.atmosphere.cloudCover = calculateCloudCover(planet);

	setOcean(planet);
	planet.albedo = calculateAlbedo(planet);
	planet.temperature = calculateSurfaceTemperature(planet);

	if ((planet.type === T.planetTypes.Terrestrial) && (planet.temperature.as(T.units.K) < 50)) {
		planet.atmosphere.pressure *= 0.01 * (1 - Math.exp(-0.075 * planet.temperature.as(T.units.K)));

		const A = 4 * Math.PI * (planet.radius.as(T.units.Dist.m) ** 2);
		console.log(planet.atmosphere.mass)
		planet.atmosphere.mass.setValue((planet.atmosphere.pressure * 101325) * A / planet.g.as(T.units.Acc.m_s2), T.units.Mass.kg);

		planet.albedo = calculateAlbedo(planet);
		planet.temperature = calculateSurfaceTemperature(planet);
	}

	if (planet.type === T.planetTypes.Terrestrial)
		console.log(planet.name, planet.F_tidal.total.toPrecision(2));
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

	const baseCurve = sma_norm <= consts.PHY_DIST_SNOW_LINE
		? Math.pow(curveBaseMass * (1 - Math.exp(-5 * sma_norm / consts.PHY_DIST_SNOW_LINE)), 2)
		: curveBaseMass * Math.exp(-x);
	const snowLinePeak = m * Math.exp(-Math.pow(x / 1.2, 2));
	const postSnowLineSlope = sma_norm > consts.PHY_DIST_SNOW_LINE
		? curveBaseMass * Math.exp(-0.2 * x) + m * Math.exp(-0.15 * x)
		: 0;
	const baseMass = Math.max(baseCurve + snowLinePeak, postSnowLineSlope);

	const metalFactor = Math.pow(1.2, 2 * star.metallicity);
	
	const varianceMin = 0.05;
	const variance = ( prng.range(varianceMin, 1.0) + utils.randomRangeGaussian(varianceMin, 1.0) ) / 2;

	let coreMass = baseMass * metalFactor * variance;
	if (sma_norm > consts.PHY_DIST_SNOW_LINE * 5)
		if (prng() < (0.2 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 5))) 
			coreMass *= prng.range(0.1, 0.5); // "failed" distant cores
	
	// Filtering out very small bodies. Those will be automatically removed during the migration simulation.
	if (coreMass < 0.001)
		genData.status = T.migrationStatus.Ejected;

	// Heavy core mass dampening
	if (coreMass > 25)
		coreMass = 25 + Math.pow(coreMass - 25, 1/3);

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
 * Attempts to generate a thick gas envelope for a planet, potentially turning it into some type of a giant.
 * 
 * Outcomes:
 * - No gas envelope (an empty envelope is assigned). Planet type is left as `Terrestrial`.
 * - Relatively thin gas envelope is set. Total planet mass < 15 M⊕. Planet type is set as `Mini-Neptune` or `Gas Dwarf`.
 * - Thick gas envelope is set. Total planet mass >= 15 M⊕. Planet type is set as `Ice Giant` or `Gas Giant`.
 * - Extremely thick gas envelope is set. Total planet mass >= 4100 M⊕. Planet type is set as `Brown Dwarf`.
 * 
 * @param {T.Planet} planet - A planet being transformed.
 */
function makeGasGiant(planet) {
	const sma_norm = planet.genData.sma_init_norm;
	const star = planet.genData.parentStar;

	const critBaseMin = 5.0;
	const critBaseMax = 20.0;
	const criticalMass = critBaseMin + (critBaseMax - critBaseMin) * Math.exp(-0.5 * Math.sqrt(sma_norm));

	const coreMass = planet.core.mass.as(T.units.Mass.M_Earth);
	const coreToCritRatio = coreMass / criticalMass;

	let envelopeMass = 0;
	
	const critRatioFactor = Math.pow(coreToCritRatio, 2);
	const metallicityFactor = Math.max(1, 1 + star.metallicity * 0.4);
	const giantProbability = 0.4 * critRatioFactor * metallicityFactor;
	
	const iceGiantProbability = Math.pow(1 + Math.pow(0.3 * sma_norm, -2), -4);
	let isIceGiant = (prng() < iceGiantProbability) && (sma_norm > consts.PHY_DIST_SNOW_LINE);
	
	if (coreToCritRatio >= 0.5) {
		if (prng() < giantProbability) {
			if (planet.genData.isMoon) {
				if (isIceGiant !== (planet.parentBody.type === T.planetTypes.IceGiant)) {
					// Converting a binary companion to the same giant type as the host with a 50% chance.
					if (prng() < 0.5) isIceGiant = !isIceGiant;
				}
			}

			let envelopeMult = 0;
			if (isIceGiant) {
				// Ice Giant
				envelopeMult = prng.range(0.5, 1.9);
				const dampeningThreshold = 0.9;
				if (envelopeMult > dampeningThreshold) {
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * star.mass.as(T.units.Mass.M_Sun)));
				}

				envelopeMass = coreMass * envelopeMult;
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
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * star.mass.as(T.units.Mass.M_Sun)));
				}

				envelopeMass = coreMass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
			}
		}
		else {
			const subNeptuneChance = 1 / (1 + Math.exp(-5 * 0.05 * (sma_norm - consts.PHY_DIST_SNOW_LINE)));
			if (prng() < subNeptuneChance) {
				if (isIceGiant) {
					// Mini-Neptune
					envelopeMass = coreMass * prng.range(0.05, 0.5);
				}
				else {
					// Gas Dwarf
					let gasDwarfAllowanceChance = 1 / (1 + Math.exp(-5 * (sma_norm - consts.PHY_DIST_SNOW_LINE * 0.7)));
					if (sma_norm < consts.PHY_DIST_SNOW_LINE * 0.25)
						gasDwarfAllowanceChance = 0;

					if (prng() < gasDwarfAllowanceChance) {
						envelopeMass = coreMass * prng.range(0.05, Math.max(0.10, 1.0 * gasDwarfAllowanceChance));
					}
				}
			}
		}
	}
	
	let envelopeIceFraction = isIceGiant
		? prng.range(0.65, 0.85)
		: prng.range(0.05, 0.15);
	
	if (envelopeMass > 0) {
		if ((coreMass + envelopeMass) >= consts.DEF_BROWN_DWARF_MASS_THRESHOLD) {
			planet.type = T.planetTypes.BrownDwarf;
		}
		else if ((coreMass + envelopeMass) < consts.DEF_SUB_NEPTUNE_MASS_THRESHOLD) {
			planet.type = isIceGiant
				? T.planetTypes.MiniNeptune
				: T.planetTypes.GasDwarf;
		}
		else {
			planet.type = isIceGiant
				? T.planetTypes.IceGiant
				: T.planetTypes.GasGiant;
		}
	}
	
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

	return new T.Envelope(
		new T.Value(envelopeMass, T.units.Mass.M_Earth), 
		1.0 - envelopeIceFraction, 
		envelopeIceFraction
	);
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
	planet.density = bulkDensity;
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
 * Calculates maximal mountain height for a planet.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value} (unit: `Dist`)
 */
function calculateMountainHeight(planet) {
	if (planet.type !== T.planetTypes.Terrestrial)
		return new T.Value(0, T.units.Dist.m);

	const f_iron = planet.core.composition.iron;
	const f_rock = planet.core.composition.rock;
	const f_ice = planet.core.composition.ice;

	// Total non-iron surface-forming materials
	const f_crust = f_rock + f_ice;

	// If, somehow, we've got a sphere of pure iron
	if (f_crust <= 0.001)
		return new T.Value(0, T.units.Dist.m);

	// Normalize crust composition (rock vs ice ratio on the surface)
	const rock_ratio = f_rock / f_crust;
	const ice_ratio = f_ice / f_crust;

	/** Crust material yield strength, Pa */
	const mat_yield = (2e8 * rock_ratio) + (1e7 * ice_ratio);

	/** Crust material density, kg/m³ (density of the mountain itself) */
	const rho_mat = (3000 * rock_ratio) + (920 * ice_ratio);
	
	const R = planet.radius.as(T.units.Dist.m);
	const g = planet.g.as(T.units.Acc.m_s2);

	/**
	 * Hydrostatic unconstrained height (m) taken by this formula:
	 * 
	 * `h_max ~= σ_yield / (ρ_rock * g)`, where:
	 * 
	 * - `σ_yield` - rock compressive strength (yield strength), Pa
	 * - `ρ_rock` - rock density, kg/m³
	 * - `g` - gravitational acceleration, m/s²
	 */
	const h_0 = mat_yield / (rho_mat * g);

	/**
	 * Geometrically corrected height for small bodies.
	 * `h_geo = h_0 / (1 - (h_0 / R))`
	 */
	const h_geo = (h_0 / R) < 0.7
		? h_0 / (1 - (h_0 / R))
		: 0.3 * R; // Smooth cap for small bodies where gravity drops off significantly with altitude

	// Estimating litosphere thickness
	const R_Earth = planet.radius.as(T.units.Dist.R_Earth);

	// Base lithosphere fraction for silicate body (smaller bodies cool deeper)
	const lithoFraction = Math.min(0.8, 0.03 * Math.pow(R_Earth, -0.8));

	/*
	Mercury-like planets correction.
	High iron content means a massive metal core and a thin silicate mantle/crust.
	The thickness of the silicate mantle scales roughly as (1 - f_iron)^(1/3).
	Heavy iron cores also accelerate cooling (iron conducts heat faster than rock).
	*/
	const mantleVolumeFactor = Math.pow(Math.max(0.01, 1.0 - f_iron), 1/3);
	
	// Ice lithospheres deform/relax much faster under lower temperatures 
	const compositionSoftening = 1.0 - (0.7 * ice_ratio); 

	// Younger planets have thinner lithospheres
	const age_Gy = planet.age.as(T.units.Time.Gy);
	const ageFactor = Math.min(1.5, Math.sqrt(age_Gy / 4.5));

	// Litosphere thickness is capped by the actual physical thickness of the mantle shell
	const maxPossibleMantleThickness = R * mantleVolumeFactor;
	const T_c_estimated = R * lithoFraction * compositionSoftening * ageFactor;

	const T_c = Math.min(T_c_estimated, maxPossibleMantleThickness * 0.8);
	
	// Elastic support limit: mountains rarely exceed ~25% of effective lithosphere thickness
	const h_max = Math.min(h_geo, T_c * 0.25);

	return new T.Value(h_max, T.units.Dist.m);
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
	const R_roche = 2.44 * R_host * Math.pow(host.density / planet.density, 1/3);
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
	let rotationPeriod_h = 24 * Math.pow(planet.mass.as(T.units.Mass.M_Earth), -utils.randomRangeGaussian(0.3, 0.5)) * (10 ** utils.gaussianRandom(0, 0.5));

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
 * @returns {T.Value} (unit: `Temp`)
 */
function calculateBlackBodyTemperature(planet) {
	// Calculating black-body temperature (albedo = 0) from Earth's effective temperature w/o its albedo (0.3)
	const T_bb_prim = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(planet.genData.sma_norm) / Math.pow(1 - 0.30, 1/4);

	let T_bb_sec = 0;
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
	}
	else if (parentStar.parentBody instanceof T.Star) {
		const sma_norm = parentStar.sma.as(T.units.Dist.AU) / Math.sqrt(parentStar.parentBody.luminosity);
		T_bb_sec = consts.PHY_EARTH_TEMP_EQ / Math.sqrt(sma_norm) / Math.pow(1 - 0.30, 1/4);
	}

	const T_bb = Math.pow((T_bb_prim ** 4) + (T_bb_sec ** 4), 1/4);
	return new T.Value(T_bb, T.units.Temp.K);
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
 * Assumes the planet's albedo based on the planet's type and black-body temperature.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns
 */
function assumeAlbedo(planet) {
	const temp = planet.temperature_bb.as(T.units.Temp.K);
	switch (planet.type) {
		case T.planetTypes.BrownDwarf: {
			return 0.4;
		}

		case T.planetTypes.GasGiant:
		case T.planetTypes.GasDwarf: {
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

		case T.planetTypes.IceGiant:
		case T.planetTypes.MiniNeptune: {
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
			const f_iron = planet.core.composition.iron;
			const f_rock = planet.core.composition.rock;
			const f_mat = f_iron + f_rock;
			
			const rockAlbedo = 0.1 * (f_iron / f_mat) + 0.2 * (f_rock / f_mat);

			const f_ice = planet.core.composition.ice;
			const iceToWaterRegime = 1 / (1 + Math.exp(0.2 * (temp - 130)));
			const iceAlbedo = (f_ice ** (1/6)) * ( (0.7 * iceToWaterRegime) + (0.3 * (1 - iceToWaterRegime)) );

			return rockAlbedo + iceAlbedo;
		}
	}
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
 * 
 * @param {T.Planet} planet 
 */
function generateAtmosphere(planet) {
	const planetMass_MEarth = planet.mass.as(T.units.Mass.M_Earth);
	const planetRadius_REarth = planet.radius.as(T.units.Dist.R_Earth);

	const T_eq = planet.temperature_eq.as(T.units.Temp.K);
	const F_tidal = planet.F_tidal.total;

	const T_eff = Math.pow( (T_eq ** 4) + (F_tidal / consts.PHY_SIGMA) , 1/4);
	planet.temperature_eff = new T.Value(T_eff, T.units.Temp.K);

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
			mass: new T.Value(0, T.units.Mass.kg),
			scaleHeight: 0,
			mu: 0,
			cloudCover: 0,
			composition: {},
		}
		planet.temperature = new T.Value(planet.temperature_eff.value, planet.temperature_eff.unit);
		
		return;
	}

	const f_ice = planet.core.composition.ice;
	const f_rock = planet.core.composition.rock;
	const f_iron = planet.core.composition.iron;

	const P_base = (f_ice * 0.1) + (f_rock * 0.01) + (f_iron * 0.001);
	const f_ret = utils.clamp( (K_ret - 0.20) / 0.70 , 0.0, 10.0) ** 2;
	const g_Earth = planetMass_MEarth / (planetRadius_REarth ** 2);
	const tidalOutgassing = 1.0 + Math.min(F_tidal / 0.01, 50.0);
	const M_press = Math.pow(10, utils.clamp( utils.gaussianRandom(0, 0.5) , -1, 1));
	const distFactor = planet.genData.sma_norm > 1 ? 1 / Math.sqrt(planet.genData.sma_norm) : 1;

	const P_surf_raw = P_base * f_ret * g_Earth * tidalOutgassing * M_press * distFactor;

	const dampeningThreshold = 200 * Math.exp(-5 * planetMass_MEarth);
	const P_dampened = P_surf_raw >= dampeningThreshold
		? dampeningThreshold + Math.pow(P_surf_raw - dampeningThreshold, 0.75)
		: P_surf_raw;
	const dampeningFactor = Math.min(1, (planetMass_MEarth / 10) ** 3);

	const P_surf = P_surf_raw * dampeningFactor + P_dampened * (1 - dampeningFactor);

	const T_surf = T_eff * (1 + 0.4 * Math.log10(1 + P_surf));
	planet.temperature = new T.Value(T_surf, T.units.Temp.K);
	
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
				 N2: prng.range(0.85, 0.95),
				CH4: prng.range(0.02, 0.05),
				 CO: prng.range(0.01, 0.05),
			};
		}
	}
	else {
		compositionRaw = {
			 N2: prng.range(0.80, 0.95),
			CH4: prng.range(0.01, 0.02),
			 Ne: prng.range(0.01, 0.05),
		};
	}

	
	if ((F_tidal > 0.05) && (f_ice < 0.05)) {
		compositionRaw.SO2 = (compositionRaw.SO2 || 0) + prng.range(0.10, 0.15);
		compositionRaw.CO2 = (compositionRaw.CO2 || 0) + prng.range(0.10, 0.30);
		compositionRaw.H2O = (compositionRaw.H2O || 0) + prng.range(0.01, 0.05);
	}

	const envelopeChance = utils.clamp((K_ret - 2.5) / (6.5 - 2.5), 0.0, 1.0);
	if (prng() < envelopeChance) {
		const envelope = {
			 H2: prng.range(0.70, 0.80),
			 He: prng.range(0.15, 0.25),
			CH4: prng.range(0.01, 0.04),
		};

		const impacts = planet.genData.isMoon ? planet.parentBody.genData.impacts : planet.genData.impacts;
		const envelopeWeight = prng.range(0.75, 0.95) * (envelopeChance ** 2) / ((impacts + 1) ** 2);

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
	
	const A = 4 * Math.PI * (planet.radius.as(T.units.Dist.m) ** 2);
	const atmosphereMass = new T.Value((P_surf * 101325) * A / planet.g.as(T.units.Acc.m_s2), T.units.Mass.kg);

	planet.atmosphere = {
		pressure: P_surf,
		mass: atmosphereMass,
		scaleHeight: H,
		composition: compositionFinal,
		mu: mu,
		cloudCover: 0,
	}
	
	planet.temperature = calculateSurfaceTemperature(planet);
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
	let sum = 0;
	for (const gas in composition) {
		sum += composition[gas] * consts.PHY_MOLAR_MASSES[gas];
	}
	return sum;
}

const CONDENSABLE_GASES = ['H2O', 'CH4', 'NH3', 'SO2', 'CO2', 'SiO2'];

function calculateCloudCover(planet) {
	
	const { pressure, composition } = planet.atmosphere;
	if (pressure < 0.005) return 0; // На Марсе облаков мало, а без атмосферы их вовсе нет

	// 1. Сумма долей газов, способных образовывать облака
	let condensableShare = 0;
	for (const gas of CONDENSABLE_GASES) {
		if (composition[gas]) {
			condensableShare += composition[gas];
		}
	}

	if (condensableShare <= 0) return 0;

	// 2. Влияние давления: чем выше давление, тем плотнее слой облаков
	const pressureFactor = 1 - Math.exp(-pressure / 1.5);

	// 3. Финальное покрытие (0.0 = чистая атмосфера, 1.0 = сплошной покров как на Венера)
	const coverage = Math.min(1.0, Math.sqrt(condensableShare) * pressureFactor * 1.5);

	return coverage; // Значение float [0.0 ... 1.0]
}

import {temperatureToColor} from "./star-gen.js";
import { eventBus } from "../utils/eventbus.js";

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
function setPlanetColor(planet) {
	if (planet.type === T.planetTypes.Terrestrial)
		planet.color =  setTerrestrialColor(planet);
	else
		planet.color =  setGasGiantColor(planet)
}

/**
 * 
 * @param {T.Planet} planet 
 */
function setTerrestrialColor(planet) {
	const metallicity = planet.core.composition.iron / (1 - planet.core.composition.ice);

	const red 	= Math.floor(65 + 90 * (1 - metallicity));
	const green = Math.floor(55 + 80 * (1 - metallicity));
	const blue 	= Math.floor(45 + 70 * (1 - metallicity));
	
	const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
	return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * 
 * @param {T.Planet} planet 
 */
function setGasGiantColor(planet) {
	const temp = planet.temperature.as(T.units.Temp.K);

	// Atmosphere composition settings are done only for visuals.

	if (planet.type === T.planetTypes.BrownDwarf) {
		planet.atmosphere.composition = {
			H2: 0.95,
			He: 0.05,
		};
	}
	else {
		if (temp >= 1400) {
			planet.atmosphere.composition = {
				SiO2: 0.70,
				CO: 0.20,
				H2O: 0.10,
			};
			planet.atmosphere.cloudCover = 0.5;
			planet.atmosphere.scaleHeight *= 2;
		}
		else if (temp >= 900) {
			planet.atmosphere.composition = {
				NaK: 0.80,
				CO: 0.10,
				H2O: 0.10,
			};
			planet.atmosphere.cloudCover = 0.1;
			planet.atmosphere.scaleHeight *= 1.5;
		}
		else if (temp >= 350) {
			planet.atmosphere.composition = {
				NaK: 0.30,
				H2O: 0.60,
				CH4: 0.10,
			};
		}
		else if (temp >= 250) {
			planet.atmosphere.pressure *= 0.5;
			planet.atmosphere.composition = {
				H2O: 0.85,
				CH4: 0.10,
				NH3: 0.05,
			};
			planet.atmosphere.cloudCover = 0.1;
		}
		else if (temp >= 150) {
			planet.atmosphere.composition = {
				H2O: 0.85,
				CH4: 0.10,
				NH3: 0.05,
			};
		}
		else {
			planet.atmosphere.composition = {
				NH3: 0.65,
				H2O: 0.25,
				CH4: 0.10,
			};
		}
	}
	
	switch (planet.type) {
		case T.planetTypes.BrownDwarf: {
			return "#43202b";
		}

		case T.planetTypes.GasGiant:
		case T.planetTypes.GasDwarf: {
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
				return "#6A0000"; // // Type V: Super-hot (clouds of liquid iron and silicates are deflecting light)
			}
			// temp >= 1300
			return "#6A0000"; // Type V: Super-hot (clouds of liquid iron and silicates are deflecting light)
		}

		case T.planetTypes.IceGiant:
		case T.planetTypes.MiniNeptune: {
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
				return "#6B1010";
			}
			// temp >= 1300
			return "#6A0000";
		}
	}
}

/**
 * Phase points constants for pure substances (Temperature in K, Pressure in Pa)
 */
const SUBSTANCES = {
  	H2O: {
		name: "Water",
		triple: { T: 273.16, P: 611.657 },
		critical: { T: 647.096, P: 22064000 },
		antoine: { A: 10.073, B: 1730.63, C: -39.724 },
  	},
	CH4: {
		name: "Methane",
		triple: { T: 90.69, P: 11700 },
		critical: { T: 190.56, P: 4599200 },
		antoine: { A: 8.928, B: 405.42, C: -5.88 },
	},
	NH3: {
		name: "Ammonia",
		triple: { T: 195.4, P: 6060 },
		critical: { T: 405.5, P: 11280 },
		antoine: { A: 8.1876, B: 506.71, C: -80.78 },
	}
};

/**
 * Calculates equilibrium vapor pressure by Antoine equation
 * @param {Object} substance
 * @param {number} tempK  
 * @returns {number}
 */
function getVaporPressure(substance, tempK) {
	const { A, B, C } = substance.antoine;
	const logP = A - (B / (tempK + C));
	return Math.pow(10, logP);
}

/**
 * Determines phase state of a pure substance.
 * @param {string} substanceKey - `H2O` or `CH4`
 * @param {number} tempK - Surface temperature (in K)
 * @param {number} pressurePa - Atmosphere pressure (in Pa, 1 atm = 101325 Pa)
 * @returns {Object} An object with phase state (`.phase`) and description (`.desc`)
 */
function getPhaseState(substanceKey, tempK, pressurePa) {
	const sub = SUBSTANCES[substanceKey];
	if (!sub) throw new Error(`Unknown substance: ${substanceKey}`);

	const { triple, critical } = sub;

	// 1. Supercritical fluid
	if (tempK > critical.T && pressurePa > critical.P) {
		return { phase: "SUPERCRITICAL", desc: "Supercritical fluid (no distinction between gas and liquid)" };
	}

	// 2. Gas at high temperatures (above critical T, but at low pressure)
	if (tempK > critical.T) {
		return { phase: "GAS", desc: "Gas (above critical temperature)" };
	}

	// 3. Sublimation check (pressure is below the triple point)
	if (pressurePa < triple.P) {
		const pVapor = getVaporPressure(sub, tempK);
		if (pressurePa < pVapor || tempK > triple.T) {
			return { phase: "GAS", desc: "Gas / Vapor (pressure is below the triple point)" };
		} 
		else {
			return { phase: "SOLID", desc: "Solid (Ice / Frost)" };
		}
	}

	// 4. Melting check (Solid vs Liquid/Gas)
	if (tempK < triple.T) {
		return { phase: "SOLID", desc: "Solid (Ice)" };
	}

	// 5. Boiling / condensing check (Liquid vs Gas)
	const pVapor = getVaporPressure(sub, tempK);
	if (pressurePa >= pVapor) {
		return { phase: "LIQUID", desc: "Liquid" };
	} 
	else {
		return { phase: "GAS", desc: "Gas / Vapor" };
	}
}

/**
 * Constants for eutectic system Water-Ammonia (~1 atm)
 */
const EUTECTIC_SYSTEM_H2O_NH3 = {
	eutecticPoint: {
		w_NH3: 0.321,    // Ammonia mass fraction (32.1%)
		T_melt: 176.15   // Eutectic freezing temperature (~ -97°C)
	},
	pureH2O: { T_melt: 273.15, T_boil: 373.15, pCrit: 22064000 },
	pureNH3: { T_melt: 195.42, T_boil: 239.82, pCrit: 11280000 },

	/**
	 * Approximate liquidus temperature (freezing point) based on NH3 fraction
	 * @param {number} w - NH3 mass fraction [0..1]
	 */
	getMeltTemperature(w) {
		const wE = this.eutecticPoint.w_NH3;
		const TE = this.eutecticPoint.T_melt;

		if (w <= wE) {
			// Left branch: from pure H2O to the eutectic (H2O crystallizes as ice)
			return this.pureH2O.T_melt - (this.pureH2O.T_melt - TE) * Math.pow(w / wE, 0.85);
		} 
		else {
			// Right branch: from the eutectic to pure NH3 (ammonia hydrate crystallizes)
			return TE + (this.pureNH3.T_melt - TE) * Math.pow((w - wE) / (1 - wE), 1.2);
		}
	},

	/**
	 * Simplified boiling point of a compound (Raoult/Henry law deviation)
	 */
	getBoilingTemperature(w, pressurePa) {
		// Base T_boil proportionate to molar fraction (at 1 атм)
		const tBoil1atm = this.pureH2O.T_boil * (1 - w) + this.pureNH3.T_boil * w;
		
		// Atmospheric pressure correction (Clausius-Clapeyron)
		const P0 = 101325;
		const dH_vap = 35000; // J/mol (average heat of vaporization)
		const R = 8.314;
		
		const invT = (1 / tBoil1atm) - (R * Math.log(pressurePa / P0) / dH_vap);
		return 1 / invT;
	}
};

/**
 * Estimates the state of a water-ammonia ocean.
 * @param {number} tempK - Surface temperature (K)
 * @param {number} pressurePa - Atmosphere pressure (Pa)
 * @param {number} ammoniaFraction - NH3 mass fraction in the ocean (от 0.0 до 1.0)
 */
function getEutecticOceanState(tempK, pressurePa, ammoniaFraction = 0.15) {
	const sys = EUTECTIC_SYSTEM_H2O_NH3;
	const w = Math.max(0, Math.min(1, ammoniaFraction));

	const T_melt = sys.getMeltTemperature(w);
	const T_boil = sys.getBoilingTemperature(w, pressurePa);

	// 1. Freezing check
	if (tempK < T_melt) {
		return {
		phase: "SOLID",
		composition: w > 0 ? "Water-ammonia ice / Hydrates" : "Water ice",
		desc: `Frozen surface (T < ${T_melt.toFixed(1)} K)`
		};
	}

	// 2. Boiling / total evaporation check
	if (tempK > T_boil) {
		return {
		phase: "GAS",
		composition: "H2O + NH3 vapor",
		desc: `Ocean has been evaporated (T > ${T_boil.toFixed(1)} K)`
		};
	}

	// 3. Stable liquid phase
	return {
		phase: "LIQUID",
		meltTemp: Number(T_melt.toFixed(1)),
		boilTemp: Number(T_boil.toFixed(1)),
		desc: `Liquid ocean (${(w * 100).toFixed(1)}% NH3). Is liquid within the range: ${T_melt.toFixed(1)}K - ${T_boil.toFixed(1)}K`
	};
}

class OceanSubstance {
	constructor () {
		this.name = '';
		this.color = '#00000000';

		this.budget = 0;
		this.state = '';

		this.substance = '';
		this.density = 1.0; // Density, g/cm^3
		this.bulk = 1; // Bulk modulus, Pa

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			const pressure = planet.atmosphere.pressure * 101325;
			const state = getPhaseState(this.substance, temp, pressure);
			this.state = state.phase;
		};

		this.calculateBudget = () => { this.budget = 0 };
	}
}

class Lava extends OceanSubstance {
	constructor () {
		super();

		this.name = 'Lava';
		this.color = '#ff4400';

		this.density = 2.2;
		this.bulk = 3e9;

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			this.state = temp >= 1000 ? 'LIQUID' : 'SOLID';
			this.color = planet.glowColor.slice(0, planet.glowColor.length-2);
		};

		this.calculateBudget = (planet) => {
			if (this.state === 'SOLID') {
				this.budget = 0;
				return;
			}

			this.budget = planet.core.composition.rock * 0.001;

			const temp = planet.temperature.as(T.units.Temp.K);
			this.budget *= (temp - 1000) / (1400 - 1000);
		};
	}
}

class Water extends OceanSubstance {
	constructor () {
		super();

		this.name = 'Water';
		this.color = '#164b92';

		this.substance = 'H2O';
		this.density = 1.025;
		this.bulk = 2.2e9;

		this.calculateBudget = (planet) => {
			if (((this.state === 'SOLID') || (this.state === 'LIQUID')) === false) {
				this.budget = 0;
				return;
			}

			if (1 / Math.sqrt(planet.genData.sma_norm) > 1.15) {
				this.budget = 0;
				return;
			}

			this.budget = planet.core.composition.ice * 0.99;

			if (this.state === 'SOLID')
				this.budget *= -1;
		};
	}
}

class Methane extends OceanSubstance {
	constructor () {
		super();

		this.name = 'Methane';
		this.color = '#bf610f';

		this.substance = 'CH4';
		this.density = 0.423;
		this.bulk = 1.3e8;

		this.calculateBudget = (planet) => {
			if (!(this.state === 'LIQUID')) {
				this.budget = 0;
				return;
			}

			this.budget = planet.core.composition.ice * 0.005;
		};
	}
}

class AmmoniaWater extends OceanSubstance {
	constructor () {
		super();

		this.name = 'Ammonia water';
		this.color = '#22a2d1';

		this.NH3_f = 0;
		this.substance = 'NH3';
		this.density = 0.89;
		this.bulk = 11e9;

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			const pressure = planet.atmosphere.pressure * 101325;

			const iceFactor = Math.min(1, (planet.core.composition.ice * 15) ** 3);
			const distFactor = Math.min(1, Math.exp(2 * (planet.genData.sma_norm - consts.PHY_DIST_SNOW_LINE)));
			this.NH3_f = 0.33 * iceFactor * distFactor;

			this.state = (getEutecticOceanState(temp, pressure, this.NH3_f)).phase;
		};

		this.calculateBudget = (planet) => {
			if (((this.state === 'SOLID') || (this.state === 'LIQUID')) === false) {
				this.budget = 0;
				return;
			}

			if (this.NH3_f < 0.05) {
				this.budget = 0;
				return;
			}

			this.budget = planet.core.composition.ice;

			if (this.state === 'SOLID')
				this.budget *= -1;
		};
	}
}

/**
 * 
 * @param {T.Planet} planet 
 */
function setOcean(planet) {
	if (planet.type !== T.planetTypes.Terrestrial)
		return;

	const oceanSubstances = {
		lava: new Lava(),
		water: new Water(),
		methane: new Methane(),
		ammonia: new AmmoniaWater(),
	};

	/*
	Earth's ocean takes 0.022% of total mass and covers 71% of the surface area.
	It will take about 3 times more of the ocean's mass to fully submerge the land.
	Thus, 0.067% threshold chosen.
	(0.00022 / 0.00067)^1/3 ~= 0.69 = 69% (close enough to 71%)
	*/
	const totalOceanThreshold = 0.00067;

	// Getting surface ocean
	let maxSubstance = oceanSubstances.lava;
	for (const substance in oceanSubstances) {
		oceanSubstances[substance].calculateState(planet);
		oceanSubstances[substance].calculateBudget(planet);

		if (oceanSubstances[substance].budget > maxSubstance.budget)
			maxSubstance = oceanSubstances[substance];
	}
	
	if ((maxSubstance.budget > 0) && (maxSubstance.name !== 'Lava')) {
		// Adds ocean substance's vapor into the atmosphere
		for (let i = 0; i < 5; i++) {
			const t = planet.temperature.as(T.units.Temp.K);
			const p = planet.atmosphere.pressure * 101325 * (planet.atmosphere.composition[maxSubstance.substance] || 0);
			const pSat = getVaporPressure(SUBSTANCES[maxSubstance.substance], t);

			if (pSat >= p)
				enrichAtmosphere(planet, maxSubstance.substance, pSat / 101325);
			else
				break;
		}

		const t = planet.temperature.as(T.units.Temp.K);
		const p = planet.atmosphere.pressure * 101325;
		const pSat = getVaporPressure(SUBSTANCES[maxSubstance.substance], t);

		if (pSat >= p) {
			// If needed vapor pressure still exceeds total atmosphere pressure - deleting the ocean
			maxSubstance.budget = 0;
		}
		else {
			// Decreasing ocean size according to pressure ratio
			const liquidFraction = Math.max(0, 1 - Math.pow(pSat / p, 1/3));
			maxSubstance.budget *= liquidFraction;
		}
	}
	
	if (maxSubstance.budget > 0) {
		// Setting surface ocean

		planet.ocean = maxSubstance.name;
		planet.oceanColor = maxSubstance.color;
		planet.oceanDepth = calculateOceanDepth(planet, maxSubstance);
		planet.oceanCover = Math.min(1.0, Math.pow(maxSubstance.budget / totalOceanThreshold, 1/3));
		planet.oceanCoverVisual = planet.oceanCover;

		if (planet.ocean === 'Water')
			eventBus.emit('shtap');
	}
	else {
		// Getting frozen/subsurface ocean

		let hasFrozenOcean = false;
		// A planet must be cold enough, otherwise its ice will sublimate too quickly, 
		// leaving no ice at the surface in geological time.
		if (planet.temperature.as(T.units.Temp.K) <= 150) {
			for (const substance in oceanSubstances) {
				if (oceanSubstances[substance].budget < maxSubstance.budget)
					maxSubstance = oceanSubstances[substance];
			}

			if (maxSubstance.budget < 0)
				hasFrozenOcean = true;
		}

		if (hasFrozenOcean) {
			// Frozen (ammonia) water ocean case

			maxSubstance.budget = Math.abs(maxSubstance.budget);

			planet.ocean = maxSubstance.name + ' (frozen)';
			planet.oceanColor = '#d7f0ffbf';

			planet.oceanDepth = calculateOceanDepth(planet, maxSubstance);
			planet.oceanCover = Math.min(1.0, Math.pow(maxSubstance.budget / totalOceanThreshold, 1/3))
			planet.oceanCoverVisual = planet.oceanCover;
		}
		else {
			// Dry planet case

			planet.ocean = 'Dry';
			
			// Setting a slightly darker land color to draw dried up "seas" later.
			const color = utils.parseColor(planet.color);
			for (const c in color) { color[c] = Math.floor(color[c] * 0.85); }
			const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
			planet.oceanColor = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
			
			planet.oceanDepth = new T.Value(0, T.units.Dist.m);
			planet.oceanCover = 0; // 0% in the stats.

			// Visually, dried up seas with some variance are left.
			const iceComponent = Math.min(1.0, Math.pow(planet.core.composition.ice / totalOceanThreshold, 1/3));
			const randComponent = prng.range(0.25, 0.75);
			planet.oceanCoverVisual = (iceComponent * 0.75) + (randComponent * 0.25);
		}
	}

	planet.landscape = prng.range(0.01, 0.05); // Determines islands/continents scale (bigger value -> smaller islands)
}

/**
 * 
 * @param {T.Planet} planet 
 * @param {OceanSubstance} substance 
 * @returns 
 */
function calculateOceanDepth(planet, substance) {
	const M = planet.mass.as(T.units.Mass.kg);
	const R = planet.radius.as(T.units.Dist.m);
	const g = planet.g.as(T.units.Acc.m_s2);

	const f = substance.budget;
	const rho = substance.density * 1000;
	const K = substance.bulk;

	const V = (M * f) / rho;
	const H = V / (4 * Math.PI * (R ** 2))
	const H_compr = H * (1 - (H * g / (2 * K)));

	return new T.Value(H_compr, T.units.Dist.m);
}

/**
 * 
 * @param {T.Planet} planet 
 * @param {string} substance 
 * @param {number} pressure 
 */
function enrichAtmosphere(planet, substance, pressure) {
	const radius_RE = planet.radius.as(T.units.Dist.R_Earth);
	const mass_ME = planet.mass.as(T.units.Mass.M_Earth);
	
	const payloadMass = pressure * (radius_RE ** 4) / mass_ME;
	const massRatio = payloadMass / (planet.atmosphere.mass.as(T.units.Mass.M_Earth_atm) + payloadMass);
	
	const payload = { N2: 0.75 };
	payload[substance] = 0.25;

	const compositionMixed = {};
	let compositionRaw = planet.atmosphere.composition;
	for (const gas in payload)
		compositionMixed[gas] = (compositionMixed[gas] || 0) + payload[gas] * massRatio;
	for (const gas in compositionRaw)
		compositionMixed[gas] = (compositionMixed[gas] || 0) + compositionRaw[gas] * (1 - massRatio);
	
	compositionRaw = compositionMixed;
	const compositionFinal = normalizeComposition(compositionRaw);

	planet.atmosphere.composition = compositionFinal;
	planet.atmosphere.pressure += pressure;
	planet.atmosphere.mass.convertTo(T.units.Mass.M_Earth_atm);
	planet.atmosphere.mass.value += payloadMass;

	planet.temperature = calculateSurfaceTemperature(planet);
}

/**
 * Calculates surface temperature using gray-atmosphere optical depth.
 * 
 * @param {T.Planet} planet 
 * 
 * @returns {T.Value}
 */
function calculateSurfaceTemperature(planet) {
	const totalPressureAtm = planet.atmosphere.pressure;

	// Greenhouse coefficients (k_i) and saturation powers (alpha_i)
	const greenhouseParams = {
		CO2: { k: 0.85, alpha: 0.7 },
		H2O: { k: 1.50, alpha: 0.8 },
		CH4: { k: 2.10, alpha: 0.6 },
		NH3: { k: 3.50, alpha: 0.5 },
		SO2: { k: 1.20, alpha: 0.6 },
		CO:  { k: 0.10, alpha: 0.8 },
		H2:  { k: 0.05 + 0.45 * (1 / (1 + Math.exp(-2 * (totalPressureAtm - 3)))), alpha: 1.3 } // CIA effect at high pressure
	};

	let totalTau = 0;

	for (const [gas, fraction] of Object.entries(planet.atmosphere.composition)) {
		const params = greenhouseParams[gas];
		if (!params || fraction <= 0) continue;

		// Partial pressure in atm
		const pPartial = totalPressureAtm * fraction;
		
		// Optical depth contribution
		const tau_i = params.k * Math.pow(pPartial, params.alpha);
		totalTau += tau_i;
	}

	// Eddington approximation for gray atmosphere
	// T_surf = T_eff * (1 + 0.75 * tau)^(1/4)
	const T_eff = planet.temperature_eff.as(T.units.Temp.K);
	const T_surf = T_eff * Math.pow(1 + 0.75 * totalTau, 0.25);

	return new T.Value(T_surf, T.units.Temp.K);
}

/**
 * Calculates surface temperature using gray-atmosphere optical depth.
 * 
 * @param {T.Planet} planet 
 */
function calculateAlbedo(planet) {
	if (planet.type !== T.planetTypes.Terrestrial)
		return planet.albedo;

	const f_iron = planet.core.composition.iron;
	const f_rock = planet.core.composition.rock;
	const f_mat = f_iron + f_rock;
	const albLand = 0.1 * (f_iron / f_mat) + 0.2 * (f_rock / f_mat);
	
	const liqConfig = {
		lava: 0.04,
		water: 0.06,
		methane: 0.02,
		ammonia: 0.05,
	};

	let albOcean = 0;
	for (const liq in liqConfig) {
		const ocean = planet.ocean.toLowerCase();
		if (ocean.includes(liq)) {
			albOcean += ocean.includes('frozen') ? 0.7 : liqConfig[liq];
			break;
		}
	}

	const albSurf = albLand * (1 - planet.oceanCover) + albOcean * planet.oceanCover;

	const gasConfig = {
		H2O: 0.65,
		CH4: 0.35,
		NH3: 0.55,
		SO2: 0.85,
		SiO2: 0.5,
	};

	let albAtmComp = 0;
	for (const [gas, fraction] of Object.entries(planet.atmosphere.composition)) {
		const albedo = gasConfig[gas];
		if (!albedo || fraction <= 0) continue;
		
		albAtmComp += albedo * Math.pow(fraction, 1/3);
	}
	albAtmComp = Math.min(0.8, albAtmComp) + Math.pow(Math.max(0, albAtmComp - 0.8), 3);

	const albAtmP = 0.5 * (1 - Math.exp(-0.05 * planet.atmosphere.pressure));

	const albAtm = Math.max(albAtmComp, albAtmP);

	const alb = albAtm + Math.pow(1 - albAtm, 2) * albSurf;

	return alb;
}