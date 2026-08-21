
import { Orbit } from "../data/types.js";

/**
 * Calculates the eccentric anomaly E using the Newton-Raphson method for M = E - e * sin(E)
 */
function solveKepler(M, e, tolerance = 1e-7) {
	// Normalizing M to [0, 2pi]
	M = M % (2 * Math.PI);
	if (M < 0) M += 2 * Math.PI;

	let E = e > 0.8 ? Math.PI : M;
	for (let i = 0; i < 30; i++) {
		const f = E - e * Math.sin(E) - M;
		const fPrime = 1 - e * Math.cos(E);
		const delta = f / fPrime;
		E -= delta;
		if (Math.abs(delta) < tolerance) break;
	}
	return E;
}

/**
 * Calculates a body's position using Keplerian elements, mean motion, and time.
 * @param {Orbit} elements 
 * @param {Number} timeInSeconds 
 * @returns 
 */
export function getKeplerianPosition(elements, timeInSeconds) {
	const { a, e, i, Omega, w, M0, n } = elements;
	
	// Mean anomaly M(t)
	const t0 = 0;
	const M = M0 + n * (timeInSeconds - t0);

	// Eccentric anomaly E
	const E = solveKepler(M, e);

	// True anomaly nu & radius vector r
	const sinE = Math.sin(E);
	const cosE = Math.cos(E);
	const r = a * (1 - e * cosE);

	const nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);

	// Coordinates on orbital plane (x_orb, y_orb, 0)
	const xOrb = r * Math.cos(nu);
	const yOrb = r * Math.sin(nu);

	// Euler rotation matrix for spatial coordinates (3-1-3: Omega -> i -> w)
	const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
	const cosi = Math.cos(i),     sini = Math.sin(i);
	const cosw = Math.cos(w),     sinw = Math.sin(w);

	const Px = cosO * cosw - sinO * sinw * cosi;
	const Py = sinO * cosw + cosO * sinw * cosi;
	const Pz = sinw * sini;

	const Qx = -cosO * sinw - sinO * cosw * cosi;
	const Qy = -sinO * sinw + cosO * cosw * cosi;
	const Qz = cosw * sini;

	const x = xOrb * Px + yOrb * Qx;
	const y = xOrb * Py + yOrb * Qy;
	const z = xOrb * Pz + yOrb * Qz;

	return { 
		x: x, 
		y: y, 
		z: z 
	};
}
