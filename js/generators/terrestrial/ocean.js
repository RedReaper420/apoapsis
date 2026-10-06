
import prng from "../../utils/prng.js";
import * as utils from "../../utils/utils.js";
import * as T from "../../data/types.js";
import consts from "../../data/consts.js";

import * as atmosphere from "./atmosphere.js";

class OceanSubstance {
	constructor () {
		this.name = '';
		this.color = '#00000000';

		this.budget = 0;
		this.state = '';

		this.substance = '';
		this.density = new T.Value(1.0, T.units.Dens.g_cm3);
		this.bulk = new T.Value(1, T.units.Press.Pa);

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			const pressure = planet.atmosphere.pressure.as(T.units.Press.Pa);
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

		this.density = new T.Value(2.2, T.units.Dens.g_cm3);
		this.bulk = new T.Value(3e9, T.units.Press.Pa);

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			this.state = temp >= 1000 ? 'LIQUID' : 'SOLID';
			this.color = planet.glowColor.slice(0, planet.glowColor.length-2); // Glowing color w/o specified alpha (full alpha)
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
		this.density = new T.Value(1.025, T.units.Dens.g_cm3);
		this.bulk = new T.Value(2.2e9, T.units.Press.Pa);

		this.calculateBudget = (planet) => {
			if (((this.state === 'SOLID') || (this.state === 'LIQUID')) === false) {
				this.budget = 0;
				return;
			}

			// Ocean gets boiled and photoevaporated (H2 flies away, O reacts with Fe in land)
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
		this.density = new T.Value(0.423, T.units.Dens.g_cm3);
		this.bulk = new T.Value(1.3e8, T.units.Press.Pa);

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
		this.density = new T.Value(0.89, T.units.Dens.g_cm3);
		this.bulk = new T.Value(11e9, T.units.Press.Pa);

		this.calculateState = (planet) => {
			const temp = planet.temperature.as(T.units.Temp.K);
			const pressure = planet.atmosphere.pressure.as(T.units.Press.Pa);

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
 * Calculates liquids states and sets up an ocean for a planet.
 * @param {T.Planet} planet 
 */
export function setOcean(planet) {
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
			const p = planet.atmosphere.pressure.as(T.units.Press.Pa) * (planet.atmosphere.composition[maxSubstance.substance] || 0);
			const pSat = getVaporPressure(SUBSTANCES[maxSubstance.substance], t);

			if (pSat >= p)
				atmosphere.enrichAtmosphere(planet, maxSubstance.substance, pSat);
			else
				break;
		}

		const t = planet.temperature.as(T.units.Temp.K);
		const p = planet.atmosphere.pressure.as(T.units.Press.Pa);
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
	}
	else {
		// Getting frozen/subsurface ocean

		let hasFrozenOcean = false;
		// A planet must be cold enough, otherwise its ice will sublimate too quickly, 
		// leaving no ice at the surface in geological time.
		// --- CONDITION DISABLED: post-GOE cooled planets are turning into deserts instead of snowballs ---
		//if ((planet.temperature.as(T.units.Temp.K) <= 150)) {
			for (const substance in oceanSubstances) {
				if (oceanSubstances[substance].budget < maxSubstance.budget)
					maxSubstance = oceanSubstances[substance];
			}

			if (maxSubstance.budget < 0)
				hasFrozenOcean = true;
		//}

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
 * Calculate ocean depth based on planet's and ocean substance physical properties.
 * @param {T.Planet} planet 
 * @param {OceanSubstance} substance 
 * @returns (Unit: `Dist`)
 */
function calculateOceanDepth(planet, substance) {
	const M = planet.mass.as(T.units.Mass.kg);
	const R = planet.radius.as(T.units.Dist.m);
	const g = planet.g.as(T.units.Acc.m_s2);

	const f = substance.budget;
	const rho = substance.density.as(T.units.Dens.kg_m3);
	const K = substance.bulk.as(T.units.Press.Pa);

	const V = (M * f) / rho;
	const H = V / (4 * Math.PI * (R ** 2))
	const H_compr = H * (1 - (H * g / (2 * K)));

	return new T.Value(H_compr, T.units.Dist.m);
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
