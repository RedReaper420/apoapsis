
import consts from "../data/consts.js";
import * as T from "../data/types.js";
import * as utils from "../utils/utils.js";

/**
 * 
 * @param {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} body 
 */
export function generateProfile(body) {
	const profile = document.createElement('div');

	if (body instanceof T.Binary) {
		const binary = generateBinaryProfile(body)
		profile.appendChild(binary);
	}
	else {
		if (body instanceof T.Star) {
			const star = generateStarProfile(body);
			profile.appendChild(star);
		}
		else {
			const planet = generatePlanetProfile(body);
			profile.appendChild(planet);
		}
	}

	return profile;
}

/**
 * 
 * @param {T.BinaryPlanet|T.BinaryStar} body 
 * @returns {HTMLElement}
 */
function generateBinaryProfile(body) {
	const template_binary = document.getElementById('template_binary');
	const binary = document.importNode(template_binary.content, true);

	// ====== GENERAL ======

	// BODIES
	const body1 = binary.querySelector('#body1');
	const primaryType = body.primary instanceof T.Binary
		? '♋'
		: body.primary instanceof T.Star
			? '☀️'
			: body.primary.type !== T.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	body1.innerText = `${primaryType} ${body.primary.name}`;

	const body2 = binary.querySelector('#body2');
	const secondaryType = body.secondary instanceof T.Binary
		? '♋'
		: body.secondary instanceof T.Star
			? '☀️'
			: body.secondary.type !== T.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	body2.innerText = `${secondaryType} ${body.secondary.name}`;

	// TOTAL MASS
	const bodyMassValue = binary.querySelector('#bodyMassValue');
	const bodyMassUnit = binary.querySelector('#bodyMassUnit');
	const bodyMassFit = utils.getFittingValue(
		body.mass,
		T.units.Mass.kg,
		[
			T.units.Mass.M_Moon, 
			T.units.Mass.M_Earth, 
			T.units.Mass.M_Jupiter, 
			T.units.Mass.M_Sun
		],
		0.1
	);
	bodyMassValue.innerText = bodyMassFit.value.toFixed(2);
	bodyMassUnit.innerText = bodyMassFit.unit;

	const bodyMassKg = binary.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.as(T.units.Mass.kg).toExponential(3).replace('+','');

	// BINARY MASS RATIO
	const binaryMassRatio = binary.querySelector('#binaryMassRatio');
	const binaryRatio = body.primary.mass.as(T.units.Mass.kg) / body.mass.as(T.units.Mass.kg) ;
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
 * @param {T.Star} body 
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
	bodyMassMSun.innerText = body.mass.as(T.units.Mass.M_Sun).toFixed(2) + ' M☉';

	const bodyMassKg = star.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.as(T.units.Mass.kg).toExponential(3).replace('+','') + ' kg';

	// BINARY MASS FRACTION
	const binaryMassFractionRow = star.querySelector('#binaryMassFractionRow');
	if (body.parentBody instanceof T.Binary) {
		const binaryMassFraction = star.querySelector('#binaryMassFraction');
		const binaryFraction = body.mass.as(T.units.Mass.kg) / body.parentBody.mass.as(T.units.Mass.kg);
		binaryMassFraction.innerText = `${(binaryFraction * 100).toFixed(1)}%${binaryFraction < 0.5 ? ` (1:${(1 / binaryFraction).toFixed(1)})`: ''}`;
	}
	else {
		binaryMassFractionRow.remove();
	}

	// RADIUS
	const bodyRadiusRSun = star.querySelector('#bodyRadiusRSun');
	bodyRadiusRSun.innerText = body.radius.as(T.units.Dist.R_Sun).toFixed(2) + ' R☉';

	const bodyRadiusKm = star.querySelector('#bodyRadiusKm');
	bodyRadiusKm.innerText = body.radius.as(T.units.Dist.km).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';

	// DENSITY
	const density = star.querySelector('#density');
	density.innerText = body.density.toFixed(3) + ' g/cm³';

	// ROTATION PERIOD
	const rotationPeriodValue = star.querySelector('#rotationPeriodValue');
	const rotationPeriodUnit = star.querySelector('#rotationPeriodUnit');
	const rotationFit = utils.getFittingValue(
		body.rotationPeriod,
		T.units.Time.s,
		[
			T.units.Time.h, 
			T.units.Time.d
		]
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
	surfaceTemperature.innerText = body.temperature.as(T.units.Temp.K).toFixed(0) + ' K';
	surfaceTemperature.style = `color: ${body.color};`;

	// LUMINOSITY
	const luminosity = star.querySelector('#luminosity');
	luminosity.innerText = body.luminosity < 1
		? body.luminosity.toPrecision(3)
		: body.luminosity.toFixed(2);
	luminosity.innerText += ' L☉';
	
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
		T.units.Time.s,
		[T.units.Time.y, T.units.Time.My, T.units.Time.Gy],
		0.5
	);
	ageValue.innerText = ageFit.value.toFixed(2);
	ageUnit.innerText = ageFit.unit;

	// LIFESPAN
	const lifespanValue = star.querySelector('#lifespanValue');
	const lifespanUnit = star.querySelector('#lifespanUnit');
	const lifespanFit = utils.getFittingValue(
		body.lifespan,
		T.units.Time.s,
		[
			T.units.Time.y, 
			T.units.Time.My, 
			T.units.Time.Gy
		],
		0.5
	);
	lifespanValue.innerText = lifespanFit.value.toFixed(2);
	lifespanUnit.innerText = lifespanFit.unit;

	// LIVED FRACTION
	const livedFraction = star.querySelector('#livedFraction');
	const livedPercent = body.age.as(T.units.Time.s) / body.lifespan.as(T.units.Time.s) * 100;
	livedFraction.innerText = livedPercent.toFixed(2) + '%';

	// METALLICITY
	const metallicity = star.querySelector('#metallicity');
	metallicity.innerText = body.metallicity.toFixed(2) + ' [Fe/H]';
	
	// ---------

	return star;
}

