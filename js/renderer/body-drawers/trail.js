
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

export default function drawTrail() {
	if (this instanceof T.Binary)
		return;
	
	this.sim.trail.push({x: this.position.absolute.x, y: this.position.absolute.y});

	if (this.sim.trail.length > 300) this.sim.trail.shift();

	if (this.sim.trail.length < 2) return;
	
	const coords = this.position.screen;
	const rend = this.renderer;
	const canvas = rend.canvas;
	const ctx = rend.ctx;
	
	ctx.beginPath();
	let startX = canvas.width / 2 + (this.sim.trail[0].x - rend.cameraPosition.x) / rend.metersPerPixel;
	let startY = canvas.height / 2 - (this.sim.trail[0].y - rend.cameraPosition.y) / rend.metersPerPixel;
	ctx.moveTo(startX, startY);

	const trail_len = this.sim.trail.length;
	for (let i = 0; i < trail_len; i++) {
		let p = this.sim.trail[i];
		ctx.lineTo(
			canvas.width / 2 + (p.x - rend.cameraPosition.x) / rend.metersPerPixel,
			canvas.height / 2 - (p.y - rend.cameraPosition.y) / rend.metersPerPixel
		);
	}
	
	const color = utils.parseColor(this.color);
	for (const c in color) {
		color[c] = Math.round(Math.pow(Math.max(1, color[c]) / 255, 1/2) * 255);
	}
	ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`;
	ctx.lineWidth = 1;
	ctx.stroke();
}
