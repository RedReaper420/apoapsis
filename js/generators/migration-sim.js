
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";

/**
 * Applies orbital migration forces (Type I / Type II) to a single planet over a time step.
 * 
 * @param {types.GenerationSettings} settings - Generation configuration settings.
 * @param {types.Planet} planet - The target planet undergoing migration.
 * @param {number} diskDensity - The current density of the protoplanetary gas disk.
 * @param {number} timeStepYears - Time step duration in years (Δt).
 * @param {boolean} isGrandTackActive - Flag indicating if Jupiter/Saturn-like outward migration is triggered.
 */
function applyMigration(settings, planet, diskDensity, timeStepYears, isGrandTackActive) {
	// Scaled migration constants
	const TYPE_1_COEFF = settings.planet_migration_type_1_coeff * 0.00000001;
	const TYPE_2_COEFF = settings.planet_migration_type_2_coeff * 0.00000001;
	const INNER_DISK_EDGE_AU = 0.04; // Inside boundary normalized to Solar units (AU☉)
	
	let migrationRate = 0;

	// Calculate base rates (negative indicates inward migration toward the star)
	const type1Rate = settings.planet_migration_type_1_enabled 
		? -TYPE_1_COEFF * diskDensity * planet.mass.value * timeStepYears 
		: 0;
		
	const type2Rate = settings.planet_migration_type_2_enabled 
		? -TYPE_2_COEFF * diskDensity * timeStepYears 
		: 0;

	if (planet.type !== 'Terrestrial' && isGrandTackActive) {
		// Outward hydrodynamic resonance movement for gas giants during Grand Tack phase
		migrationRate = -0.75 * type2Rate;
	}
	else {
		const MASS_THRESHOLD_TYPE_1 = 15; // Planets under 15 M⊕ are strictly Type I

		if (settings.planet_migration_interpolated) {
			const MASS_THRESHOLD_TYPE_2 = 120; // Planets over 120 M⊕ (~0.4 M♃) are strictly Type II
			
			const migrationTypeRatio = utils.clamp(
				planet.mass.value - MASS_THRESHOLD_TYPE_1, 
				0, 
				MASS_THRESHOLD_TYPE_2 - MASS_THRESHOLD_TYPE_1
			) / (MASS_THRESHOLD_TYPE_2 - MASS_THRESHOLD_TYPE_1);
			
			// Linear interpolation between migration regimes
			migrationRate = type1Rate * (1 - migrationTypeRatio) + type2Rate * migrationTypeRatio;
		}
		else {
			migrationRate = planet.mass.value <= MASS_THRESHOLD_TYPE_1 ? type1Rate : type2Rate;
		}
	}
	
	// Apply random physical perturbation and scale with stellar luminosity factor
	const stellarLuminosityFactor = Math.sqrt(planet.parentBody.luminosity);
	migrationRate *= prng.range(0.8, 1.2); 
	migrationRate *= stellarLuminosityFactor;
	
	planet.sma.value += migrationRate;
	
	// Establish structural inner boundary check to halt extreme inward migration
	const dynamicInnerEdge = planet.genData.sma_min + (INNER_DISK_EDGE_AU * stellarLuminosityFactor * utils.randomRangeGaussian(0.85, 1.15));
	planet.sma.value = utils.clamp(planet.sma.value, dynamicInnerEdge, planet.genData.sma_max);
}

/**
 * Calculates the mutual Hill sphere radius between two adjacent planetary bodies.
 * 
 * @param {types.Planet} planet1 - First planetary body.
 * @param {types.Planet} planet2 - Second planetary body.
 * @param {types.Star|types.BinaryStar} star - The host stellar system gravitational center.
 * 
 * @returns {types.Value} The mutual Hill radius (unit: types.units.Dist).
 */