/**
 * 
 * @param {T.Planet} body 
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
	const icon = body.type !== T.planetTypes.Terrestrial
		? '🪐'
		: '🌑';
	bodyType.innerText = `${icon} Planet / ${body.type}`;

	// ====== PHYSICAL ======

	// MASS
	const bodyMassValue = planet.querySelector('#bodyMassValue');
	const bodyMassUnit = planet.querySelector('#bodyMassUnit');
	const bodyMassFit = utils.getFittingValue(
		body.mass,
		T.units.Mass.kg,
		[
			T.units.Mass.M_Moon, 
			T.units.Mass.M_Earth, 
			T.units.Mass.M_Jupiter, 
		],
		0.1
	);
	bodyMassValue.innerText = bodyMassFit.value.toFixed(2);
	bodyMassUnit.innerText = bodyMassFit.unit;

	const bodyMassKg = planet.querySelector('#bodyMassKg');
	bodyMassKg.innerText = body.mass.as(T.units.Mass.kg).toExponential(3).replace('+','') + ' kg';

	// BINARY MASS FRACTION
	const binaryMassFractionRow = planet.querySelector('#binaryMassFractionRow');
	if (body.parentBody instanceof T.Binary) {
		if ((body.parentBody.primary === body) || (body.parentBody.secondary === body)) {
			const binaryMassFraction = planet.querySelector('#binaryMassFraction');
			const binaryFraction = body.mass.as(T.units.Mass.kg) / body.parentBody.mass.as(T.units.Mass.kg);
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
	if (body.genData.isMoon && (body.genData.moonType !== T.moonTypes.Binary)) {
		const parentMassFraction = planet.querySelector('#parentMassFraction');
		const parentFraction = body.mass.as(T.units.Mass.kg) / body.parentBody.mass.as(T.units.Mass.kg);
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
		T.units.Dist.m,
		[
			T.units.Dist.km, 
			T.units.Dist.R_Moon, 
			T.units.Dist.R_Earth, 
			T.units.Dist.R_Jupiter
		],
		0.5
	);
	bodyRadiusValue.innerText = bodyRadiusFit.value.toFixed(2);
	bodyRadiusUnit.innerText = bodyRadiusFit.unit;

	const bodyRadiusKm = planet.querySelector('#bodyRadiusKm');
	bodyRadiusKm.innerText = body.radius.as(T.units.Dist.km).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';

	// DENSITY
	const density = planet.querySelector('#density');
	density.innerText = body.density.toFixed(3) + ' g/cm³';

	// SURFACE GRAVITY
	const surfaceGravity = planet.querySelector('#surfaceGravity');
	surfaceGravity.innerText = body.g.as(T.units.Spd.m_s).toFixed(2) + ' m/s²';

	// ESCAPE VELOCITY
	const escapeVelocity = planet.querySelector('#escapeVelocity');
	escapeVelocity.innerText = body.v_esc.as(T.units.Spd.km_s).toFixed(2) + ' km/s';

	// MOUNTAIN HEIGHT
	const mountainHeightRow = planet.querySelector('#mountainHeightRow');
	if (body.mountainHeight.value > 0) {
		const mountainHeight = planet.querySelector('#mountainHeight');
		mountainHeight.innerText = (body.mountainHeight.as(T.units.Dist.km)).toFixed(0) + ' km';
	}
	else {
		mountainHeightRow.remove();
	}

	// OCEAN DEPTH
	const oceanDepthRow = planet.querySelector('#oceanDepthRow');
	if (true) {
		const oceanDepth = planet.querySelector('#oceanDepth');
		const oceanDepth_km = body.oceanDepth.as(T.units.Dist.km);
		oceanDepth.innerText = (oceanDepth_km < 10 ? oceanDepth_km.toPrecision(2) : oceanDepth_km.toFixed(0)) + ' km';
	}
	else {
		oceanDepthRow.remove();
	}

	// OCEAN COVER
	const oceanCoverRow = planet.querySelector('#oceanCoverRow');
	if (true) {
		const oceanCover = planet.querySelector('#oceanCover');
		const oceanCoverPercent = body.oceanCover * 100;
		oceanCover.innerText = (oceanCoverPercent < 100 ? oceanCoverPercent.toPrecision(2) : oceanCoverPercent.toFixed(0)) + '%';
	}
	else {
		oceanCoverRow.remove();
	}

	// ====== COMPOSITION ======

	// CORE
	const compositionCoreIron = planet.querySelector('#compositionCoreIron');
	compositionCoreIron.innerText = (body.core.composition.iron * 100).toPrecision(2) + '%';

	const compositionCoreRock = planet.querySelector('#compositionCoreRock');
	compositionCoreRock.innerText = (body.core.composition.rock * 100).toPrecision(2) + '%';

	const compositionCoreIce = planet.querySelector('#compositionCoreIce');
	compositionCoreIce.innerText = (body.core.composition.ice * 100).toPrecision(2) + '%';

	// ENVELOPE
	const compositionEnvelope = planet.querySelector('#compositionEnvelope');
	if (body.type !== T.planetTypes.Terrestrial) {
		const compositionEnvelopeGas = planet.querySelector('#compositionEnvelopeGas');
		compositionEnvelopeGas.innerText = (body.envelope.composition.gas * 100).toPrecision(2) + '%';

		const compositionEnvelopeIce = planet.querySelector('#compositionEnvelopeIce');
		compositionEnvelopeIce.innerText = (body.envelope.composition.ice * 100).toPrecision(2) + '%';

		const envelopeThickness = planet.querySelector('#envelopeThickness');
		const envelopeThickness_km = body.envelope.thickness.as(T.units.Dist.km);
		const totalRadius_km = body.radius.as(T.units.Dist.km);
		envelopeThickness.innerText = `${envelopeThickness_km.toFixed(2)} km (${(envelopeThickness_km / totalRadius_km * 100).toPrecision(2)}% of radius)`;
	}
	else {
		compositionEnvelope.remove();
	}

	// ====== ROTATION ======

	// ROTATION PERIOD
	const rotationPeriodValue = planet.querySelector('#rotationPeriodValue');
	const rotationPeriodUnit = planet.querySelector('#rotationPeriodUnit');
	const rotationPeriodFit = utils.getFittingValue(
		body.rotationPeriod,
		T.units.Time.s,
		[
			T.units.Time.h, 
			T.units.Time.d, 
			T.units.Time.y
		],
		0.9
	);
	rotationPeriodValue.innerText = rotationPeriodFit.value.toFixed(2);
	rotationPeriodUnit.innerText = rotationPeriodFit.unit;
	
	// RETROGRADE ROTATION
	const rotationRetrograde = planet.querySelector('#rotationRetrograde');
	rotationRetrograde.innerText = body.isRotationRetrograde ? 'Yes' : 'No';
	
	// TIDAL LOCK
	const tidalLock = planet.querySelector('#tidalLock');
	if (body.isTidallyLocked) {
		tidalLock.innerHTML = `
			<th>Tidally locked</th>
			<td>Yes</td>
		`;
	}
	else {
		// TIDAL LOCK TIME
		const lockIn_Gy = isFinite(body.tidalLockIn.value) ? body.tidalLockIn.as(T.units.Time.Gy) : Infinity;
		const messageThreshold = 1e4; // 10000 Gyrs = 10 trillion years - a lifespan of lightest red dwarfs
		if (lockIn_Gy < messageThreshold) {
			const rotationTidalLockTimeFit = utils.getFittingValue(
				body.tidalLockIn,
				T.units.Time.s,
				[
					T.units.Time.s, 
					T.units.Time.h, 
					T.units.Time.d, 
					T.units.Time.y, 
					T.units.Time.My, 
					T.units.Time.Gy
				],
				0.9
			);

			tidalLock.innerHTML = `
				<th>Tidal lock in</th>
				<td>${rotationTidalLockTimeFit.value.toFixed(2)} ${rotationTidalLockTimeFit.unit}</td>
			`;
		}
		else {
			const messages = [
				{ threshold: 1e290, text: "At the end of eternity" },
				{ threshold: 1e140, text: "At the heat death" },
				{ threshold: 1e91,  text: "After the last black hole fades" },
				{ threshold: 1e50,  text: "When only black holes remain" },
				{ threshold: 1e24,  text: "When protons decay(?)" },
				{ threshold: 1e21,  text: "In the era of frozen black dwarfs" },
				{ threshold: 1e11,  text: "After the galaxies dissolve" },
				{ threshold: 1e5,   text: "After the last red dwarf dies" },
				{ threshold: messageThreshold, text: "Beyond any red dwarf's lifespan" }
			];
			const match = messages.find(msg => lockIn_Gy >= msg.threshold);

			tidalLock.innerHTML = `
				<th>Tidal lock in</th>
				<td>
					<span class='tooltip'>
						${match.text}
						<span class='tooltiptext'>
							${(body.tidalLockIn.as(T.units.Time.y)).toExponential(1).replace('+','')} y
						</span>
					</span>
				</td>
			`;
		}
	}
	
	// ====== ORBIT ======

	const orbitPlaceholder = planet.querySelector('#orbitPlaceholder');
	if (body.parentBody !== null) {
		const orbit = generateOrbitSection(body);
		orbitPlaceholder.replaceWith(orbit);
	}
	else {
		orbitPlaceholder.remove();
	}

	// ====== INSOLATION ======

	// STAR DISTANCE
	const starDistance = planet.querySelector('#starDistance');
	starDistance.innerText = (body.genData.sma_norm * Math.sqrt(body.genData.parentStar.luminosity)).toPrecision(3) + ' AU';

	// EFFECTIVE STAR DISTANCE
	const starDistanceEff = planet.querySelector('#starDistanceEff');
	starDistanceEff.innerText = (body.genData.sma_norm).toPrecision(3) + ' AU☉';

	// LIGHT INTENSITY
	const lightIntensity = planet.querySelector('#lightIntensity');
	const illumination = 1 / (body.genData.sma_norm ** 2) * 100;
	lightIntensity.innerText = (illumination > 100 ? illumination.toFixed(1) : illumination.toPrecision(3)) + '%';

	// ====== ATMOSPHERE ======
	const atmosphereSection = planet.querySelector('#atmosphereSection');
	if (body.type === T.planetTypes.Terrestrial) {
		if (body.atmosphere.pressure > 0) {
			// ATMOSPHERE PRESSURE
			const atmospherePressure = planet.querySelector('#atmospherePressure');
			atmospherePressure.innerText = (body.atmosphere.pressure).toPrecision(2) + ' atm';

			// ATMOSPHERE MASS
			const atmosphereMass = planet.querySelector('#atmosphereMass');
			atmosphereMass.innerText = body.atmosphere.mass.as(T.units.Mass.M_Earth_atm).toPrecision(3) + ' Matm⊕';

			const atmosphereMass_kg = planet.querySelector('#atmosphereMass_kg');
			atmosphereMass_kg.innerText = body.atmosphere.mass.as(T.units.Mass.kg).toExponential(3).replace('+','') + ' kg';

			// SCALE HEIGHT
			const scaleHeight = planet.querySelector('#scaleHeight');
			scaleHeight.innerText = body.atmosphere.scaleHeight.toFixed(1) + ' km';

			// CLOUD COVER
			const cloudCover = planet.querySelector('#cloudCover');
			const cloudCoverPercent = body.atmosphere.cloudCover * 100
			cloudCover.innerText = (cloudCoverPercent < 100 ? cloudCoverPercent.toPrecision(2) : cloudCoverPercent.toFixed(0)) + '%';

			// ATMOSPHERE COMPOSITION
			const compositionAtmosphere = planet.querySelector('#compositionAtmosphere');
			const tableHeader = document.createElement('tr');
			tableHeader.innerHTML = '<th colspan="2">Atmosphere composition</th>';
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
			atmosphereSection.remove();
		}
	}
	else {
		atmosphereSection.remove();
	}

	// ALBEDO
	const albedo = planet.querySelector('#albedo');
	albedo.innerText = body.albedo;

	// TEMPERATURE
	
	// SURFACE
	const tempSurf = planet.querySelector('#tempSurf');
	tempSurf.innerText = (body.temperature.as(T.units.Temp.C)).toFixed(2) + '°C';

	// GREENHOUSE EFFECT
	const greenhouse = planet.querySelector('#greenhouse');
	const greenhouseTemp = body.temperature.as(T.units.Temp.K) - body.temperature_eff.as(T.units.Temp.K);
	greenhouse.innerText = `${Math.sign(greenhouseTemp) >= 0 ? '+' : '-'}${greenhouseTemp.toFixed(2)}°C`;

	// EFFECTIVE
	const tempEff = planet.querySelector('#tempEff');
	tempEff.innerText = (body.temperature_eff.as(T.units.Temp.C)).toFixed(3) + '°C';

	// EQUILIBRIUM
	const tempEq = planet.querySelector('#tempEq');
	tempEq.innerText = (body.temperature_eq.as(T.units.Temp.C)).toFixed(3) + '°C';

	// ====== MAGNETOSPHERE ======

	const magnetosphereSection = planet.querySelector('#magnetosphereSection');
	if (body.magneticField > 0) {
		// MAGNETIC FLUX DENSITY
		const magneticFlux = planet.querySelector('#magneticFlux');
		magneticFlux.innerText = (body.magneticField * 1e6).toFixed(2) + ' μT';

		// MAGNETOPAUSE RADIUS
		const magnetopause_R = planet.querySelector('#magnetopause_R');
		const radii = body.magnetosphereRadius.as(T.units.Dist.km) / body.radius.as(T.units.Dist.km);
		magnetopause_R.innerText = radii.toFixed(1) + ' planet radii';

		const magnetopause_km = planet.querySelector('#magnetopause_km');
		magnetopause_km.innerHTML = (body.magnetosphereRadius.as(T.units.Dist.km)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';
	}
	else {
		magnetosphereSection.remove();
	}

	// ====== HISTORY ======

	// AGE
	const ageValue = planet.querySelector('#ageValue');
	const ageUnit = planet.querySelector('#ageUnit');
	const ageFit = utils.getFittingValue(
		body.age,
		T.units.Time.s,
		[
			T.units.Time.y, 
			T.units.Time.My, 
			T.units.Time.Gy
		],
		0.5
	);
	ageValue.innerText = ageFit.value.toFixed(2);
	ageUnit.innerText = ageFit.unit;
	
	// GIANT IMPACTS
	const giantImpacts = planet.querySelector('#giantImpacts');
	giantImpacts.innerText = body.genData.impacts || 0;

	// MAGNETIC FIELD LOST
	const magneticFieldLost = planet.querySelector('#magneticFieldLost');
	if (body.magnetosphereLost.value !== Infinity) {
		const lossMomentFit = utils.getFittingValue(
			new T.Value(body.age.as(T.units.Time.y) - body.magnetosphereLost.as(T.units.Time.y), T.units.Time.y) ,
			T.units.Time.s,
			[
				T.units.Time.y, 
				T.units.Time.My, 
				T.units.Time.Gy
			],
			0.5
		);
		
		magneticFieldLost.innerHTML = `
			<th>Magnetic field lost</th>
			<td>${lossMomentFit.value.toFixed(2)} ${lossMomentFit.unit} ago</td>
		`;
	}
	else {
		magneticFieldLost.remove();
	}

	// ---------

	return planet;
}

/**
 * 
 * @param {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} body 
 * @returns {HTMLElement}
 */
