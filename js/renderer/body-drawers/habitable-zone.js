
import * as T from "../../data/types.js";

export default function drawHabitableZone() {
	if (!(this instanceof T.Star))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;

	const innerRadius_AUs = 0.4;
	const innerRadius_AU = new T.Value(innerRadius_AUs, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);
	const innerRadius_px = innerRadius_AU / rend.metersPerPixel;

	const outerRadius_AUs = 2.0;
	const outerRadius_AU = new T.Value(outerRadius_AUs, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);
	const outerRadius_px = outerRadius_AU / rend.metersPerPixel;

	const gradient = ctx.createRadialGradient(coords.x, coords.y, innerRadius_px, coords.x, coords.y, outerRadius_px);

	const bands = 6;
	for (let i = 0; i <= bands; i++) {
		gradient.addColorStop(i / bands, `hsla(${i / bands * 300}, 100%, 50%, ${(i % bands) === 0 ? 0 : (i !== (bands - 1)) ? 15 : 7.5}%)`);
	}

	ctx.beginPath();
		ctx.arc(coords.x, coords.y, outerRadius_px, 0, Math.PI * 2, false);
		ctx.arc(coords.x, coords.y, innerRadius_px, 0, Math.PI * 2, true); // Drawing counter-clockwise cuts a hole in the middle
	ctx.closePath();
	
	ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = gradient;
		ctx.fill();
	ctx.restore();
}
