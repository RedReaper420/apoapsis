
import * as T from "../../data/types.js";

export default function drawHabitableZone() {
	if (!(this instanceof T.Star))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	
	const hz_inner_opt  = new T.Value(0.84, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);
	const hz_inner_cons = new T.Value(0.95, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);
	const hz_outer_cons = new T.Value(1.37, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);
	const hz_outer_opt  = new T.Value(1.67, T.units.Dist.AU).as(T.units.Dist.m) * Math.sqrt(this.luminosity);

	const innerRadius = hz_inner_opt / rend.metersPerPixel;
	const outerRadius = hz_outer_opt / rend.metersPerPixel;
	const hotColor = `rgb(220, 70, 0)`;
	const tempColor = `rgb(70, 220, 0)`;
	const coldColor =`rgb(0, 70, 220)`;

	const gradient = ctx.createRadialGradient(coords.x, coords.y, innerRadius, coords.x, coords.y, outerRadius);

	gradient.addColorStop(0, `${hotColor.replace(')', ', 0)')}`);
	gradient.addColorStop((hz_inner_cons - hz_inner_opt) / (hz_outer_opt - hz_inner_opt), `${tempColor.replace(')', ', 0.15)')}`);
	gradient.addColorStop((hz_outer_cons - hz_inner_opt) / (hz_outer_opt - hz_inner_opt), `${tempColor.replace(')', ', 0.15)')}`);
	gradient.addColorStop(1, `${coldColor.replace(')', ', 0)')}`);

	ctx.beginPath();
		ctx.arc(coords.x, coords.y, outerRadius, 0, Math.PI * 2, false);
		ctx.arc(coords.x, coords.y, innerRadius, 0, Math.PI * 2, true); // Drawing counter-clockwise is cutting a hole in the middle
	ctx.closePath();
	
	ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = gradient;
		ctx.fill();
	ctx.restore();
}
