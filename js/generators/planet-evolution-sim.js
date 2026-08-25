
import * as utils from "../utils/utils.js";
import * as T from "../data/types.js";
import consts from "../data/consts.js";

export class PlanetEvolution {
	/**
	 * An object that models planet's evolution. Modeled properties:
	 * - Rotation (tidal locking with the parent body)
	 * - Magnetosphere (modeling from planet's composition and internal heat)
	 * - Atmosphere (dissipation by solar wind and radiation)
	 * 
	 * @param {T.GenerationSettings} settings 
	 * @param {T.Planet} planet 
	 */
	constructor (settings, planet) {
		this.settings = settings;
		this.planet = planet;

		this.rotationManager = new RotationManager(this);
		this.solarManager = new SolarManager(this);
		this.magnetManager = new MagnetManager(this);
		this.dissipationManager = new DissipationManager(this);
	}

	doTheEvolution() {
		let d_t = 1e4;
		let t = d_t;
		const t_target = this.planet.age.as(T.units.Time.y);

		while (t < t_target) {
			this.rotationManager.setRotationTime(t);
			this.solarManager.calculateSolarActivity(t);
			this.magnetManager.setMagneticField(t);
			this.dissipationManager.dissipateAtmosphere(d_t, t);
			
			// Floating (increasing) timestep
			d_t *= 1.05; 
			d_t = Math.round(d_t);

			t += d_t;
		}

		this.dissipationManager.applyStripping();
	}
}

class RotationManager {
	/**
	 * Module that calculates tidal locking.
	 * 
	 * @param {PlanetEvolution} evo
	 */
	constructor (evo) {
		this.evo = evo;

		this.planet = evo.planet;

		let parent = this.planet.parentBody;
		if (parent instanceof T.BinaryPlanet) {
			if (this.planet.parentBody.primary === this.planet)
				parent = this.planet.parentBody.secondary;
			else if (this.planet.parentBody.secondary === this.planet)
				parent = this.planet.parentBody.primary;
		}

		this.tidalLockTime_s = getTidalLockTime(this.planet, parent).as(T.units.Time.s);
		this.targetRotationPeriod_s = getTidalLockRotationPeriod(this.planet, parent).as(T.units.Time.s);
		this.targetOmega = 2 * Math.PI / this.targetRotationPeriod_s;

		this.planet.tidalLockIn = new T.Value(0, T.units.Time.s);
	}

	/**
	 * Calculates and sets the rotation of a planet at the specified age.
	 * 
	 * @param {number} t - Planet's age in years.
	 */
	setRotationTime(t) {
		const age_s = new T.Value(t, T.units.Time.y).as(T.units.Time.s);
		const ageToTLRatio = Math.min(1, age_s / this.tidalLockTime_s);
		const interpolationFactor = 1 - Math.pow(1 - ageToTLRatio, 2);
		
		const currentRotationPeriod_s = this.planet.rotationPeriod.as(T.units.Time.s);
		let currentOmega = 2 * Math.PI / currentRotationPeriod_s;
		if (this.planet.isRotationRetrograde) currentOmega = -currentOmega;

		const adjustedOmega = currentOmega * (1 - interpolationFactor) + this.targetOmega * interpolationFactor;

		if (ageToTLRatio === 1.0) {
			this.planet.isTidallyLocked = true;
			this.planet.isRotationRetrograde = false;
			this.planet.rotationPeriod = new T.Value(this.targetRotationPeriod_s, T.units.Time.s);
		}
		else {
			this.planet.isTidallyLocked = false;

			if (adjustedOmega < 0) {
				this.planet.isRotationRetrograde = true;
				const newPeriod_s = 2 * Math.PI / Math.abs(adjustedOmega);
				this.planet.rotationPeriod = new T.Value(newPeriod_s, T.units.Time.s);
			}
			else if (adjustedOmega > 0) {
				this.planet.isRotationRetrograde = false;
				const newPeriod_s = 2 * Math.PI / adjustedOmega;
				this.planet.rotationPeriod = new T.Value(newPeriod_s, T.units.Time.s);
			}
			else {
				this.planet.rotationPeriod = new T.Value(Infinity, T.units.Time.s);
				/*
				planet.isRotationRetrograde = false;
				planet.rotationPeriod = new T.Value(100000, T.units.Time.h);
				*/
			}
		}

		this.planet.tidalLockIn.value = this.tidalLockTime_s * (1 - ageToTLRatio);
	}
}

