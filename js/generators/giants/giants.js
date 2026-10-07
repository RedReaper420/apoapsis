
import prng from "../../utils/prng.js";
import * as utils from "../../utils/utils.js";
import * as T from "../../data/types.js";
import consts from "../../data/consts.js";

/**
 * Attempts to generate a thick gas envelope for a planet, subsequently turning it into some type of a giant.
 * 
 * Outcomes:
 * - No gas envelope (an empty envelope is assigned). Planet type is left as `Terrestrial`.
 * - Relatively thin gas envelope is set. Total planet mass < 15 M⊕. Planet type is set as `Mini-Neptune` or `Gas Dwarf`.
 * - Thick gas envelope is set. Total planet mass >= 15 M⊕. Planet type is set as `Ice Giant` or `Gas Giant`.
 * - Extremely thick gas envelope is set. Total planet mass >= 4100 M⊕. Planet type is set as `Brown Dwarf`.
 * 
 * @param {T.Planet} planet - A planet being transformed.
 */
export function makeGasGiant(planet) {
	const sma_norm = planet.genData.sma_init_norm;
	const star = planet.genData.parentStar;
	const starMass = star.mass.as(T.units.Mass.M_Sun);

	const critBaseMin = 5.0;
	const critBaseMax = 20.0;
	const criticalMass = critBaseMin * Math.exp(-0.05 * Math.sqrt(sma_norm)) + (critBaseMax - critBaseMin) * Math.exp(-0.7 * Math.sqrt(sma_norm));

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
				const parentType = planet.genData.moonType === T.moonTypes.Binary
					? planet.genData.companion.type
					: planet.parentBody.type;
				if (isIceGiant !== (parentType === T.planetTypes.IceGiant)) {
					// Converting a binary companion to the same giant type as the host with a 50% chance.
					if (prng() < 0.5) isIceGiant = !isIceGiant;
				}
			}

			let envelopeMult = 0;
			if (isIceGiant) {
				// Ice Giant
				envelopeMult = prng.range(0.5, 2);
				const dampeningThreshold = 0.9;
				if (envelopeMult > dampeningThreshold) {
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * starMass));
				}

				envelopeMult *= utils.randomRangeGaussian(0.8, 1.2);

				envelopeMass = coreMass * envelopeMult;
			}
			else {
				// True Gas Giant

				if (coreToCritRatio > 1.8) // Very massive core - very big chance for a large gas giant
					envelopeMult = prng.range(15, 64);
				else if (coreToCritRatio > 1.1)
					envelopeMult = prng.range(7, 32);
				else 
					envelopeMult = prng.range(3, 16);

				envelopeMult *= utils.randomRangeGaussian(0.9, 1.1);

				// Additional "luck" for enlarged gas giants (enabling super-Jupiters and brown dwarfs)
				if (prng() < (0.05 + star.metallicity * 0.2))
					envelopeMult *= utils.randomRangeGaussian(1.5, 4.5);

				const dampeningThreshold = 4;
				if (envelopeMult > dampeningThreshold) {
					envelopeMult = dampeningThreshold + (envelopeMult - dampeningThreshold) * (1 - Math.exp(-5 * starMass));
				}

				envelopeMass = coreMass * envelopeMult * Math.pow(sma_norm / 6, -0.15);
			}
		}
		else {
			const subNeptuneChance = 0.25 + 0.75 * ( 1 / (1 + Math.exp(-0.50 * (sma_norm - consts.PHY_DIST_SNOW_LINE))) );
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
	
	const totalMass = coreMass + envelopeMass;
	let envelopeIceFraction = isIceGiant
		? prng.range(0.65, 0.85)
		: prng.range(0.05, 0.15) * (0.25 + 0.75 * Math.exp(-0.4 * (totalMass / 300))) * Math.pow(Math.min(sma_norm, consts.PHY_DIST_SNOW_LINE) / consts.PHY_DIST_SNOW_LINE, 3);
	
	if (envelopeMass > 0) {
		if (totalMass >= consts.DEF_BROWN_DWARF_MASS_THRESHOLD) {
			planet.type = T.planetTypes.BrownDwarf;
		}
		else if (totalMass < consts.DEF_SUB_NEPTUNE_MASS_THRESHOLD) {
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
 * Assumes the planet's albedo based on the planet's composition and blackbody temperature.
 * @param {T.Planet} planet 
 * @returns
 */
export function assumeAlbedo(planet) {
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

		default: { 
			return 0.5;
		}
	}
}

/**
 * @param {T.Planet} planet 
 */
export function setDummyAtmosphere(planet) {
	planet.atmosphere = {
		scaleHeight: new T.Value(planet.radius.value * 0.05, planet.radius.unit),
		pressure: new T.Value(1, T.units.Press.atm),
		composition: { }
	}
}

/**
 * Gets base color for a giant planet and sets properties for its faux-atmosphere.
 * @param {T.Planet} planet 
 */
export function getColor(planet) {
	const temp = planet.temperature.as(T.units.Temp.K);

	// Atmosphere composition settings are done purely for visuals.

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
			planet.atmosphere.scaleHeight.value *= 2;
		}
		else if (temp >= 900) {
			planet.atmosphere.composition = {
				NaK: 0.80,
				CO: 0.10,
				H2O: 0.10,
			};
			planet.atmosphere.scaleHeight.value *= 1.5;
		}
		else if (temp >= 350) {
			planet.atmosphere.composition = {
				NaK: 0.30,
				H2O: 0.60,
				CH4: 0.10,
			};
		}
		else if (temp >= 250) {
			planet.atmosphere.composition = {
				H2O: 0.85,
				CH4: 0.10,
				NH3: 0.05,
			};
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
 * @param {T.Planet} planet 
 */
export function setSurfaceTemperature(planet) {
	planet.temperature_eq.convertTo(T.units.Temp.K);
	planet.temperature_eq.value *= Math.pow(1 - planet.albedo, 1/4);

	let T_eff_fusion = 0;
	if (planet.type === T.planetTypes.BrownDwarf) {
		const m = planet.mass.as(T.units.Mass.M_Jupiter);
		const age = planet.age.as(T.units.Time.Gy);

		if (age <= 0.1) {
			T_eff_fusion = 2500 * Math.pow(m / 30, 0.35) * Math.pow(age / 0.01, -0.12);
		}
		else {
			T_eff_fusion = 1800 * Math.pow(m / 30, 0.58) * Math.pow(age / 1.00, -0.36);
		}

		let spectralClass = '';
		if (T_eff_fusion >= 2200) {
			// Class M (M7 - M9)
			const sub = 7 + (2800 - T_eff_fusion) / 300;
			spectralClass = `M${Math.min(9, Math.max(7, sub)).toFixed(1)}`;
		} else if (T_eff_fusion >= 1300) {
			// Class L (L0 - L9)
			const sub = (2200 - T_eff_fusion) / 100;
			spectralClass = `L${Math.min(9, Math.max(0, sub)).toFixed(1)}`;
		} else if (T_eff_fusion >= 600) {
			// Class T (T0 - T9)
			const sub = (1300 - T_eff_fusion) / 70;
			spectralClass = `T${Math.min(9, Math.max(0, sub)).toFixed(1)}`;
		} else {
			// Class Y (Y0 - Y2)
			const sub = (600 - T_eff_fusion) / 125;
			spectralClass = `Y${Math.min(2.5, Math.max(0, sub)).toFixed(1)}`;
		}
		planet.spectralClass = spectralClass;
	}
	
	const T_eff = Math.pow((planet.temperature_eq.value ** 4) + (T_eff_fusion ** 4), 1/4);
	planet.temperature_eff = new T.Value(T_eff, T.units.Temp.K);
	planet.temperature = new T.Value(planet.temperature_eff.value, T.units.Temp.K);
}
