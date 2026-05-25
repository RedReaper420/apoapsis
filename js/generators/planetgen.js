
import * as types from "../data/types.js";

function getTitusBodeDistance(index=0, main_body) {
	if (main_body instanceof types.Star) {
		let n = index - 1; // -2 if index starts from 1, -1 if index starts from 0
		n = n == -1 ? -Infinity : n;
		const r = 0.4 + 0.3 * (1.728**n);

		const scale = Math.sqrt(main_body.luminosity);
		const dist = r * scale;
		return dist;
	}
	else {
		const r =  1.
	}
}

// moon_index starts from 0, giant_mass in kg, giant_radius in km
function TBD(moon_index, giant_mass=1.89e27, giant_radius=69911) {
	const start_a = 6; // in giant's radii; Io's SMA 421800 km divide by Jupiter's 69911 km equals 6.03
	const base = Math.min(1.728, (0.336*(Math.E**(0.0573*Math.log10(giant_mass))) + 1.728) / 2);
	const a = (base**moon_index) * (start_a * giant_radius);
	return a; // in km
}