function getMutualHillSphere(planet1, planet2, star) {
	const sma1Meters = planet1.sma.getValueAs(types.units.Dist.m);
	const sma2Meters = planet2.sma.getValueAs(types.units.Dist.m);
	const mass1Kg = planet1.mass.getValueAs(types.units.Mass.kg);
	const mass2Kg = planet2.mass.getValueAs(types.units.Mass.kg);
	const starMassKg = star.mass.getValueAs(types.units.Mass.kg);

	// Mass-weighted average semi-major axis
	//const weightedAverageSma = (sma1Meters * mass1Kg + sma2Meters * mass2Kg) / (mass1Kg + mass2Kg);
	const smaAverage = (sma1Meters + sma2Meters) / 2;
	const hillRadiusMeters = smaAverage * Math.pow((mass1Kg + mass2Kg) / (3 * starMassKg), 1 / 3);
	
	return new types.Value(hillRadiusMeters, types.units.Dist.m);
}

/**
 * Physically merges a companion planet (donor) into a target planet (recipient).
 * 
 * @param {types.Planet} recipient - The surviving planet absorbing the mass.
 * @param {types.Planet} donor - The consumed planet being destroyed.
 */
function mergePlanets(recipient, donor) {
	const totalMass = recipient.mass.value + donor.mass.value;
	
	// Conservation of momentum approximation for Semi-Major Axis
	recipient.sma.value = (recipient.sma.value * recipient.mass.value + donor.sma.value * donor.mass.value) / totalMass;
	recipient.mass.value = totalMass;
	recipient.genData.impacts += donor.genData.impacts + 1;

	// --- Core Composition Merge ---
	recipient.core.mass.convertUnitTo(types.units.Mass.M_Earth);
	donor.core.mass.convertUnitTo(types.units.Mass.M_Earth);

	const recipientCoreMass = recipient.core.mass.value;
	const donorCoreMass = donor.core.mass.value;

	recipient.core.mass.value += donorCoreMass;
	
	recipient.core.composition.iron = (recipient.core.composition.iron * recipientCoreMass + donor.core.composition.iron * donorCoreMass) / recipient.core.mass.value;
	recipient.core.composition.rock = (recipient.core.composition.rock * recipientCoreMass + donor.core.composition.rock * donorCoreMass) / recipient.core.mass.value;
	recipient.core.composition.ice = (recipient.core.composition.ice * recipientCoreMass + donor.core.composition.ice * donorCoreMass) / recipient.core.mass.value;

	// --- Volatile Envelope Merge ---
	recipient.envelope.mass.convertUnitTo(types.units.Mass.M_Earth);
	donor.envelope.mass.convertUnitTo(types.units.Mass.M_Earth);

	const recipientEnvMass = recipient.envelope.mass.value;
	const donorEnvMass = donor.envelope.mass.value;
	
	recipient.envelope.mass.value += donorEnvMass;

	if (recipient.envelope.mass.value > 0) {
		recipient.envelope.composition.gas = (recipient.envelope.composition.gas * recipientEnvMass + donor.envelope.composition.gas * donorEnvMass) / recipient.envelope.mass.value;
		recipient.envelope.composition.ice = (recipient.envelope.composition.ice * recipientEnvMass + donor.envelope.composition.ice * donorEnvMass) / recipient.envelope.mass.value;
	}
	else {
		recipient.envelope.composition.gas = 0;
		recipient.envelope.composition.ice = 0;
	}

	// --- Planet Taxonomy Taxonomy Re-evaluation ---
	if (recipient.envelope.mass.value === 0) {
		recipient.type = 'Terrestrial';
	}
	else {
		if (recipient.envelope.composition.gas > 0.8) {
			recipient.type = 'Gas Giant';
		}
		else {
			recipient.type = recipient.mass.value < 15.0 ? 'Mini-Neptune' : 'Ice Giant';
		}
	}

	// --- Purge Donor Status ---
	donor.genData.status = 'Merged';
	donor.sma = new types.Value(Infinity, types.units.Dist.AU);
}

/**
 * Resolves close gravitational encounters, leading to mergers, ejections, or orbital shifts.
 * 
 * @param {types.GenerationSettings} settings - Context generation configuration.
 * @param {types.Planet} planet - The primary interacting planet.
 * @param {types.Planet} nextPlanet - The adjacent encountering planet.
 * @param {types.Star|types.BinaryStar} star - Host center of gravity.
 * @param {boolean} isFinalStep - True if this is the final discrete simulation step.
 */
