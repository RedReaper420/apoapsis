
import consts from "../data/consts.js";
import * as types from "../data/types.js";
import * as utils from "../utils/utils.js";

/**
 * 
 * @param {types.BinaryPlanet|types.BinaryStar|types.Planet|types.Star} body 
 */
export function generateProfile(body) {
	const profile = document.createElement('div');

	if (body instanceof types.Binary) {
		const binary = generateBinaryProfile(body)
		profile.appendChild(binary);
	}
	else {
		if (body instanceof types.Star) {
			const star = generateStarProfile(body);
			profile.appendChild(star);
		}
		else {
			const planet = generatePlanetProfile(body);
			profile.appendChild(planet);
		}
	}

	// ORBIT SECTION
	if (false)
	if (body.parentBody !== null) {
		const orbit = generateOrbitSection(body);
		profile.appendChild(orbit);
	}

	return profile;
}

/**
 * 
 * @param {types.BinaryPlanet|types.BinaryStar} body 
 * @returns {HTMLElement}
 */
function generateBinaryProfile(body) {
	const template_binary = document.getElementById('template_binary');
	const binary = document.importNode(template_binary.content, true);

	// ====== GENERAL ======

	// BODIES
	const body1 = binary.querySelector('#body1');
	const primaryType = body.primary instanceof types.Binary
		? '♋'
		: body.primary instanceof types.Star
			? '☀️'
			: body.primary.type !== types.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	body1.innerText = `${primaryType} ${body.primary.name}`;

	const body2 = binary.querySelector('#body2');
	const secondaryType = body.secondary instanceof types.Binary
		? '♋'
		: body.secondary instanceof types.Star
			? '☀️'
			: body.secondary.type !== types.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	body2.innerText = `${secondaryType} ${body.secondary.name}`;

	// TOTAL MASS
	const bodyMassValue = binary.querySelector('#bodyMassValue');
	const bodyMassUnit = binary.querySelector('#bodyMassUnit');
	const bodyMassFit = utils.getFittingValue(
		body.mass,
		types.units.Mass.kg,
		[types.units.Mass.M_Moon, types.units.Mass.M_Earth, types.units.Mass.M_Jupiter, types.units.Mass.M_Sun],
		0.1
	);
	bodyMassValue.innerText = bodyMassFit.value.toFixed(2);
	bodyMassUnit.innerText = bodyMassFit.unit;

	const bodyMassKg = binary.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.getValueAs(types.units.Mass.kg).toExponential(3).replace('+','');

	// BINARY MASS RATIO
	const binaryMassRatio = binary.querySelector('#binaryMassRatio');
	const binaryRatio = body.primary.mass.getValueAs(types.units.Mass.kg) / body.mass.getValueAs(types.units.Mass.kg) ;
	binaryMassRatio.innerText = binaryRatio.toFixed(2) + '+' + (1 - binaryRatio).toFixed(2);
	
	// ====== ORBIT ======

	const orbitPlaceholder = binary.querySelector('#orbitPlaceholder');
	if (body.parentBody !== null) {
		const orbit = generateOrbitSection(body);
		orbitPlaceholder.replaceWith(orbit);
	}
	else {
		orbitPlaceholder.remove();
	}

	// ---------

	return binary;
}

/**
 * 
 * @param {types.Star} body 
 * @returns {HTMLElement}
 */
