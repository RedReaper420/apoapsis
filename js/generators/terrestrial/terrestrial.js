
import * as T from "../../data/types.js";

import * as ocean from "./ocean.js";
import * as atmosphere from "./atmosphere.js";

/**
 * Calculates maximal mountain height for a planet.
 * @param {T.Planet} planet 
 * @returns {T.Value} (unit: `Dist`)
 */
export function calculateMountainHeight(planet) {
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
 * Assumes the planet's albedo based on the planet's composition and blackbody temperature.
 * @param {T.Planet} planet 
 * @returns
 */
export function assumeAlbedo(planet) {
	const temp = planet.temperature_bb.as(T.units.Temp.K);
	
	const f_iron = planet.core.composition.iron;
	const f_rock = planet.core.composition.rock;
	const f_mat = f_iron + f_rock;
	
	const rockAlbedo = 0.1 * (f_iron / f_mat) + 0.2 * (f_rock / f_mat);

	const f_ice = planet.core.composition.ice;
	const iceToWaterRegime = 1 / (1 + Math.exp(0.2 * (temp - 130)));
	const iceAlbedo = (f_ice ** (1/6)) * ( (0.7 * iceToWaterRegime) + (0.3 * (1 - iceToWaterRegime)) );

	return rockAlbedo + iceAlbedo;
}


/**
 * Calculates planet's albedo based on its surface and atmosphere properties.
 * @param {T.Planet} planet 
 */
export function calculateAlbedo(planet) {
	if (planet.type !== T.planetTypes.Terrestrial)
		return planet.albedo;

	const f_iron = planet.core.composition.iron;
	const f_rock = planet.core.composition.rock;
	const f_mat = f_iron + f_rock;

	const albedo_land = 0.1 * (f_iron / f_mat) + 0.2 * (f_rock / f_mat);
	
	const liqConfig = {
		lava: 0.04,
		water: 0.06,
		methane: 0.02,
		ammonia: 0.05,
	};

	let albedo_ocean = 0;
	for (const liq in liqConfig) {
		const ocean = planet.ocean.toLowerCase();
		if (ocean.includes(liq)) {
			albedo_ocean += ocean.includes('frozen') ? 0.7 : liqConfig[liq];
			break;
		}
	}

	const albedo_surface = albedo_land * (1 - planet.oceanCover) + albedo_ocean * planet.oceanCover;

	const gasConfig = {
		H2O: 0.65,
		CH4: 0.35,
		NH3: 0.55,
		SO2: 0.85,
		SiO2: 0.5,
	};

	let albedo_atmosphere_comp = 0;
	for (const [gas, fraction] of Object.entries(planet.atmosphere.composition)) {
		const albedo = gasConfig[gas];
		if (!albedo || fraction <= 0) continue;
		
		albedo_atmosphere_comp += albedo * Math.pow(fraction, 1/3);
	}
	albedo_atmosphere_comp = Math.min(0.8, albedo_atmosphere_comp) + Math.pow(Math.max(0, albedo_atmosphere_comp - 0.8), 3);
	const albedo_atmosphere_press = 0.5 * (1 - Math.exp(-0.05 * planet.atmosphere.pressure.as(T.units.Press.atm)));
	const albedo_atmosphere = Math.max(albedo_atmosphere_comp, albedo_atmosphere_press);

	const albedo = albedo_atmosphere + Math.pow(1 - albedo_atmosphere, 2) * albedo_surface;
	return albedo;
}

/**
 * Gets surface color for a terrestrial planet.
 * @param {T.Planet} planet 
 */
export function getColor(planet) {
	const metallicity = planet.core.composition.iron / (1 - planet.core.composition.ice);

	const red 	= Math.floor(65 + 90 * (1 - metallicity));
	const green = Math.floor(55 + 80 * (1 - metallicity));
	const blue 	= Math.floor(45 + 70 * (1 - metallicity));
	
	const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
	return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * @see {@link atmosphere.generateAtmosphere}
 * @param {T.Planet} planet 
 */
export function generateAtmosphere(planet) {
	atmosphere.generateAtmosphere(planet);
}

/**
 * @see {@link atmosphere.setSurfaceTemperature}
 * @param {T.Planet} planet 
 */
export function setSurfaceTemperature(planet) {
	return atmosphere.setSurfaceTemperature(planet);
}

/**
 * @see {@link ocean.setOcean}
 * @param {T.Planet} planet 
 */
export function setOcean(planet) {
	ocean.setOcean(planet);
}
