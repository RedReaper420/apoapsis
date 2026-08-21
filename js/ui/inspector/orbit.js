
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

export default /**
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
