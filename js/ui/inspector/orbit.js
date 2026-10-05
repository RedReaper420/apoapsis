
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

/**
 * Generates orbit information section for the body inspector.
 * @param {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} body 
 * @returns
 */
export default function generateOrbitSection(body) {
	const template_orbit = document.getElementById('template_orbit');
	/** @type {Node} */
	const orbit = document.importNode(template_orbit.content, true);

	//#region | Parent body & barycenter
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

	// Parent body icon
	const parentType = host instanceof T.Binary
		? '♋'
		: host instanceof T.Star
			? '☀️'
			: host.type !== T.planetTypes.Terrestrial
				? '🪐'
				: '🌑';
	parentBody.innerText = `${parentType} ${host.name}`;
	//#endregion

	//#region | Orbital period
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
	//#endregion

	//#region | Mean orbital speed
	const orbitalSpeed = orbit.querySelector('#orbitalSpeed');
	orbitalSpeed.innerText = body.orbitalSpeed.as(T.units.Spd.km_s).toFixed(2) + ' km/s';
	//#endregion

	//#region | Semi-major axis
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
	//#endregion

	//#region | Periapsis
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
	//#endregion

	//#region | Apoapsis
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
	//#endregion

	//#region | Eccentricity
	const eccentricity = orbit.querySelector('#eccentricity');
	eccentricity.innerText = body.orbit.e.toPrecision(2);
	//#endregion

	//#region | Retrograde orbit
	const retrogradeOrbit = orbit.querySelector('#retrogradeOrbit');
	retrogradeOrbit.innerText = body instanceof T.Planet
		? body.genData.retrograde
			? 'Yes'
			: 'No'
		: 'No';
	//#endregion

	//#region | Arg. of periapsis
	const argOfPeriapsis = orbit.querySelector('#argOfPeriapsis');
	argOfPeriapsis.innerText = utils.radToDeg(body.orbit.w).toFixed(2) + '°';
	//#endregion

	//#region | Long. of asc. node
	/*
	const longAscNode = orbit.querySelector('#longAscNode');
	longAscNode.innerText = utils.radToDeg(body.orbit.Omega).toFixed(2) + '°';
	*/
	//#endregion
	
	// ---

	return orbit;
}
