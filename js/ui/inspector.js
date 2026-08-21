
import * as T from "../data/types.js";

import generateBinaryProfile from "./inspector/binary.js";
import generateStarProfile from "./inspector/star.js";
import generatePlanetProfile from "./inspector/planet.js";

/**
 * 
 * @param {T.BinaryPlanet|T.BinaryStar|T.Planet|T.Star} body 
 */
export function generateProfile(body) {
	const profile = document.createElement('div');

	if (body instanceof T.Binary) {
		const binary = generateBinaryProfile(body);
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
