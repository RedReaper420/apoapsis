
import * as T from "../../data/types.js";

export default function drawRings() {
	if (!(this instanceof T.Planet))
		return;

	if (this.sim.radius_vis < 0.1)
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;
	
	for (const ring of this.rings) {
		const innerRadius = ring.innerRadius.as(T.units.Dist.m) / rend.metersPerPixel;
		const outerRadius = ring.outerRadius.as(T.units.Dist.m) / rend.metersPerPixel;
		const albedo = (0.5 * ring.albedo + 0.25) * this.sim.lum_avg;
		const baseColor = `rgb(${Math.floor(200 * albedo)}, ${Math.floor(220 * albedo)}, ${Math.floor(240 * albedo)})`;

		const gradient = ctx.createRadialGradient(coords.x, coords.y, innerRadius, coords.x, coords.y, outerRadius);

		gradient.addColorStop(0, `${baseColor.replace(')', ', 0)')}`);       // Transparent inner edge
		gradient.addColorStop(0.05, `${baseColor.replace(')', ', 0.6)')}`);  // Inner ring
		gradient.addColorStop(0.4, `${baseColor.replace(')', ', 0.8)')}`);   // Dense side of the inner ring
		gradient.addColorStop(0.5, `${baseColor.replace(')', ', 0.1)')}`);   // "Division"
		gradient.addColorStop(0.6, `${baseColor.replace(')', ', 0.7)')}`);   // Dense side of the outer ring 
		gradient.addColorStop(0.95, `${baseColor.replace(')', ', 0.4)')}`);  // Outer ring
		gradient.addColorStop(1, `${baseColor.replace(')', ', 0)')}`);       // Transparent outer edge

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
}
