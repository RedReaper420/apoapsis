
import prng from "../../utils/prng.js";
import * as T from "../../data/types.js";

import * as terrestrial from "./terrestrial.js";
import * as atmosphere from "./atmosphere.js";

/**
 * Calculates life presense on a planet.
 * 
 * If post-prokaryotic life calculated and set, the planet's atmosphere will be transformed.
 * 
 * @param {T.Planet} planet 
 * @returns 
 */
export function calculateLife(planet, lifeChance) {
	let lifeLevel = 0; // 0: No life

	planet.lifeHistory = new Map();

	// Assumed no life in giant planets' atmospheres
	if (planet.type !== T.planetTypes.Terrestrial)
		return lifeLevel;

	const canHaveLife = prng() < lifeChance;
	if (!canHaveLife)
		return lifeLevel;

	// Life needs a solvent medium to emerge
	if ((planet.ocean === 'Dry') || (planet.ocean === 'Lava'))
		return lifeLevel;

	if (planet.oceanCover < 0.2)
		return lifeLevel;

	const depthRatio = (planet.oceanDepth.as(T.units.Dist.m) / (1 + planet.ocean.includes('frozen'))) / planet.radius.as(T.units.Dist.m);
	if (depthRatio < 1e-4)
		return lifeLevel;

	const planetAge = planet.age.as(T.units.Time.My);
	
	let timestamp = 0; // Similar to Earth chronology: 4500 Myr ago

	const hadean = 50 + 350 * Math.pow(planet.mass.as(T.units.Mass.M_Earth), 0.4) * prng.range(0.75, 1.25);
	timestamp += hadean; // Similar to Earth chronology: around 4100 Myr ago

	if (timestamp > planetAge)
		return lifeLevel;

	let expTime = 100; // Approximate time for the Earth-like abiogenesis emergence (in water)

	if (planet.ocean.includes('frozen')) expTime *= 5; // Isolation under the ice crust complicates life emergence
	if (planet.ocean.includes('Ammonia')) expTime *= 10; // Low temperatures, lower dielectric permeability
	if (planet.ocean.includes('Methane')) expTime *= 50; // Extremely low temperatures, even lower dielectric permeability
	
	// Reactions slow down exponentially with decreasing temperature. Deceleration ramps up around 200K
	expTime *= 1 / (1 - Math.exp(-1 * (0.015 ** 3) * (planet.temperature.as(T.units.Temp.K) ** 3)));

	const prebioticOrigin = Math.max(10, -expTime * Math.log(1 - prng()));
	timestamp += prebioticOrigin; // Similar to Earth chronology: around 4000 Myr ago

	if (timestamp > planetAge)
		return lifeLevel;

	lifeLevel++; // 1: Abiogenesis
	planet.lifeHistory.set('Abiogenesis', timestamp);

	expTime *= 2; // Prokaryotes expected emergence time is 200 Myr

	const prokaryoticOrigin = Math.max(20, -expTime * Math.log(1 - prng()));
	timestamp += prokaryoticOrigin; // Similar to Earth chronology: around 3800 Myr ago

	if (timestamp > planetAge)
		return lifeLevel;
	
	lifeLevel++; // 2: Prokaryotes
	planet.lifeHistory.set('Prokaryotic life', timestamp);

	// Assumed that ammonia- and methane-based life can't get more advanced than early prokaryotes
	if (planet.ocean.includes('Water') === false)
		return lifeLevel;

	// Assumed that subglacial life won't develop photosynthesis, thus, no complicated life forms
	if (planet.ocean.includes('frozen'))
		return lifeLevel;

	expTime *= 9; // Multicellular life emergence time is 1800 Myr

	const multicellularOrigin = Math.max(180, -expTime * Math.log(1 - prng()));
	
	let GOE_triggered = false;
	if ((timestamp + (multicellularOrigin * 5/6)) <= planetAge) {
		// Similar to Earth chronology: around 2300 Myr ago
		GOE_triggered = greatOxidationEvent(planet);
	}

	timestamp += multicellularOrigin; // Similar to Earth chronology: around 2000 Myr ago

	if (timestamp > planetAge)
		return lifeLevel;

	lifeLevel++; // 3: Multicellular life
	planet.lifeHistory.set('Multicellular life', timestamp);

	if (!GOE_triggered) {
		// No conditions for GOE -> life can't get even more complex
		return lifeLevel;
	}
	
	// Assumed that if a planet has turned into a snowball after the GOE, it will never ever melt the ice
	if (planet.ocean.includes('frozen'))
		return lifeLevel;

	expTime /= 1.2; // Cambrian explosion expected time is 1500 Myr

	const cambrianExplosion = Math.max(150, -expTime * Math.log(1 - prng()));
	timestamp += cambrianExplosion; // Similar to Earth chronology: around 500 Myr ago

	if (timestamp > planetAge)
		return lifeLevel;

	lifeLevel++; // 4: Complex life
	planet.lifeHistory.set('Complex life', timestamp);

	expTime /= 3; // Civilization emergence time is quicker than before, 500 Myr

	const civilizationOrigin = Math.max(50, -expTime * Math.log(1 - prng()));
	timestamp += civilizationOrigin;

	if (timestamp > planetAge)
		return lifeLevel;

	lifeLevel++; // 5: Civilization
	planet.lifeHistory.set('Civilization', timestamp);

	return lifeLevel;
}

/**
 * Attempts to convert the planet's atmosphere composition into Earth-like.
 * @param {T.Planet} planet 
 * @returns Event trigger status
 */
function greatOxidationEvent(planet) {
	const T_surf = planet.temperature.as(T.units.Temp.K);
	const P_surf = planet.atmosphere.pressure.as(T.units.Press.atm);
	const h2 = planet.atmosphere.composition['H2'] || 0;

	const isHabitableThermal = (273 <= T_surf) && (T_surf <= 340);
	const isHabitablePressure = (0.4 <= P_surf) && (P_surf <= 10.0);

	if (!(isHabitableThermal && isHabitablePressure && (h2 < 0.05)))
		return false;

	const currentComp = { ...planet.atmosphere.composition };

	// Convert CO2/CH4 pool into O2 via photosynthesis simulation
	const o2Target = prng.range(0.18, 0.24);

	// Nitrogenn re-balance
	currentComp['N2'] = ((currentComp['N2'] || 0) + prng.range(0.73, 0.80)) / 2;

	// Add Oxygen and re-balance
	currentComp['O2'] = o2Target;
	if (currentComp['CO2']) currentComp['CO2'] *= prng.range(0.002, 0.01); // CO2 drawdown
	if (currentComp['CH4']) currentComp['CH4'] *= prng.range(0.001, 0.005); // Methane oxidation

	planet.atmosphere.composition = atmosphere.normalizeComposition(currentComp);

	// Recalculate climate feedback
	terrestrial.setSurfaceTemperature(planet);
	terrestrial.setOcean(planet);
	planet.albedo = terrestrial.calculateAlbedo(planet);
	terrestrial.setSurfaceTemperature(planet);

	return true;
}
