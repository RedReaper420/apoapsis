
import prng from "../utils/prng.js";
import * as utils from "../utils/utils.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

import * as planetsystemgen from "./planetsystemgen.js";
import * as planetgen from "./planetgen.js";

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Star} star 
 * 
 * @returns {types.Value} (unit: types.units.Dist)
 */
function getHillSphere(planet, star) {
	const a = planet.sma.getValueAs(types.units.Dist.m);
	const mass_p = planet.mass.getValueAs(types.units.Mass.kg);
	const mass_s = star.mass.getValueAs(types.units.Mass.kg);

	const R_H = a * Math.pow(mass_p / (3 * mass_s), 1/3);
	return new types.Value(R_H, types.units.Dist.m);
}

/**
 * 
 * @param {types.Planet} planet 
 * @param {types.Planet} moon 
 * @returns {types.Value} (unit: types.units.Dist)
 */
function getRocheLimit(planet, moon) {
	const r_p = planet.radius.getValueAs(types.units.Dist.m);
	const rho_p = planet.density;
	const rho_m = moon.density;
	const R = 2.44 * r_p * Math.pow(rho_p / rho_m, 1/3);
	return new types.Value(R, types.units.Dist.m);
}

/**
 * 
 * @param {types.GenerationSettings} settings 
 * @param {types.Planet} planet 
 */
export function generateMoons(settings, planet) {
	if (planet.type === 'Terrestrial') {
		if (planet.genData.isMoon === true)
			return;
		console.log(planet.genData.impacts);
		// WIP for irregular moons
	}
	else {
		const giantFactor = Math.sqrt(0.4 * Math.log10(planet.mass.getValueAs(types.units.Mass.M_Earth)));
		let massBudget = planet.mass.getValueAs(types.units.Mass.M_Moon) * 10e-4 * giantFactor * utils.randomRangeGaussian(0.8, 1.2);
		const masses = [];
		const massThreshold = 0.1;
		while (massBudget > massThreshold) {
			const mass = massBudget * prng.range(0.3, 0.6);
			massBudget -= mass;
			masses.push(mass);
		}

		const distanceLimit = getHillSphere(planet, planet.parentBody).getValueAs(types.units.Dist.AU) * 0.3;
		const startDistance = planet.radius.getValueAs(types.units.Dist.AU) * 10**prng.range(0.25, 0.75);
		let sma = startDistance;
		for (const m in masses) {
			sma = planetsystemgen.tryToSkipOrbit(sma);
			if (sma > distanceLimit)
				break;
			
			const moon = planetgen.generatePlanet(
				settings, planet, 
				new types.Value(sma, types.units.Dist.AU), 
				{ 
					mass: new types.Value(masses[m], types.units.Mass.M_Moon),
					retrograde: sma >= distanceLimit * 0.5 ? prng() < 0.2 : false,
				}
			);
			planet.bodies.push(moon);
	
			sma = planetsystemgen.getNextOrbit(sma);
		}
		
		for (let moonId = planet.bodies.length-1; moonId >= 0; moonId--) {
			const moon = planet.bodies[moonId];
			const rocheLimit = getRocheLimit(planet, moon);
			if (moon.sma.getValueAs(types.units.Dist.km) <= rocheLimit.getValueAs(types.units.Dist.km)) {
				planet.rings.push(new types.RingSystem(
					new types.Value(planet.radius.value * 1.5, planet.radius.unit), 
					rocheLimit, 
					moon.mass, 
					moon.core.composition.ice
				));
				planet.bodies.splice(moonId, 1);
			}
		}
	}
}