/**
 * Calculates planet's tidal lock time.
 * 
 * @param {T.Planet} planet - Current planet
 * @param {T.Planet|T.BinaryPlanet|T.Star|T.BinaryStar} parent - Planet's parent body (star or binary companion)
 * 
 * @returns {T.Value} Approximate tidal lock time (unit: Time)
 */
function getTidalLockTime(planet, parent) {
	const m_s = planet.mass.as(T.units.Mass.kg); // Satellite's mass
	const m_p = parent.mass.as(T.units.Mass.kg); // Parent body's mass
	const R = planet.radius.as(T.units.Dist.m); // Satellite's radius

	const w = 2 * Math.PI / planet.rotationPeriod.as(T.units.Time.s); // Satellite's spin rate, rad/s
	const a = planet.sma.as(T.units.Dist.m); // Satellite's SMA

	const I_factor = calculateMomentOfInertiaFactor(planet);
	const I = I_factor * m_s * (R**2); // Satellite's moment of inertia

	const Q = calculateTidalQ(planet); // Satellite's dissipation function value
	const k2 = calculateLoveNumber(planet); // Satellite's tidal Love number 

	const t = (w * (a**6) * I * Q) / (3 * consts.PHY_G * (m_p**2) * k2 * (R**5)); // Approximate satellite's tidal locking time
	return new T.Value(t, T.units.Time.s);
}

/**
 * Calculates planet's moment of inertia factor.
 * 
 * @param {T.Planet} planet - Current planet
 * 
 * @returns {number} Moment of inertia factor (0.205-0.38)
 */
function calculateMomentOfInertiaFactor(planet) {
	const m_core = planet.core.mass.as(T.units.Mass.kg);
	const m_env = planet.envelope.mass.as(T.units.Mass.kg);
	const m_total = m_core + m_env;

	const f_env = m_env / m_total;
	
	const ironFraction = planet.core.composition.iron;
	const baseCoreFactor = 0.38 - (ironFraction * 0.07);

	if (f_env === 0) {
		return baseCoreFactor;
	}

	const targetGasFactor = 0.21;

	const i_factor = baseCoreFactor * (1 - f_env) + targetGasFactor * f_env;

	return Math.max(0.205, i_factor);
}

/**
 * Calculates planet's approximate dissipation function value (Q).
 * 
 * @param {T.Planet} planet - Current planet
 * 
 * @returns {number} Q value (\~50...\~100,000).
 */
export function calculateTidalQ(planet) {
	const m_core = planet.core.mass.as(T.units.Mass.kg);
	const m_env = planet.envelope.mass.as(T.units.Mass.kg);
	const m_total = m_core + m_env;
	
	const f_env = m_env / m_total;

	// 1. Bodies w/o envelope
	if (f_env === 0) {
		const iceFraction = planet.core.composition.ice;
		// Ice is more flexible under pressure than rock and dissipates energy more effectively (lower Q).
		return 100 * (1 - iceFraction) + 25 * iceFraction;
	}

	// 2. Mini-Neptunes / Puffy Super-Earths
	// Q starts to increase since the gas envelope partially absorbs the tidal wave.
	if (f_env < 0.5) {
		// A smooth transition from the Q of a rigid body (about 100) to that of a gaseous (about 10,000)
		return 100 * Math.pow(100, f_env / 0.5);
	}

	// 3. Ice Giants, Gas Giants, Brown Dwarfs
	// Jupiter's Q is estimated to be 10^5 - 10^6. Saturn's is even larger.
	// Brown dwarfs must have a huge Q value.
	const mass_M_Earth = planet.mass.as(T.units.Mass.M_Earth);
	
	if (mass_M_Earth > 400) { 
		// Super-Jupiters and Brown Dwarfs
		return 1e6 * (mass_M_Earth / 400); 
	} else {
		// Classic giant planets
		// Ice giants dissipate better than gas giants.
		const envIceFraction = planet.envelope.composition.ice;
		const baseGiantQ = 1e5;

		// Expected Q values for ice giants are ~30,000, for gas giants - ~100,000
		return baseGiantQ * (1 - envIceFraction * 0.7); 
	}
}

