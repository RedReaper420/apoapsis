
import * as T from "../../data/types.js";

/**
 * 
 * @param {number} simTime
 */
export default function drawPlanet(simTime = 0) {
	if (!(this instanceof T.Planet))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;
	
	const visualRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, visualRadius, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = this.color;
	ctx.fill();

	if (this.type === T.planetTypes.Terrestrial) {
		ctx.save();
			ctx.translate(coords.x, coords.y);

			const rotationSpeed = -(2 * Math.PI / this.rotationPeriod.as(T.units.Time.s));
			const rotation = simTime * rotationSpeed;
			ctx.rotate(rotation % (Math.PI * 2));

			const scale = (2 * this.sim.radius_vis / this.sim.islandMap.width);
			ctx.scale(scale, scale);

			ctx.globalCompositeOperation = 'source-atop';
			ctx.drawImage(this.sim.islandMap, -this.sim.islandMap.width / 2, -this.sim.islandMap.height / 2);
		ctx.restore();
	}
}