function generateStarProfile(body) {
	const template_star = document.getElementById('template_star');
	const star = document.importNode(template_star.content, true);

	// ====== GENERAL ======

	// NAME
	const bodyName = star.querySelector('#bodyName');
	bodyName.innerText = body.name;

	// BODY TYPE
	const bodyType = star.querySelector('#bodyType');
	bodyType.innerText = '☀️ Star';

	// SPECTRAL CLASS
	const spectralClass = star.querySelector('#spectralClass');
	spectralClass.innerText = body.type + 'V';

	// ====== PHYSICAL ======

	// MASS
	const bodyMassMSun = star.querySelector('#bodyMassMSun');
	bodyMassMSun.innerText = body.mass.getValueAs(types.units.Mass.M_Sun).toFixed(2);

	const bodyMassKg = star.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.getValueAs(types.units.Mass.kg).toExponential(3).replace('+','');

	// BINARY MASS FRACTION
	const binaryMassFractionRow = star.querySelector('#binaryMassFractionRow');
	if (body.parentBody instanceof types.Binary) {
		const binaryMassFraction = star.querySelector('#binaryMassFraction');
		const binaryFraction = body.mass.getValueAs(types.units.Mass.kg) / body.parentBody.mass.getValueAs(types.units.Mass.kg);
		binaryMassFraction.innerText = `${(binaryFraction * 100).toFixed(1)}%${binaryFraction < 0.5 ? ` (1:${(1 / binaryFraction).toFixed(1)})`: ''}`;
	}
	else {
		binaryMassFractionRow.remove();
	}

	// RADIUS
	const bodyRadiusRSun = star.querySelector('#bodyRadiusRSun');
	bodyRadiusRSun.innerText = body.radius.getValueAs(types.units.Dist.R_Sun).toFixed(2);

	const bodyRadiusKm = star.querySelector('#bodyRadiusKm');
	bodyRadiusKm.innerText = body.radius.getValueAs(types.units.Dist.km).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

	// DENSITY
	const density = star.querySelector('#density');
	density.innerText = body.density.toFixed(3);

	// ROTATION PERIOD
	const rotationPeriodValue = star.querySelector('#rotationPeriodValue');
	const rotationPeriodUnit = star.querySelector('#rotationPeriodUnit');
	const rotationFit = utils.getFittingValue(
		body.rotationPeriod,
		types.units.Time.s,
		[types.units.Time.h, types.units.Time.d]
	);
	rotationPeriodValue.innerText = rotationFit.value.toFixed(1);
	rotationPeriodUnit.innerText = rotationFit.unit;
	
	// ====== ORBIT ======

	const orbitPlaceholder = star.querySelector('#orbitPlaceholder');
	if (body.parentBody !== null) {
		const orbit = generateOrbitSection(body);
		orbitPlaceholder.replaceWith(orbit);
	}
	else {
		orbitPlaceholder.remove();
	}

	// ====== RADIATION ======

	// SURFACE TEMPERATURE
	const surfaceTemperature = star.querySelector('#surfaceTemperature');
	surfaceTemperature.innerText = body.temperature.getValueAs(types.units.Temp.K).toFixed(0);
	surfaceTemperature.style = `color: ${body.color};`;

	// LUMINOSITY
	const luminosity = star.querySelector('#luminosity');
	luminosity.innerText = body.luminosity < 1
		? body.luminosity.toPrecision(3)
		: body.luminosity.toFixed(2);
	
	// ABS. MAGNITUDE
	const absMagnitude = star.querySelector('#absMagnitude');
	absMagnitude.innerText = body.absMag.toFixed(2);

	// LIGHT COLOR
	const lightColorBlock = star.querySelector('#lightColorBlock');
	lightColorBlock.style = `color: ${body.color}; user-select: none;`;

	const lightColorValue = star.querySelector('#lightColorValue');
	lightColorValue.innerText = body.color;

	// B-V INDEX
	const bvIndex = star.querySelector('#bvIndex');
	bvIndex.innerText = body.bv.toFixed(2);

	// ====== EVOLUTION ======

	// AGE
	const ageValue = star.querySelector('#ageValue');
	const ageUnit = star.querySelector('#ageUnit');
	const ageFit = utils.getFittingValue(
		body.age,
		types.units.Time.s,
		[types.units.Time.y, types.units.Time.My, types.units.Time.Gy],
		0.5
	);
	ageValue.innerText = ageFit.value.toFixed(2);
	ageUnit.innerText = ageFit.unit;

	// LIFESPAN
	const lifespanValue = star.querySelector('#lifespanValue');
	const lifespanUnit = star.querySelector('#lifespanUnit');
	const lifespanFit = utils.getFittingValue(
		body.lifespan,
		types.units.Time.s,
		[types.units.Time.y, types.units.Time.My, types.units.Time.Gy],
		0.5
	);
	lifespanValue.innerText = lifespanFit.value.toFixed(2);
	lifespanUnit.innerText = lifespanFit.unit;

	// LIVED FRACTION
	const livedFraction = star.querySelector('#livedFraction');
	const livedPercent = body.age.getValueAs(types.units.Time.s) / body.lifespan.getValueAs(types.units.Time.s) * 100;
	livedFraction.innerText = livedPercent.toFixed(2);

	// METALLICITY
	const metallicity = star.querySelector('#metallicity');
	metallicity.innerText = body.metallicity.toFixed(2);
	
	// ---------

	return star;
}

