
import * as T from "../../data/types.js";

export default function drawHint() {
	const coords = this.position.screen;
	const rend = this.renderer;
	const canvas = rend.canvas;
	const ctx = rend.ctx;

	if ((this.sim.hover === false) && (rend.trackedBody !== this))
		if (!rend.setting_showMarkers)
			return;
	
	if (rend.idle === rend.idleMax)
		return;

	// Highlight if tracked
	const visualRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled);
	ctx.save();
		if ((rend.trackedBody === this) || (this.sim.hover)) {
			ctx.setLineDash(((rend.trackedBody === this) < this.sim.hover) ? [3, 3] : []);
			ctx.strokeStyle = 'rgba(255,255,255,0.4)';
			ctx.lineWidth = 1;
			ctx.beginPath();
				ctx.arc(coords.x, coords.y, visualRadius * 2, 0, Math.PI * 2);
			ctx.closePath();
			ctx.stroke();
		}
	ctx.restore();

	if (!rend.setting_showMarkers)
		return;
	
	const hintX = coords.x + Math.max(this.sim.radius_vis_scaled, this.sim.radius_vis) + 6;
	const hintY = coords.y;

	const canvasSize = Math.min(canvas.width, canvas.height);

	const dist = Math.hypot(rend.cursorX - coords.x, rend.cursorY - coords.y);
	const distMod = Math.max(0, Math.min(dist - this.sim.radius_vis * 2 * 2, dist - canvasSize * 0.1));
	const distUni = distMod / canvasSize;

	const massFactor = Math.max(0.25, Math.log10(1 + this.mass.as(T.units.Mass.M_Earth))) * 25;
	const zoomFactor = Math.log10(1 + rend.metersPerPixel) ** 2;
	let a = Math.pow(Math.exp(-5 * distUni) * (massFactor / zoomFactor), 1/4);

	if (this.sim.hover)
		a *= 1.5;

	if (rend.trackedBody === this)
		a = 1;

	if (this instanceof T.Binary)
		a *= 1/3;
	
	a = Math.min(1, a);

	const text = this.name;

	ctx.font = 'bold 1em sans-serif';
	ctx.textBaseline = 'middle';
	
	// Outline
	ctx.lineWidth = 3;
	ctx.strokeStyle = `hsla(0, 0%, 0%, ${a})`;
	ctx.strokeText(text, hintX, hintY);

	// 75% of planet's color
	const toHex = (colorVal) => colorVal.toString(16).padStart(2, '0');
	ctx.fillStyle = `${this.color}${toHex(Math.floor(a * 0.75 * 255))}`;
	ctx.fillText(text, hintX, hintY);

	// 25% of white with a bit of amber
	ctx.fillStyle = `hsla(41, 100%, 95%, ${a * 0.25})`;
	ctx.fillText(text, hintX, hintY);
}
