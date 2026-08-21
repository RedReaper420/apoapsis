
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

import generateOrbitSection from "./orbit.js";

/**
 * 
 * @param {T.BinaryPlanet|T.BinaryStar} body 
 * @returns {HTMLElement}
 */
export default function generateBinaryProfile(body) {
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
