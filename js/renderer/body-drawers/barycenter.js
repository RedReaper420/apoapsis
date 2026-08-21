
import * as T from "../../data/types.js";

export default function drawBarycenter() {
	if (!(this instanceof T.Binary))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;
	
	const visualRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, visualRadius, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.lineWidth = 5;
	ctx.fill();
}
