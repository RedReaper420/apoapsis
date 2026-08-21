
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

export default function drawOrbit() {
	if (this.parentBody === null)
		return;
	
	const rend = this.renderer;
	const ctx = rend.ctx;

	const a_px = this.orbit.a / rend.metersPerPixel;
	
	if (a_px < 0.5) return;

	const color = utils.parseColor(this.color);
	for (const c in color) {
		color[c] = Math.round(Math.pow(Math.max(1, color[c]) / 255, 1/2) * 255);
	}
	ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`;
	ctx.lineWidth = 1;
	
	ctx.beginPath();
	const segments = utils.clamp(Math.ceil(Math.PI * Math.sqrt(a_px)), 36, 1440 * (1 + 3 * (rend.trackedBody === this)));
	const parent = this.parentBody;
	for (let i = 0; i <= segments; i++) {
		const nu = (i / segments) * 2 * Math.PI;
		const pos = getPositionAtTrueAnomaly(nu, this.orbit);

		const screenX = parent.position.screen.x + pos.x / rend.metersPerPixel;
		const screenY = parent.position.screen.y - pos.y / rend.metersPerPixel;

		if (i === 0) {
			ctx.moveTo(screenX, screenY);
		} else {
			ctx.lineTo(screenX, screenY);
		}
	}

	ctx.stroke();
}

/**
 * 
 * @param {number} nu 
 * @param {T.Orbit} orbit 
 * @returns 
 */
function getPositionAtTrueAnomaly(nu, orbit) {
	const r = (orbit.a * (1 - orbit.e ** 2)) / (1 + orbit.e * Math.cos(nu));
	
	const xOrb = r * Math.cos(nu);
	const yOrb = r * Math.sin(nu);
	
	const cosW = Math.cos(orbit.w), sinW = Math.sin(orbit.w);
	const cosI = Math.cos(orbit.i), sinI = Math.sin(orbit.i);
	const cosO = Math.cos(orbit.Omega), sinO = Math.sin(orbit.Omega);
	
	const Px = cosW * cosO - sinW * cosI * sinO;
	const Py = cosW * sinO + sinW * cosI * cosO;
	const Pz = sinW * sinI;

	const Qx = -sinW * cosO - cosW * cosI * sinO;
	const Qy = -sinW * sinO + cosW * cosI * cosO;
	const Qz = cosW * sinI;

	return {
		x: xOrb * Px + yOrb * Qx,
		y: xOrb * Py + yOrb * Qy,
		z: xOrb * Pz + yOrb * Qz
	};
}