/**
 * Calculates planet's approximate Love number (k2).
 * 
 * @param {T.Planet} planet - Current planet
 * 
 * @returns {number} k2 value (<< 1).
 */
export function calculateLoveNumber(planet) {
	const totalMass = planet.mass.as(T.units.Mass.kg);
	const R = planet.radius.as(T.units.Dist.m); // Planets's radius

	const rho = planet.density * 1000; // Planets's density, kg/m^3
	const g = consts.PHY_G * totalMass / (R**2); // Planets's surface gravity

	const coreIce = planet.core.composition.ice * planet.core.mass.as(T.units.Mass.kg);
	const envIce = planet.envelope.composition.ice * planet.envelope.mass.as(T.units.Mass.kg);
	const totalIceFraction = (coreIce + envIce) / totalMass;
	const mu = 3e10 * (1 - totalIceFraction) + 4e9 * totalIceFraction; // Linear interpolation of satellite's rigidity ("rocky" and "icy" regimes)
	
	const k2 = 1.5 / (1 + ((19 * mu) / (2 * rho * g * R))); // Tidal Love number of the planet

	return k2;
}

/**
 * Calculates planet's rotation period at tidal lock.
 * 
 * @param {T.Planet} planet - Current planet
 * @param {T.Planet|T.BinaryPlanet|T.Star|T.BinaryStar} parent - Planet's parent body (star or binary companion)
 * 
 * @returns {T.Value} Rotation period at tidal lock (unit: Time)
 */
function getTidalLockRotationPeriod(planet, parent) {
	const m1 = planet.mass.as(T.units.Mass.kg);
	const m2 = parent.mass.as(T.units.Mass.kg);
	const a = planet.sma.as(T.units.Dist.m);

	// Rotation period = Orbital period
	const t = Math.sqrt( ((4 * (Math.PI**2)) / (consts.PHY_G * (m1 + m2))) * (a**3) );

	return new T.Value(t, T.units.Time.s);
}

class SolarManager {
	/**
	 * Module that calculates solar activity. Used for magnetosphere and atmosphere calculation.
	 * 
	 * @param {PlanetEvolution} evo 
	 */
	constructor (evo) {
		this.evo = evo;
		
		this.planet = evo.planet;

		this.distance_AU = this.planet.genData.sma_norm * Math.sqrt(this.planet.genData.parentStar.luminosity);

		this.star = this.planet.genData.parentStar;
		this.starTemperature = this.star.temperature.as(T.units.Temp.K);

		this.saturation = true;
		this.saturationTime_Gy = 0.01 + (5000 / Math.pow(this.starTemperature, 1.2));

		this.p_sw = 0;
		this.rho_sw = 1;
		this.L_XUV = 0;
	}

	calculateSolarActivity(t) {
		const starAge_Gy = new T.Value(t, T.units.Time.y).as(T.units.Time.Gy);

		this.saturation = starAge_Gy <= this.saturationTime_Gy;

		this.L_XUV = this.saturation === true
			? this.star.luminosity * 1e-3
			: this.star.luminosity * 1e-3 * Math.pow(starAge_Gy / this.saturationTime_Gy, -1.1);

		const base_density = 8.4e-21; // Base stellar wind density at 1 AU
		const v_sw = 400e3; // Stellar wind velocity
		const solarActivity = Math.min(10000, 1 + Math.pow(starAge_Gy / this.saturationTime_Gy, -1.1));

		this.rho_sw = (base_density * solarActivity) / (this.distance_AU**2); // Stellar wind density

		this.p_sw = this.rho_sw * (v_sw**2); // Stellar wind pressure
	}
}

