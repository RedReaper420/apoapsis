
import prng from "../../utils/prng.js";
import * as utils from "../../utils/utils.js";
import * as T from "../../data/types.js";
import consts from "../../data/consts.js";

/**
 * Sets up initial atmosphere and surface temperature for a planet.
 * @param {T.Planet} planet 
 */
export function generateAtmosphere(planet) {
	const planetMass_MEarth = planet.mass.as(T.units.Mass.M_Earth);
	const planetRadius_REarth = planet.radius.as(T.units.Dist.R_Earth);

	const F_tidal = planet.F_tidal.total;
	const T_eff = planet.temperature_eff.as(T.units.Temp.K);

	/*
	K_ret < 0.2: Planet can't hold even heavy gases
	0.2 <= K_ret < 0.6: Thin atmosphere
	0.6 <= K_ret < 2.5: Thick atmosphere
	K_ret >= 2.5: Planet can hold hydrogen and helium
	*/
	const K_ret = (planetMass_MEarth / planetRadius_REarth) / ((T_eff / consts.PHY_EARTH_TEMP_SURF) ** 1.5);

	if (K_ret < 0.2) {
		planet.atmosphere = {
			pressure: new T.Value(0, T.units.Press.Pa),
			mass: new T.Value(0, T.units.Mass.kg),
			scaleHeight: new T.Value(0, T.units.Dist.m),
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

	const P_base = (f_ice * 1.0) + (f_rock * 0.1) + (f_iron * 0.01);

	const f_ret = utils.clamp( (K_ret - 0.20) / 0.60 , 0.0, 10.0) ** 2;
	const g_Earth = planetMass_MEarth / (planetRadius_REarth ** 2);
	const tidalOutgassing = 1.0 + Math.min(F_tidal / 0.5, 50.0);
	const randPress = Math.pow(10, utils.clamp( utils.gaussianRandom(0, 0.5) , -1, 1));
	const distFactor = planet.genData.sma_norm > 1 ? 1 / Math.sqrt(planet.genData.sma_norm) : 1;
	const tempFactor = 1 + ((T_eff / 1000) ** 3);

	const P_surf_raw = P_base * f_ret * g_Earth * tidalOutgassing * randPress * distFactor * tempFactor;

	const dampeningThreshold = 200 * Math.exp(-5 * planetMass_MEarth);
	const P_dampened = P_surf_raw >= dampeningThreshold
		? dampeningThreshold + Math.pow(P_surf_raw - dampeningThreshold, 0.75)
		: P_surf_raw;
	const dampeningFactor = Math.min(1, (planetMass_MEarth / 10) ** 3);

	const P_surf = P_surf_raw * dampeningFactor + P_dampened * (1 - dampeningFactor);
	const P = new T.Value(P_surf, T.units.Press.atm);

	const T_surf = T_eff * (1 + 0.4 * Math.log10(1 + P_surf));
	planet.temperature = new T.Value(T_surf, T.units.Temp.K);
	
	let compositionRaw = {};
	if (T_surf > 1200) {
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
	
	if ((F_tidal > 0.5) && (f_ice < 0.05)) {
		const tidalMult = 1 + (F_tidal -1) / F_tidal;
		compositionRaw.SO2 = (compositionRaw.SO2 || 0) + prng.range(0.05, 0.15) * tidalMult;
		compositionRaw.CO2 = (compositionRaw.CO2 || 0) + prng.range(0.10, 0.30) * tidalMult;
		compositionRaw.H2O = (compositionRaw.H2O || 0) + prng.range(0.01, 0.05) * tidalMult;
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

	const H = calculateScaleHeight(T_surf, g_Earth * consts.PHY_EARTH_G, mu);
	
	const A = 4 * Math.PI * (planet.radius.as(T.units.Dist.m) ** 2);
	const atmosphereMass = new T.Value(P.as(T.units.Press.Pa) * A / planet.g.as(T.units.Acc.m_s2), T.units.Mass.kg);

	planet.atmosphere = {
		pressure: P,
		mass: atmosphereMass,
		scaleHeight: H,
		composition: compositionFinal,
		mu: mu,
		cloudCover: 0,
	}
	
	setSurfaceTemperature(planet);
}


/**
 * Enriches planet's atmosphere with payload of 25% set substance's vapor, 25% CO2, and 50% N2, 
 * with mass increasing total atmosphere pressure by the set value.
 * @param {T.Planet} planet 
 * @param {string} substance 
 * @param {number} pressure 
 */
export function enrichAtmosphere(planet, substance, pressure) {
	const radius_RE = planet.radius.as(T.units.Dist.R_Earth);
	const mass_ME = planet.mass.as(T.units.Mass.M_Earth);
	const pressure_atm = new T.Value(pressure, T.units.Press.Pa).as(T.units.Press.atm);
	
	const payloadMass = pressure_atm * (radius_RE ** 4) / mass_ME;
	const massRatio = payloadMass / (planet.atmosphere.mass.as(T.units.Mass.M_Earth_atm) + payloadMass);
	
	const payload = { N2: 0.50, CO2: 0.25 };
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

	planet.atmosphere.pressure.convertTo(T.units.Press.atm);
	planet.atmosphere.pressure.value += pressure_atm;

	planet.atmosphere.mass.convertTo(T.units.Mass.M_Earth_atm);
	planet.atmosphere.mass.value += payloadMass;

	setSurfaceTemperature(planet);
}


/**
 * Calculates surface temperature using gray-atmosphere optical depth.
 * 
 * @param {T.Planet} planet 
 */
export function setSurfaceTemperature(planet) {
	const totalPressureAtm = planet.atmosphere.pressure.as(T.units.Press.atm);

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

	planet.temperature = new T.Value(T_surf, T.units.Temp.K);
}

export function normalizeComposition(composition) {
	let sum = 0;
	for (const gas in composition)
		sum += composition[gas];

	if (sum === 0)
		return composition;

	for (const gas in composition)
		composition[gas] = composition[gas] / sum;
	return composition;
}

export function calculateMeanMolarMass(composition) {
	let sum = 0;
	for (const gas in composition) sum += composition[gas] * consts.PHY_MOLAR_MASSES[gas];
	return sum;
}

/**
 * @param {number} T_surf 
 * @param {number} g_ms2 
 * @param {number} mu 
 * @returns 
 */
export function calculateScaleHeight(T_surf, g_ms2, mu) {
	if (mu === 0) return new T.Value(0, T.units.Dist.m);
	
	const H = (consts.PHY_R_GAS * T_surf) / ((mu / 1000) * g_ms2);

	return new T.Value(H, T.units.Dist.m);
}