/**
 * 
 * @param {types.Planet} body 
 * @returns {HTMLElement}
 */
function generatePlanetProfile(body) {
	const template_planet = document.getElementById('template_planet');
	const planet = document.importNode(template_planet.content, true);

	// ====== GENERAL ======
	
	// NAME
	const bodyName = planet.querySelector('#bodyName');
	bodyName.innerText = body.name;

	// BODY TYPE
	const bodyType = planet.querySelector('#bodyType');
	const icon = body.type !== types.planetTypes.Terrestrial
		? '🪐'
		: '🌑';
	bodyType.innerText = `${icon} Planet / ${body.type}`;

	// ====== PHYSICAL ======

	// MASS
	const bodyMassValue = planet.querySelector('#bodyMassValue');
	const bodyMassUnit = planet.querySelector('#bodyMassUnit');
	const bodyMassFit = utils.getFittingValue(
		body.mass,
		types.units.Mass.kg,
		[types.units.Mass.M_Moon, types.units.Mass.M_Earth, types.units.Mass.M_Jupiter, types.units.Mass.M_Sun],
		0.1
	);
	bodyMassValue.innerText = bodyMassFit.value.toFixed(2);
	bodyMassUnit.innerText = bodyMassFit.unit;

	const bodyMassKg = planet.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.getValueAs(types.units.Mass.kg).toExponential(3).replace('+','');

	// BINARY MASS FRACTION
	const binaryMassFractionRow = planet.querySelector('#binaryMassFractionRow');
	if (body.parentBody instanceof types.Binary) {
		if ((body.parentBody.primary === body) || (body.parentBody.secondary === body)) {
			const binaryMassFraction = planet.querySelector('#binaryMassFraction');
			const binaryFraction = body.mass.getValueAs(types.units.Mass.kg) / body.parentBody.mass.getValueAs(types.units.Mass.kg);
			binaryMassFraction.innerText = `${(binaryFraction * 100).toFixed(1)}%${binaryFraction < 0.5 ? ` (1:${(1 / binaryFraction).toFixed(1)})`: ''}`;
		}
		else {
			binaryMassFractionRow.remove();
		}
	}
	else {
		binaryMassFractionRow.remove();
	}

	// PARENT MASS FRACTION
	const parentMassFractionRow = planet.querySelector('#parentMassFractionRow');
	if (body.genData.isMoon && (body.genData.type !== types.moonTypes.Binary)) {
		const parentMassFraction = planet.querySelector('#parentMassFraction');
		const parentFraction = body.mass.getValueAs(types.units.Mass.kg) / body.parentBody.mass.getValueAs(types.units.Mass.kg);
		parentMassFraction.innerText = `${(parentFraction * 100).toPrecision(2)}% (1:${(1 / parentFraction).toFixed(1)})`;
	}
	else {
		parentMassFractionRow.remove();
	}

	// RADIUS
	const bodyRadiusValue = planet.querySelector('#bodyRadiusValue');
	const bodyRadiusUnit = planet.querySelector('#bodyRadiusUnit');
	const bodyRadiusFit = utils.getFittingValue(
		body.radius,
		types.units.Dist.m,
		[types.units.Dist.km, types.units.Dist.R_Moon, types.units.Dist.R_Earth, types.units.Dist.R_Jupiter],
		0.5
	);
	bodyRadiusValue.innerText = bodyRadiusFit.value.toFixed(2);
	bodyRadiusUnit.innerText = bodyRadiusFit.unit;

	const bodyRadiusKm = planet.querySelector('#bodyRadiusKm');
	bodyRadiusKm.innerText = body.radius.getValueAs(types.units.Dist.km).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

	// DENSITY
	const density = planet.querySelector('#density');
	density.innerText = body.density.toFixed(3);

	// ====== ROTATION ======

	// ROTATION PERIOD
	const rotationPeriodValue = planet.querySelector('#rotationPeriodValue');
	const rotationPeriodUnit = planet.querySelector('#rotationPeriodUnit');
	const rotationPeriodFit = utils.getFittingValue(
		body.rotationPeriod,
		types.units.Time.s,
		[types.units.Time.h, types.units.Time.d, types.units.Time.y],
		0.9
	);
	rotationPeriodValue.innerText = rotationPeriodFit.value.toFixed(2);
	rotationPeriodUnit.innerText = rotationPeriodFit.unit;
	
	// RETROGRADE ROTATION
	const rotationRetrograde = planet.querySelector('#rotationRetrograde');
	rotationRetrograde.innerText = body.isRotationRetrograde ? 'Yes' : 'No';
	
	// TIDAL LOCK
	const rotationTidalLock = planet.querySelector('#rotationTidalLock');
	rotationTidalLock.innerText = body.isTidallyLocked ? 'Yes' : 'No';

	// TIDAL LOCK TIME
	const rotationTidalLockTimeValue = planet.querySelector('#rotationTidalLockTimeValue');
	const rotationTidalLockTimeUnit = planet.querySelector('#rotationTidalLockTimeUnit');
	const rotationTidalLockTimeFit = utils.getFittingValue(
		body.tidalLockIn,
		types.units.Time.s,
		[types.units.Time.s, types.units.Time.h, types.units.Time.d, types.units.Time.y, types.units.Time.My, types.units.Time.Gy],
		0.9
	);
	rotationTidalLockTimeValue.innerText = rotationTidalLockTimeFit.value.toFixed(2);
	rotationTidalLockTimeUnit.innerText = rotationTidalLockTimeFit.unit;
	
	// ====== ORBIT ======

	const orbitPlaceholder = planet.querySelector('#orbitPlaceholder');
	if (body.parentBody !== null) {
		const orbit = generateOrbitSection(body);
		orbitPlaceholder.replaceWith(orbit);
	}
	else {
		orbitPlaceholder.remove();
	}

	// COMPOSITION

	// CORE
	const compositionCoreIron = planet.querySelector('#compositionCoreIron');
	compositionCoreIron.innerText = (body.core.composition.iron * 100).toPrecision(2) + '%';

	const compositionCoreRock = planet.querySelector('#compositionCoreRock');
	compositionCoreRock.innerText = (body.core.composition.rock * 100).toPrecision(2) + '%';

	const compositionCoreIce = planet.querySelector('#compositionCoreIce');
	compositionCoreIce.innerText = (body.core.composition.ice * 100).toPrecision(2) + '%';

	// ENVELOPE
	const compositionEnvelope = planet.querySelector('#compositionEnvelope');
	if (body.type !== types.planetTypes.Terrestrial) {
		const compositionEnvelopeGas = planet.querySelector('#compositionEnvelopeGas');
		compositionEnvelopeGas.innerText = (body.envelope.composition.gas * 100).toPrecision(2) + '%';

		const compositionEnvelopeIce = planet.querySelector('#compositionEnvelopeIce');
		compositionEnvelopeIce.innerText = (body.envelope.composition.ice * 100).toPrecision(2) + '%';

		const envelopeThickness = planet.querySelector('#envelopeThickness');
		const envelopeThickness_km = body.envelope.thickness.getValueAs(types.units.Dist.km);
		const totalRadius_km = body.radius.getValueAs(types.units.Dist.km);
		envelopeThickness.innerText = `${envelopeThickness_km.toFixed(2)} km (${(envelopeThickness_km / totalRadius_km * 100).toPrecision(2)}% of radius)`;
	}
	else {
		compositionEnvelope.remove();
	}

	// ATMOSPHERE
	const compositionAtmosphere = planet.querySelector('#compositionAtmosphere');
	if (body.type === types.planetTypes.Terrestrial) {
		if (body.atmosphere.pressure > 0) {
			const tableHeader = document.createElement('tr');
			tableHeader.innerHTML = '<th colspan="2">Atmosphere</th>';
			compositionAtmosphere.appendChild(tableHeader);

			for (const gas in body.atmosphere.composition) {
				const row = document.createElement('tr');
				compositionAtmosphere.appendChild(row);

				const header = document.createElement('th');
				row.appendChild(header);
				const header_span = document.createElement('span');
				header.appendChild(header_span);

				const cell = document.createElement('td');
				row.appendChild(cell);
				const cell_span = document.createElement('span');
				cell.appendChild(cell_span);
				
				header_span.innerText = gas;
				cell_span.innerText = (body.atmosphere.composition[gas] * 100).toPrecision(2) + '%';
			}

			const molarMassRow = document.createElement('tr');
			molarMassRow.innerHTML = `
			<th>Mean molar mass</th>
			<td><span>${(body.atmosphere.mu).toFixed(2)}</span> g/mol</td>
			`;
			compositionAtmosphere.appendChild(molarMassRow);
		}
		else {
			compositionAtmosphere.remove();
		}
	}
	else {
		compositionAtmosphere.remove();
	}

	// AGE
	const ageValue = planet.querySelector('#ageValue');
	const ageUnit = planet.querySelector('#ageUnit');
	const ageFit = utils.getFittingValue(
		body.age,
		types.units.Time.s,
		[types.units.Time.y, types.units.Time.My, types.units.Time.Gy],
		0.5
	);
	ageValue.innerText = ageFit.value.toFixed(2);
	ageUnit.innerText = ageFit.unit;

	// STAR DISTANCE
	const starDistance = planet.querySelector('#starDistance');
	starDistance.innerText = (body.genData.sma_norm * Math.sqrt(body.genData.parentStar.luminosity)).toPrecision(3);

	// EFFECTIVE STAR DISTANCE
	const starDistanceEff = planet.querySelector('#starDistanceEff');
	starDistanceEff.innerText = (body.genData.sma_norm).toPrecision(3);

	// LIGHT INTENSITY
	const lightIntensity = planet.querySelector('#lightIntensity');
	const illumination = 1 / (body.genData.sma_norm ** 2) * 100;
	lightIntensity.innerText = (illumination > 100 ? illumination.toFixed(1) : illumination.toPrecision(3)) + '%';

	// ALBEDO
	const albedo = planet.querySelector('#albedo');
	albedo.innerText = body.albedo;
	
	// GIANT IMPACTS
	const giantImpacts = planet.querySelector('#giantImpacts');
	giantImpacts.innerText = body.genData.impacts;

	// TEMPERATURE
	
	// SURFACE
	const tempSurf = planet.querySelector('#tempSurf');
	tempSurf.innerText = (body.temperature.getValueAs(types.units.Temp.C)).toFixed(2) + '°C';

	// GREENHOUSE EFFECT
	const greenhouse = planet.querySelector('#greenhouse');
	const greenhouseTemp = body.temperature.getValueAs(types.units.Temp.K) - body.temperature_eff.getValueAs(types.units.Temp.K);
	greenhouse.innerText = `${Math.sign(greenhouseTemp) >= 0 ? '+' : '-'}${greenhouseTemp.toFixed(2)}°C`;

	// EFFECTIVE
	const tempEff = planet.querySelector('#tempEff');
	tempEff.innerText = (body.temperature_eff.getValueAs(types.units.Temp.C)).toFixed(3) + '°C';

	// EQUILIBRIUM
	const tempEq = planet.querySelector('#tempEq');
	tempEq.innerText = (body.temperature_eq.getValueAs(types.units.Temp.C)).toFixed(3) + '°C';

	// ---------

	return planet;
}