import {getMaterialRadius} from './planet-gen.js';

class MagnetManager {
	/**
	 * Module that calculates magnetosphere.
	 * 
	 * @param {PlanetEvolution} evo 
	 */
	constructor (evo) {
		this.evo = evo;

		this.planet = evo.planet;

		this.mass_MEarth = this.planet.mass.as(T.units.Mass.M_Earth);
		this.mass_MJupiter = this.planet.mass.as(T.units.Mass.M_Jupiter);

		this.radius_m = this.planet.radius.as(T.units.Dist.m);
		this.planet.magnetosphereHistory = new Map();
		this.planet.magnetosphereLost = new T.Value(Infinity, T.units.Time.y);

		/*
		r_core		- Conducting core radius
		rho_core	- Core density
		f_ad		- Adiabatic flow
		k_tectonics - Core's thermal flow fraction (depends on the planet's geology)
		c			- Calibrating coefficient
		*/
		switch (this.planet.type) {
			case T.planetTypes.Terrestrial: {
				const coreMass_MEarth = this.planet.core.mass.as(T.units.Mass.M_Earth);
				const r_core_iron_REarth = getMaterialRadius(coreMass_MEarth * this.planet.core.composition.iron, 'iron');
				this.r_core = new T.Value(r_core_iron_REarth, T.units.Dist.R_Earth).as(T.units.Dist.m);
				this.rho_core = 7500;
				
				// No plate tectonics assumed (stagnant lid)
				this.k_tectonics = 0.08; 
				
				this.f_ad = 0.04;
				this.c = 20;
				
				break;
			}
			case T.planetTypes.MiniNeptune:
			case T.planetTypes.IceGiant:
			case T.planetTypes.GasDwarf: {
				// Rocky core radius to entire planet radius ratio is around 0.6 
				this.r_core = this.planet.core.radius.as(T.units.Dist.m);
				this.rho_core = 3500;

				// The dynamo occurs in the thin outer layer of the ionosphere,
				// which causes the field  to be strongly offset and non-dipolar.
				this.k_tectonics = 0.3;

				this.f_ad = 0.05;
				this.c = 25;
				
				break;
			}
			case T.planetTypes.GasGiant:
			case T.planetTypes.BrownDwarf: {
				this.r_core = this.radius_m * Math.min(0.9, 0.7 + 0.15 * Math.log10(3 * this.mass_MJupiter + 1));
				this.rho_core = 4500;

				// Huge regions of metallic hydrogen, a powerful convective flow
				this.k_tectonics = 1.0;

				// Adiabatic flow is significantly higher due to the immense pressure
				// and high thermal conductivity of hydrogen.
				this.f_ad = 0.6;
				this.c = 30;
				
				break;
			}
		}

		// Distance from the star
		this.distance_AU = this.planet.genData.sma_norm * Math.sqrt(this.planet.genData.parentStar.luminosity);
	}

	setMagneticField(t) {
		this.planet.magneticField = this.calculatePlanetMagneticField(t);
		this.planet.magnetosphereRadius = this.calculateMagnetosphereRadius();
		this.planet.magnetosphereHistory.set(t, this.planet.magnetosphereRadius);
	}
	
