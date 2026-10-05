
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

import generateOrbitSection from "./orbit.js";

const messageThreshold = 1e13; // 10 trillion years - a lifespan of lightest red dwarfs
const MESSAGES = [
	{ threshold: 1e300, text: "At the end of eternity" },
	{ threshold: 1e200, text: "At the heat death" },
	{ threshold: 1e100, text: "After the last black hole fades" },
	{ threshold: 1e43,  text: "When only black holes remain" },
	{ threshold: 1e36,  text: "When protons decay(?)" },
	{ threshold: 1e30,  text: "In the era of frozen black dwarfs" },
	{ threshold: 1e20,  text: "After the galaxies dissolve" },
	{ threshold: 1e14,  text: "After the last red dwarf dies" },
	{ threshold: messageThreshold, text: "Beyond any red dwarf's lifespan" }
];

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

	const category = planet.querySelector('#classification');
	category.innerHTML = body.category;

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
	bodyMassValue.innerText = bodyMassFit.value.toPrecision(3);
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
	bodyRadiusValue.innerText = bodyRadiusFit.value.toPrecision(3);
	bodyRadiusUnit.innerText = bodyRadiusFit.unit;

	const bodyRadiusKm = planet.querySelector('#bodyRadiusKm');
	bodyRadiusKm.innerText = body.radius.as(T.units.Dist.km).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';

	// DENSITY
	const density = planet.querySelector('#density');
	density.innerText = (body.density.as(T.units.Dens.g_cm3)).toFixed(3) + ' g/cm³';

	// SURFACE GRAVITY
	const surfaceGravity = planet.querySelector('#surfaceGravity');
	surfaceGravity.innerText = `${body.g.as(T.units.Acc.m_s2).toFixed(2)} m/s² (${body.g.as(T.units.Acc.g).toFixed(2)} g)`;

	// ESCAPE VELOCITY
	const escapeVelocity = planet.querySelector('#escapeVelocity');
	escapeVelocity.innerText = body.v_esc.as(T.units.Spd.km_s).toFixed(2) + ' km/s';

	// ESI
	const ESI = planet.querySelector('#esi');
	const ESIBar = planet.querySelector('#esiBar');
	ESI.innerText = (body.esi * 100).toFixed(1) + '%';
	ESIBar.style = `width: ${ESI.innerText};`;

	// LIFE
	const life = planet.querySelector('#life');
	const getLifePrompt = (life) => {
		switch (life) {
			case 1: return 'Abiotic';
			case 2: return 'Prokaryotic';
			case 3: return 'Multicellular';
			case 4: return 'Complex';
			case 5: return 'Civilization';

			default: return 'No life';
		}
	};
	const lifePrompt = getLifePrompt(body.life);
	life.innerText = lifePrompt;

	// ====== OCEAN ======

	const oceanSection = planet.querySelector('#oceanSection');
	if (body.type === T.planetTypes.Terrestrial) {
		// OCEAN SUBSTANCE
		const oceanSubstance = planet.querySelector('#oceanSubstance');
		oceanSubstance.innerText = body.ocean;

		// OCEAN COVER
		const oceanCover = planet.querySelector('#oceanCover');
		const oceanCoverBar = planet.querySelector('#oceanCoverBar');
		const oceanCoverPercent = body.oceanCover * 100;
		oceanCover.innerText = (oceanCoverPercent < 100 ? oceanCoverPercent.toPrecision(2) : oceanCoverPercent.toFixed(0)) + '%';
		oceanCoverBar.style = `width: ${oceanCover.innerText};`;


		// OCEAN DEPTH
		const oceanDepth = planet.querySelector('#oceanDepth');
		const oceanDepth_km = body.oceanDepth.as(T.units.Dist.km);
		oceanDepth.innerText = (oceanDepth_km < 10 ? oceanDepth_km.toPrecision(2) : oceanDepth_km.toFixed(0)) + ' km';
	}
	else {
		oceanSection.remove();
	}

	// MOUNTAIN HEIGHT
	const mountainHeightRow = planet.querySelector('#mountainHeightRow');
	if (body.mountainHeight.value > 0) {
		const mountainHeight = planet.querySelector('#mountainHeight');
		mountainHeight.innerText = (body.mountainHeight.as(T.units.Dist.km)).toPrecision(2) + ' km';
	}
	else {
		mountainHeightRow.remove();
	}

	// ====== COMPOSITION ======

	// CORE
	const compositionCoreIron = planet.querySelector('#compositionCoreIron');
	const compositionCoreIronBar = planet.querySelector('#compositionCoreIronBar');
	const ironPercent = body.core.composition.iron * 100;
	compositionCoreIron.innerText = (ironPercent < 100 ? ironPercent.toPrecision(2) : ironPercent.toFixed(0)) + '%';
	compositionCoreIronBar.style.width = compositionCoreIron.innerText;

	const compositionCoreRock = planet.querySelector('#compositionCoreRock');
	const compositionCoreRockBar = planet.querySelector('#compositionCoreRockBar');
	const rockPercent = body.core.composition.rock * 100;
	compositionCoreRock.innerText = (rockPercent < 100 ? rockPercent.toPrecision(2) : rockPercent.toFixed(0)) + '%';
	compositionCoreRockBar.style.width = compositionCoreRock.innerText;

	const compositionCoreIce = planet.querySelector('#compositionCoreIce');
	const compositionCoreIceBar = planet.querySelector('#compositionCoreIceBar');
	const icePercent = body.core.composition.ice * 100;
	compositionCoreIce.innerText = (icePercent < 100 ? icePercent.toPrecision(2) : icePercent.toFixed(0)) + '%';
	compositionCoreIceBar.style.width = compositionCoreIce.innerText;

	// ENVELOPE
	const compositionEnvelope = planet.querySelector('#compositionEnvelope');
	if (body.type !== T.planetTypes.Terrestrial) {
		const compositionEnvelopeGas = planet.querySelector('#compositionEnvelopeGas');
		const compositionEnvelopeGasBar = planet.querySelector('#compositionEnvelopeGasBar');
		const gasPercent = body.envelope.composition.gas * 100;
		compositionEnvelopeGas.innerText = (gasPercent < 100 ? gasPercent.toPrecision(2) : gasPercent.toFixed(0)) + '%';
		compositionEnvelopeGasBar.style.width = compositionEnvelopeGas.innerText;

		const compositionEnvelopeIce = planet.querySelector('#compositionEnvelopeIce');
		const compositionEnvelopeIceBar = planet.querySelector('#compositionEnvelopeIceBar');
		const iceEnvPercent = body.envelope.composition.ice * 100;
		compositionEnvelopeIce.innerText = (iceEnvPercent < 100 ? iceEnvPercent.toPrecision(2) : iceEnvPercent.toFixed(0)) + '%';
		compositionEnvelopeIceBar.style.width = compositionEnvelopeIce.innerText;

		const envelopeThickness = planet.querySelector('#envelopeThickness');
		const envelopeThicknessBar = planet.querySelector('#envelopeThicknessBar');
		const envelopeThickness_km = body.envelope.thickness.as(T.units.Dist.km);
		const totalRadius_km = body.radius.as(T.units.Dist.km);
		envelopeThickness.innerText = `${envelopeThickness_km.toFixed(2)} km (${(envelopeThickness_km / totalRadius_km * 100).toPrecision(2)}% of radius)`;
		envelopeThicknessBar.style.width = (envelopeThickness_km / totalRadius_km * 100).toPrecision(2) + '%';
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

	// SYNODIC DAY
	const synodicDayValue = planet.querySelector('#synodicDayValue');
	const synodicDayUnit = planet.querySelector('#synodicDayUnit');
	if (body.synodicDay.as(T.units.Time.y) <= 100) {
		const synodicDayFit = utils.getFittingValue(
			body.synodicDay,
			T.units.Time.s,
			[
				T.units.Time.h, 
				T.units.Time.d, 
				T.units.Time.y
			],
			0.9
		);
		synodicDayValue.innerText = synodicDayFit.value.toFixed(2);
		synodicDayUnit.innerText = synodicDayFit.unit;
	}
	else {
		synodicDayValue.innerText = 'Infinite';
		synodicDayUnit.remove();
	}
	
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
		const lockIn_y = body.tidalLockIn.as(T.units.Time.y);
		if (lockIn_y < messageThreshold) {
			const rotationTidalLockTimeFit = utils.getFittingValue(
				body.tidalLockIn,
				T.units.Time.s,
				[
					T.units.Time.s, 
					T.units.Time.h, 
					T.units.Time.d, 
					T.units.Time.y, 
					T.units.Time.My, 
					T.units.Time.Gy,
					T.units.Time.Ty
				],
				0.9
			);

			tidalLock.innerHTML = `
				<th>Tidal lock in</th>
				<td>${rotationTidalLockTimeFit.value.toFixed(2)} ${rotationTidalLockTimeFit.unit}</td>
			`;
		}
		else {
			const match = MESSAGES.find(msg => lockIn_y >= msg.threshold);

			tidalLock.innerHTML = `
				<th>Tidal lock in</th>
				<td>
					<span class='tooltip'>
						${match.text}
						<span class='tooltiptext'>
							${lockIn_y.toExponential(1).replace('+','')} y
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
	starDistanceEff.innerText = (body.genData.sma_norm < 1000 ? body.genData.sma_norm.toPrecision(3) : body.genData.sma_norm.toFixed(1)) + ' AU☉';

	// LIGHT INTENSITY
	const lightIntensity = planet.querySelector('#lightIntensity');
	const illumination = 1 / (body.genData.sma_norm ** 2) * 100;
	lightIntensity.innerText = (illumination > 100 ? illumination.toFixed(1) : illumination.toPrecision(3)) + '%';

	const starDistance2 = planet.querySelector('#starDistance2');
	const starDistanceEff2 = planet.querySelector('#starDistanceEff2');
	const lightIntensity2 = planet.querySelector('#lightIntensity2');

	if (body.genData.secondStar !== null) {
		starDistance2.innerText = (body.genData.secondStarSmaNorm * Math.sqrt(body.genData.secondStar.luminosity)).toPrecision(3) + ' AU';

		starDistanceEff2.innerText = (body.genData.secondStarSmaNorm < 1000 ? body.genData.secondStarSmaNorm.toPrecision(3) : body.genData.secondStarSmaNorm.toFixed(1)) + ' AU☉';

		const illumination2 = 1 / (body.genData.secondStarSmaNorm ** 2) * 100;
		lightIntensity2.innerText = (illumination2 > 100 ? illumination2.toFixed(1) : illumination2.toPrecision(3)) + '%';
	}
	else {
		starDistance2.parentNode.parentNode.remove();
		starDistanceEff2.parentNode.parentNode.remove();
		lightIntensity2.parentNode.parentNode.remove();
	}

	// ====== ATMOSPHERE ======
	const atmosphereSection = planet.querySelector('#atmosphereSection');
	if (body.type === T.planetTypes.Terrestrial) {
		if (body.atmosphere.pressure.value > 0) {
			// ATMOSPHERE PRESSURE
			const atmospherePressureAtm = planet.querySelector('#atmospherePressureAtm');
			const atm = body.atmosphere.pressure.as(T.units.Press.atm);
			atmospherePressureAtm.innerText = (atm < 1 ? atm.toPrecision(2) : atm.toFixed(2)) + ' atm';

			const atmospherePressurePa = planet.querySelector('#atmospherePressurePa');
			const pa = body.atmosphere.pressure.as(T.units.Press.Pa);
			atmospherePressurePa.innerText = (pa < 1 ? pa.toPrecision(2) : pa.toFixed(2)) + ' Pa';

			// ATMOSPHERE MASS
			const atmosphereMass = planet.querySelector('#atmosphereMass');
			const atmosphereMassValue = body.atmosphere.mass.as(T.units.Mass.M_Earth_atm)
			atmosphereMass.innerText = (atmosphereMassValue < 1 ? atmosphereMassValue.toPrecision(2) : atmosphereMassValue.toFixed(2)) + ' Matm⊕';

			const atmosphereMass_kg = planet.querySelector('#atmosphereMass_kg');
			atmosphereMass_kg.innerText = body.atmosphere.mass.as(T.units.Mass.kg).toExponential(3).replace('+','') + ' kg';

			// SCALE HEIGHT
			const scaleHeight = planet.querySelector('#scaleHeight');
			scaleHeight.innerText = (body.atmosphere.scaleHeight.as(T.units.Dist.km)).toFixed(1) + ' km';
			
			// ATMOSPHERE COMPOSITION
			const compositionAtmosphere = planet.querySelector('#compositionAtmosphere');
			const tableHeader = document.createElement('tr');
			tableHeader.innerHTML = '<th colspan="2">Atmosphere composition</th>';
			compositionAtmosphere.appendChild(tableHeader);

			const compositionBarRow = document.createElement('tr');
			compositionAtmosphere.appendChild(compositionBarRow);

			const compositionBarCell = document.createElement('td');
			compositionBarCell.setAttribute('colspan', '2');
			compositionBarRow.appendChild(compositionBarCell);

			const compositionBar = document.createElement('span');
			compositionBar.classList.add('progressbar');
			compositionBar.style = 'width: 100%;';
			compositionBarCell.appendChild(compositionBar);

			let gasCount = 0;
			const gasesNumber = Object.keys(body.atmosphere.composition).length;
			for (const gas in body.atmosphere.composition) {
				const col = ((gasesNumber - gasCount) / gasesNumber * 360).toFixed(0);

				const row = document.createElement('tr');
				row.style.backgroundColor = `hsl(${col}deg, 50%, 50%, 50%)`;
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
				const atmGasPercent = body.atmosphere.composition[gas] * 100;
				cell_span.innerText = (atmGasPercent < 100 ? atmGasPercent.toPrecision(2) : atmGasPercent.toFixed(0)) + '%';

				const barComponent = document.createElement('span');
				barComponent.classList.add('progressbar-fill');
				barComponent.style.width = `${cell_span.innerText}`;
				barComponent.style.backgroundColor = `hsl(${col}deg, 67%, 67%)`;
				compositionBar.appendChild(barComponent);

				gasCount++;
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
	albedo.innerText = body.albedo.toPrecision(2);

	// TEMPERATURE
	
	// SURFACE
	const tempSurfC = planet.querySelector('#tempSurfC');
	tempSurfC.innerText = (body.temperature.as(T.units.Temp.C)).toFixed(2) + '°C';
	const tempSurfK = planet.querySelector('#tempSurfK');
	tempSurfK.innerText = (body.temperature.as(T.units.Temp.K)).toFixed(2) + 'K';

	// GREENHOUSE EFFECT
	const greenhouse = planet.querySelector('#greenhouse');
	const greenhouseTemp = body.temperature.as(T.units.Temp.K) - body.temperature_eff.as(T.units.Temp.K);
	greenhouse.innerText = `${Math.sign(greenhouseTemp) >= 0 ? '+' : '-'}${greenhouseTemp.toFixed(2)}°C`;

	// EFFECTIVE
	const tempEffC = planet.querySelector('#tempEffC');
	tempEffC.innerText = (body.temperature_eff.as(T.units.Temp.C)).toFixed(3) + '°C';
	const tempEffK = planet.querySelector('#tempEffK');
	tempEffK.innerText = (body.temperature_eff.as(T.units.Temp.K)).toFixed(3) + 'K';

	// EQUILIBRIUM
	const tempEqC = planet.querySelector('#tempEqC');
	tempEqC.innerText = (body.temperature_eq.as(T.units.Temp.C)).toFixed(3) + '°C';
	const tempEqK = planet.querySelector('#tempEqK');
	tempEqK.innerText = (body.temperature_eq.as(T.units.Temp.K)).toFixed(3) + 'K';

	// MAXIMAL
	const tempMaxC = planet.querySelector('#tempMaxC');
	tempMaxC.innerText = (body.temperature_max.as(T.units.Temp.C)).toFixed(3) + '°C';
	const tempMaxK = planet.querySelector('#tempMaxK');
	tempMaxK.innerText = (body.temperature_max.as(T.units.Temp.K)).toFixed(3) + 'K';

	// MINIMAL
	const tempMinC = planet.querySelector('#tempMinC');
	tempMinC.innerText = (body.temperature_min.as(T.units.Temp.C)).toFixed(3) + '°C';
	const tempMinK = planet.querySelector('#tempMinK');
	tempMinK.innerText = (body.temperature_min.as(T.units.Temp.K)).toFixed(3) + 'K';

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
			T.units.Time.Gy,
			T.units.Time.Ty
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
			new T.Value(body.age.as(T.units.Time.y) - body.magnetosphereLost.as(T.units.Time.y), T.units.Time.y),
			T.units.Time.s,
			[
				T.units.Time.y, 
				T.units.Time.My, 
				T.units.Time.Gy,
				T.units.Time.Ty
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

	const history = planet.querySelector('#history');
	const lifeHistory = planet.querySelector('#lifeHistory');
	if (body.lifeHistory.size > 0) {
		for (const [stage, moment] of body.lifeHistory) {
			const historyRow = document.createElement('tr');

			const lifeStage = document.createElement('th');
			lifeStage.innerText = stage;
			historyRow.appendChild(lifeStage);

			const timestamp = document.createElement('td');
			const lifeEmergence = new T.Value(body.age.as(T.units.Time.My) - moment, T.units.Time.My);
			const lifeEmergenceFit = utils.getFittingValue(
				lifeEmergence,
				T.units.Time.s,
				[
					T.units.Time.y, 
					T.units.Time.My, 
					T.units.Time.Gy,
					T.units.Time.Ty
				],
				0.5
			);
			timestamp.innerText = `${lifeEmergenceFit.value.toFixed(2)} ${lifeEmergenceFit.unit} ago`;
			historyRow.appendChild(timestamp);

			history.appendChild(historyRow);
		}
	}
	else {
		lifeHistory.remove();
	}

	// ---------

	return planet;
}