function generateOrbitSection(body) {
	const template_orbit = document.getElementById('template_orbit');
	const orbit = document.importNode(template_orbit.content, true);

	// PARENT BODY & BARYCENTER
	const parentBody = orbit.querySelector('#parentBody');
	const binaryMassRatioRow = orbit.querySelector('#binaryMassRatioRow');

	let host = body.parentBody;
	if (body.parentBody instanceof T.Binary) {
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
			binaryMassRatio.innerText = (body.mass.as(T.units.Mass.kg) / body.parentBody.mass.as(T.units.Mass.kg)).toFixed(2);
		}
		else {
			binaryMassRatioRow.remove();
		}
	}
	else {
		binaryMassRatioRow.remove();
	}

	const parentType = host instanceof T.Binary
		? '♋'
		: host instanceof T.Star
			? '☀️'
			: host.type !== T.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	parentBody.innerText = `${parentType} ${host.name}`;

	// ORBITAL PERIOD
	const orbitalPeriodValue = orbit.querySelector('#orbitalPeriodValue');
	const orbitalPeriodUnit = orbit.querySelector('#orbitalPeriodUnit');
	const orbitalPeriodFit = utils.getFittingValue(
		body.orbitalPeriod,
		T.units.Time.s,
		[
			T.units.Time.h, 
			T.units.Time.d, 
			T.units.Time.y
		],
		0.9
	);
	orbitalPeriodValue.innerText = orbitalPeriodFit.value.toFixed(2);
	orbitalPeriodUnit.innerText = orbitalPeriodFit.unit;

	// MEAN ORBITAL SPEED
	const orbitalSpeed = orbit.querySelector('#orbitalSpeed');
	orbitalSpeed.innerText = body.orbitalSpeed.as(T.units.Spd.km_s).toFixed(2) + ' km/s';

	// SEMI-MAJOR AXIS
	const smaValue = orbit.querySelector('#smaValue');
	const smaUnit = orbit.querySelector('#smaUnit');
	const smaFit = utils.getFittingValue(
		body.sma,
		T.units.Dist.m,
		[
			T.units.Dist.km, 
			T.units.Dist.AU, 
			T.units.Dist.ly
		],
	);
	smaValue.innerText = smaFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	smaUnit.innerText = smaFit.unit;

	// PERIAPSIS
	const periapsisValue = orbit.querySelector('#periapsisValue');
	const periapsisUnit = orbit.querySelector('#periapsisUnit');
	const periapsisFit = utils.getFittingValue(
		new T.Value(body.sma.value * (1 - body.orbit.e), body.sma.unit),
		T.units.Dist.m,
		[
			T.units.Dist.km, 
			T.units.Dist.AU, 
			T.units.Dist.ly
		],
	);
	periapsisValue.innerText = periapsisFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	periapsisUnit.innerText = periapsisFit.unit;

	// APOAPSIS
	const apoapsisValue = orbit.querySelector('#apoapsisValue');
	const apoapsisUnit = orbit.querySelector('#apoapsisUnit');
	const apoapsisFit = utils.getFittingValue(
		new T.Value(body.sma.value * (1 + body.orbit.e), body.sma.unit),
		T.units.Dist.m,
		[
			T.units.Dist.km, 
			T.units.Dist.AU, 
			T.units.Dist.ly
		],
	);
	apoapsisValue.innerText = apoapsisFit.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	apoapsisUnit.innerText = apoapsisFit.unit;

	// ECCENTRICITY
	const eccentricity = orbit.querySelector('#eccentricity');
	eccentricity.innerText = body.orbit.e.toPrecision(2);

	// RETROGRADE ORBIT
	const retrogradeOrbit = orbit.querySelector('#retrogradeOrbit');
	retrogradeOrbit.innerText = body instanceof T.Planet
		? body.genData.retrograde
			? 'Yes'
			: 'No'
		: 'No';
	
	// ARG. OF PERIAPSIS
	const argOfPeriapsis = orbit.querySelector('#argOfPeriapsis');
	argOfPeriapsis.innerText = utils.radToDeg(body.orbit.w).toFixed(2) + '°';

	/*
	// LONG. OF ASC. NODE
	const longAscNode = orbit.querySelector('#longAscNode');
	longAscNode.innerText = utils.radToDeg(body.orbit.Omega).toFixed(2) + '°';
	*/
	
	// ---------

	return orbit;
}