	calculatePlanetMagneticField(t) {
		const planetAge_Gy = new T.Value(t, T.units.Time.y).as(T.units.Time.Gy);

		let q_total = 0; // Total thermal output of the planet
		if (this.mass_MEarth < 15) // Earth-like heat (scaled from 4.6*10^13 Wt)
			q_total = 4.6e13 * this.mass_MEarth * Math.pow(4.5 / planetAge_Gy, 0.5);
		else if (this.mass_MEarth < 45)
			q_total = ((4.6e13 * this.mass_MEarth * Math.pow(4.5 / planetAge_Gy, 0.5)) + 
					   (4.0e17 * Math.pow(this.mass_MJupiter, 1.5) * Math.pow(4.5 / planetAge_Gy, 0.5))) / 2;
		else if (this.mass_MEarth < consts.DEF_BROWN_DWARF_MASS_THRESHOLD) // Gas giant-like heat (Jupiter's is 4*10^17 Wt)
			q_total = 4.0e17 * Math.pow(this.mass_MJupiter, 1.5) * Math.pow(4.5 / planetAge_Gy, 0.5);
		else // Great primordial heat + deuterium fusion
			q_total = 4.0e17 * Math.pow(this.mass_MJupiter, 2.5) * Math.pow(1.0 / planetAge_Gy, 0.4);

		const q_core = q_total * this.k_tectonics; // Core's thermal output
		const area_core = 4 * Math.PI * (this.r_core**2);
		const f_total_core = q_core / area_core; // Core's total thermal flow

		const f_c = f_total_core - this.f_ad; // Convective thermal flow

		// Magnetic field generates if theres is a convective flow
		if (f_c <= 0) {
			// Fixating the moment of loss of the magnetic field
			if (this.planet.magnetosphereLost.value === Infinity)
				this.planet.magnetosphereLost.value = t;
			
			return 0; // 0 T
		}
		
		// Christensen formula for a magnetic field inside the core
		let b_core = this.c * Math.sqrt(consts.PHY_MU_0) * Math.pow(this.rho_core, 1/6) * Math.pow(f_c / this.r_core, 1/3);
		
		const rotationPeriod_h = Math.min(1000, this.planet.rotationPeriod.as(T.units.Time.h));
		b_core *= 1 + 1 / (0.2 * rotationPeriod_h);

		// Magnetic field scaled at planet's surface level
		const b_surf = b_core * Math.pow(this.r_core / this.radius_m, 3) * utils.randomRangeGaussian(0.8, 1.2);

		return b_surf; // T
	}
	
	calculateMagnetosphereRadius() {
		if (this.planet.magneticField === 0) {
			return new T.Value(this.planet.radius.value, this.planet.radius.unit);
		}

		const B_surf = this.planet.magneticField;
		
		const p_sw = this.evo.solarManager.p_sw; // Stellar wind pressure

		const f = 2.0; // Magnetic field compression coefficient
		
		const r_p_m = this.radius_m; // Planet radius
		const r_mp_m = Math.pow( ((f**2) * (B_surf**2)) / (2 * consts.PHY_MU_0 * p_sw) , 1/6) * r_p_m; // Magnetopause radius

		return new T.Value(Math.max(r_p_m, r_mp_m), T.units.Dist.m);
	}
}

class DissipationManager {
	/**
	 * Module that integtates atmosphere dissipation.
	 * 
	 * @param {PlanetEvolution} evo 
	 */
	constructor (evo) {
		this.evo = evo;

		this.planet = evo.planet;
		
		if (this.planet.type !== T.planetTypes.Terrestrial)
			return;
		
		this.planetMass_ME = this.planet.mass.as(T.units.Mass.M_Earth);
		this.planetMass_kg = this.planet.mass.as(T.units.Mass.kg);
		this.planetRadius_RE = this.planet.radius.as(T.units.Dist.R_Earth);
		this.planetRadius_m = this.planet.radius.as(T.units.Dist.m);
		
		this.v_esc = consts.PHY_EARTH_ESCAPE_VELOCITY * Math.sqrt(this.planetMass_ME / this.planetRadius_RE);

		const atmosphereMass_MEarthAtm = (this.planet.atmosphere.pressure) * (this.planetRadius_RE ** 4) / this.planetMass_ME;
		this.atmosphereMass_kg = new T.Value(atmosphereMass_MEarthAtm, T.units.Mass.M_Earth_atm).as(T.units.Mass.kg);
		this.atmosphereMass_init_kg = this.atmosphereMass_kg;

		this.atmosphere = {};
		for (const gas in this.planet.atmosphere.composition)
			this.atmosphere[gas] = this.planet.atmosphere.composition[gas] * this.atmosphereMass_init_kg;

		this.distance_AU = this.planet.genData.sma_norm * Math.sqrt(this.planet.genData.parentStar.luminosity);
		this.distance_m = new T.Value(this.distance_AU, T.units.Dist.AU).as(T.units.Dist.m);
	}