function resolveCloseEncounter(settings, planet, nextPlanet, star, isFinalStep) {
	const mutualHillSphere = getMutualHillSphere(planet, nextPlanet, star);
	const orbitalDistanceAU = Math.abs(planet.sma.getValueAs(types.units.Dist.AU) - nextPlanet.sma.getValueAs(types.units.Dist.AU));
	const safetyThresholdAU = mutualHillSphere.getValueAs(types.units.Dist.AU) * settings.planet_migration_hill_safety_factor;
	
	if (orbitalDistanceAU < safetyThresholdAU) {
		const massRatio = planet.mass.getValueAs(types.units.Mass.M_Earth) / nextPlanet.mass.getValueAs(types.units.Mass.M_Earth);
		const outcomeRoll = prng();
		
		const OUTCOME_MERGE = 'merge';
		const OUTCOME_EJECT = 'eject';
		const OUTCOME_SHIFT = 'shift';
		let determinedOutcome = OUTCOME_SHIFT;

		if (!isFinalStep) {
			if		(outcomeRoll < 0.3)	determinedOutcome = OUTCOME_MERGE; // 30% Merging
			else if (outcomeRoll < 0.5) determinedOutcome = OUTCOME_EJECT; // 20% Ejection
			else						determinedOutcome = OUTCOME_SHIFT; // 50% Scattering
		}
		else {
			// Forced catastrophic finalization on the last step to ensure long-term system stability
			determinedOutcome = outcomeRoll < 0.5 ? OUTCOME_MERGE : OUTCOME_EJECT;
		}

		switch (determinedOutcome) {
			case OUTCOME_MERGE:
				mergePlanets(planet, nextPlanet);
				break;

			case OUTCOME_EJECT:
				if (massRatio < 1) {
					// Recipient is lighter: 'planet' gets ejected, 'nextPlanet' undergoes a minor compensatory shift
					if (!isFinalStep) {
						nextPlanet.sma.value *= prng.range(Math.pow(0.9, massRatio), Math.pow(1.1, massRatio)); 
					}
					else {
						nextPlanet.sma.value = prng.range(planet.sma.value, nextPlanet.sma.value);
					}
					planet.genData.status = 'Ejected';
					planet.sma = new types.Value(Infinity, types.units.Dist.AU);
						
				} else {
					// Recipient is heavier: 'nextPlanet' gets ejected, 'planet' shifts
					if (!isFinalStep) {
						planet.sma.value *= prng.range(Math.pow(0.9, 1 / massRatio), Math.pow(1.1, 1 / massRatio)); 
					}
					else {
						planet.sma.value = prng.range(planet.sma.value, nextPlanet.sma.value);
					}
					nextPlanet.genData.status = 'Ejected';
					nextPlanet.sma = new types.Value(Infinity, types.units.Dist.AU);
				}
				break;

			case OUTCOME_SHIFT:
				// Orbital scattering dynamics based on mass ratios
				if (massRatio < 1) {
					planet.sma.value *= prng.range(Math.pow(0.7, 1 - massRatio), Math.pow(1.3, 1 - massRatio));
					nextPlanet.sma.value *= prng.range(Math.pow(0.7, massRatio), Math.pow(1.3, massRatio));
				}
				else {
					planet.sma.value *= prng.range(Math.pow(0.7, 1 / massRatio), Math.pow(1.3, 1 / massRatio));
					nextPlanet.sma.value *= prng.range(Math.pow(0.7, 1 - (1 / massRatio)), Math.pow(1.3, 1 - (1 / massRatio)));
				}
				break;
		}
	}
}

/**
 * Simulates multi-body planetary migration and dynamic scattering within a decaying protoplanetary gas disk.
 * Modifies orbits, handles planetary collisions, and ejects unstable bodies.
 * 
 * @param {types.GenerationSettings} settings - Generation settings configuration.
 * @param {Array<types.Star|types.BinaryStar>} starsArray - List of tracking stars in the generated cluster.
 */