/**
 * 
 * @param {types.BinaryPlanet|types.BinaryStar|types.Planet|types.Star} body 
 * @returns {HTMLElement}
 */
function generateOrbitSection(body) {
	const template_orbit = document.getElementById('template_orbit');
	const orbit = document.importNode(template_orbit.content, true);

	// PARENT BODY & BARYCENTER
	const parentBody = orbit.querySelector('#parentBody');
	const binaryMassRatioRow = orbit.querySelector('#binaryMassRatioRow');

	let host = body.parentBody;
	if (body.parentBody instanceof types.Binary) {
		let isCircumbinary = true;
		if (body.parentBody.primary === body) {
			isCircumbinary = false;
			host = body.parentBody.secondary;
		}
		else if (body.parentBody.secondary === body) {
			isCircumbinary = false;
			host = body.parentBody.primary;
		}

		if (!isCircumbinary) {
			const parentBodyLabel = orbit.querySelector('#parentBodyLabel');
			parentBodyLabel.innerText = 'Binary companion';

			const binaryMassRatio = orbit.querySelector('#binaryMassRatio');
			binaryMassRatio.innerText = (body.mass.getValueAs(types.units.Mass.kg) / body.parentBody.mass.getValueAs(types.units.Mass.kg)).toFixed(2);
		}
		else {
			binaryMassRatioRow.remove();
		}
	}
	else {
		binaryMassRatioRow.remove();
	}

	const parentType = host instanceof types.Binary
		? '♋'
		: host instanceof types.Star
			? '☀️'
			: host.type !== types.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	parentBody.innerText = `${parentType} ${host.name}`;

	// ORBITAL PERIOD
	const orbitalPeriodValue = orbit.querySelector('#orbitalPeriodValue');
	const orbitalPeriodUnit = orbit.querySelector('#orbitalPeriodUnit');
	const orbitalPeriodFit = utils.getFittingValue(
		body.orbitalPeriod,
		types.units.Time.s,
		[types.units.Time.h, types.units.Time.d, types.units.Time.y],
		0.9
	);
	orbitalPeriodValue.innerText = orbitalPeriodFit.value.toFixed(2);
	orbitalPeriodUnit.innerText = orbitalPeriodFit.unit;

	// ORBITAL SPEED
	const orbitalSpeed = orbit.querySelector('#orbitalSpeed');
	orbitalSpeed.innerText = body.orbitalSpeed.getValueAs(types.units.Spd.km_s).toFixed(2);

	// SEMI-MAJOR AXIS
	const smaValue = orbit.querySelector('#smaValue');
	const smaUnit = orbit.querySelector('#smaUnit');
	const smaFit = utils.getFittingValue(
		body.sma,
		types.units.Dist.m,
		[types.units.Dist.km, types.units.Dist.AU, types.units.Dist.ly],
	);
	smaValue.innerText = smaFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	smaUnit.innerText = smaFit.unit;

	// PERIAPSIS
	const periapsisValue = orbit.querySelector('#periapsisValue');
	const periapsisUnit = orbit.querySelector('#periapsisUnit');
	const periapsisFit = utils.getFittingValue(
		new types.Value(body.sma.value * (1 - body.orbit.e), body.sma.unit),
		types.units.Dist.m,
		[types.units.Dist.km, types.units.Dist.AU, types.units.Dist.ly],
	);
	periapsisValue.innerText = periapsisFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	periapsisUnit.innerText = periapsisFit.unit;

	// APOAPSIS
	const apoapsisValue = orbit.querySelector('#apoapsisValue');
	const apoapsisUnit = orbit.querySelector('#apoapsisUnit');
	const apoapsisFit = utils.getFittingValue(
		new types.Value(body.sma.value * (1 + body.orbit.e), body.sma.unit),
		types.units.Dist.m,
		[types.units.Dist.km, types.units.Dist.AU, types.units.Dist.ly],
	);
	apoapsisValue.innerText = apoapsisFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	apoapsisUnit.innerText = apoapsisFit.unit;

	// ECCENTRICITY
	const eccentricity = orbit.querySelector('#eccentricity');
	eccentricity.innerText = body.orbit.e.toPrecision(2);

	// RETROGRADE ORBIT
	const retrogradeOrbit = orbit.querySelector('#retrogradeOrbit');
	retrogradeOrbit.innerText = body instanceof types.Planet
		? body.genData.retrograde
			? 'Yes'
			: 'No'
		: 'No';
	
	// ARG. OF PERIAPSIS
	const argOfPeriapsis = orbit.querySelector('#argOfPeriapsis');
	argOfPeriapsis.innerText = utils.radToDeg(body.orbit.w).toFixed(2);

	/*
	// LONG. OF ASC. NODE
	const longAscNode = orbit.querySelector('#longAscNode');
	longAscNode.innerText = utils.radToDeg(body.orbit.Omega).toFixed(2);
	*/
	
	// ---------

	return orbit;
}
