
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

import generateOrbitSection from "./orbit.js";

/**
 * 
 * @param {T.Planet} body 
 * @returns {HTMLElement}
 */
export default function generatePlanetProfile(body) {
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