	dissipateAtmosphere(d_t, t) {
		if (this.planet.type !== T.planetTypes.Terrestrial)
			return;

		if (this.atmosphereMass_init_kg === 0)
			return;

		// Hydrostatic escape
		const eps = 0.10;
		const R_p = this.planetRadius_m;
		const M_p = this.planetMass_kg;
		const M_thermal = (eps * this.evo.solarManager.L_XUV * (R_p**3)) / (4 * consts.PHY_G * M_p * this.distance_m);

		// Solar wind stripping
		const eta = 0.005;
		const P_sw = this.evo.solarManager.p_sw;
		const M_wind = eta * ((P_sw * Math.PI * (R_p**2)) / (this.v_esc**2));

		let parentMagneticField = 0;
		if ((this.planet.parentBody instanceof T.Planet) ||
			(this.planet.parentBody instanceof T.BinaryPlanet)) {
			if (this.planet.parentBody instanceof T.BinaryPlanet) {
				if (this.planet === this.planet.parentBody.primary) {
					//parentMagneticField = this.planet.parentBody.secondary.magnetosphereHistory.get(T).as(T.units.Dist.m) - this.planet.sma.as(T.units.Dist.m);
					parentMagneticField = 0;
				}
				else if (this.planet === this.planet.parentBody.secondary) {
					parentMagneticField = this.planet.parentBody.primary.magnetosphereHistory.get(t).as(T.units.Dist.m) - this.planet.sma.as(T.units.Dist.m);
				}
				else {
					parentMagneticField = Math.max(
						this.planet.parentBody.primary.magnetosphereHistory.get(t).as(T.units.Dist.m) - this.planet.sma.as(T.units.Dist.m),
						this.planet.parentBody.secondary.magnetosphereHistory.get(t).as(T.units.Dist.m) - this.planet.sma.as(T.units.Dist.m)
					);
				}
			}
			else {
				parentMagneticField = this.planet.parentBody.magnetosphereHistory.get(t).as(T.units.Dist.m) - this.planet.sma.as(T.units.Dist.m);
			}
		}
		parentMagneticField = Math.max(0, parentMagneticField);

		const magnetopauseRatio = Math.max(
			this.planet.magnetosphereRadius.as(T.units.Dist.m) / R_p,
			parentMagneticField / R_p
		);
		const f_mag = utils.clamp(Math.exp(-(magnetopauseRatio - 1.2)), 0.01, 1);

		// Applying hydrostatic escape and solar wind stripping
		const years_to_seconds = 365.25 * 24 * 60 * 60;
		const M_loss = (M_thermal + f_mag * M_wind) * d_t * years_to_seconds;
		this.atmosphereMass_kg -= M_loss;
	}

	applyStripping() {
		if (this.planet.type !== T.planetTypes.Terrestrial)
			return;

		if (this.atmosphereMass_init_kg === 0)
			return;

		this.atmosphereMass_kg = Math.max(0, this.atmosphereMass_kg);

		if (this.atmosphereMass_kg === 0) {
			this.planet.atmosphere = {
				composition: {},
				pressure: 0,
				scaleHeight: 0,
				mu: 0,
			}
			this.planet.atmosphere.composition = {};
			this.planet.temperature = new T.Value(this.planet.temperature_eff.value, this.planet.temperature_eff.unit);

			return;
		}

		const atmosphereMass = new T.Value(this.atmosphereMass_kg, T.units.Mass.kg).as(T.units.Mass.M_Earth_atm);
		const P_surf = (atmosphereMass * this.planetMass_ME) / (this.planetRadius_RE**4);
		this.planet.atmosphere.pressure = P_surf;
		
		const T_eff = this.planet.temperature_eff.as(T.units.Temp.K);
		const T_surf = T_eff * (1 + 0.4 * Math.log10(1 + P_surf));
		this.planet.temperature = new T.Value(T_surf, T.units.Temp.K);
	}
}