export function simulateMigration(settings, starsArray) {
	// --- 1. Unit Standardization ---
	starsArray.forEach(star => { 
		star.bodies.forEach(body => { 
			if (body instanceof types.Planet) {
				body.sma.convertUnitTo(types.units.Dist.AU);
				body.mass.convertUnitTo(types.units.Mass.M_Earth);
			}
		}); 
	});

	// --- 2. Protoplanetary Disk Parameters Configuration ---
	const TIME_STEP_YEARS = 10000; // Δt step size
	const diskLifetimeYears = new types.Value(5, types.units.Time.My).getValueAs(types.units.Time.y); // 5 Myr lifespan
	const totalDiscreteSteps = Math.round(diskLifetimeYears / TIME_STEP_YEARS);
	
	// --- 3. Discrete Migration Simulation Engine ---
	starsArray.forEach(star => {
		// Base disk gas density scaled by metallicity and natural variance
		const initialDiskDensity = 1 * Math.pow(10, star.metallicity * 0.2) * Math.pow(10, utils.randomRangeGaussian(-0.5, 0.5));
		
		let activeGiantsCount = 0;
		let isGrandTackTriggered = false;

		for (let step = 0; step < totalDiscreteSteps; step++) {
			// Exponential disk gas dispersion model over time
			const currentDiskDensity = initialDiskDensity * Math.exp(-step / totalDiscreteSteps);
			activeGiantsCount = 0; 

			for (let i = 0; i < star.bodies.length; i++) {
				const planet = star.bodies[i];

				if (!(planet instanceof types.Planet)) continue;
				if (planet.genData.status === 'Ejected' || planet.genData.status === 'Merged') continue;

				// 3.1. Compute and Apply Disk Forces
				applyMigration(settings, planet, currentDiskDensity, TIME_STEP_YEARS, isGrandTackTriggered);

				// 3.2. Proximity Encounter Validation & Resolution
				if (i !== (star.bodies.length - 1)) {
					let validNextPlanet = null;
					
					for (let n = i + 1; n < star.bodies.length; n++) {
						const candidatePlanet = star.bodies[n];

						if (!(candidatePlanet instanceof types.Planet)) continue;
						if (candidatePlanet.genData.status === 'Ejected' || candidatePlanet.genData.status === 'Merged') continue;

						validNextPlanet = candidatePlanet;
						break;
					}

					if (validNextPlanet !== null) {
						const isLastSimulationStep = (step === totalDiscreteSteps - 1);
						resolveCloseEncounter(settings, planet, validNextPlanet, star, isLastSimulationStep);
					}
				}
				
				// 3.3. Track active gas giants
				if (planet.genData.status === '' && planet.type === 'Gas Giant') {
					activeGiantsCount++;
				}
			}

			// 3.4. Evaluate Grand Tack Resonance Constraints
			if (settings.planet_migration_grand_tack_enabled && !isGrandTackTriggered) {
				if (activeGiantsCount >= 2 && step >= (totalDiscreteSteps / 2)) {
					isGrandTackTriggered = true;
				}
			}

			// 3.5. Re-index and Sort System Orbits by Distance Post-Step
			star.bodies.sort((bodyA, bodyB) => {
				const distanceA = bodyA.sma.getValueAs(types.units.Dist.m);
				const distanceB = bodyB.sma.getValueAs(types.units.Dist.m);
				return distanceA - distanceB;
			}); 
		}
	});

	// --- 4. Post-Simulation Pipeline & Data Refactoring ---
	starsArray.forEach(star => {
		// 4.1. Purge Discarded/Ejected Bodies from Arrays
		for (let i = star.bodies.length - 1; i >= 0; i--) {
			if (star.bodies[i] instanceof types.Planet && star.bodies[i].genData.status !== '') {
				star.bodies.splice(i, 1);
			}
		}

		// 4.2. Recalculate Relative Orbital Neighbors
		for (let i = 0; i < star.bodies.length; i++) {
			if (!(star.bodies[i] instanceof types.Planet)) continue;

			star.bodies[i].genData.neighborPrev = i > 0 ? star.bodies[i - 1] : null;
			star.bodies[i].genData.neighborNext = i < (star.bodies.length - 1) ? star.bodies[i + 1] : null;
		}
	});
}
