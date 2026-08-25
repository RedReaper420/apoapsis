
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

import generateOrbitSection from "./orbit.js";

/**
 * 
 * @param {T.Star} body 
 * @returns {HTMLElement}
 */
export default function generateStarProfile(body) {
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
	bodyMassMSun.innerText = body.mass.as(T.units.Mass.M_Sun).toPrecision(3) + ' M☉';

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
	bodyRadiusRSun.innerText = body.radius.as(T.units.Dist.R_Sun).toPrecision(3) + ' R☉';

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

	// LIFESPAN
	const lifespanValue = star.querySelector('#lifespanValue');
	const lifespanUnit = star.querySelector('#lifespanUnit');
	const lifespanFit = utils.getFittingValue(
		body.lifespan,
		T.units.Time.s,
		[
			T.units.Time.y, 
			T.units.Time.My, 
			T.units.Time.Gy,
			T.units.Time.Ty
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
