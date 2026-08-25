
import * as T from "../../data/types.js";

export default function drawMagneticField() {
	if (!(this instanceof T.Planet))
		return;

	if (this.sim.radius_vis < 0.1)
		return;
	
	if (this.magneticField === 0) 
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;

	const starPosition = this.genData.parentStar.position.screen;
	const starAngle = Math.atan2(starPosition.y - coords.y, starPosition.x - coords.x);
	
	let fieldAngle = starAngle + Math.PI;
	if (this.parentBody instanceof T.Planet) {
		if (this.parentBody.magneticField > 0) {
			if (this.parentBody.magnetosphereRadius.as(T.units.Dist.m) > this.sma.as(T.units.Dist.m)) {
				const parentPosition = this.parentBody.position.screen;
				const parentAngle = Math.atan2(parentPosition.y - coords.y, parentPosition.x - coords.x);
				fieldAngle = parentAngle - Math.PI/2;
			}
		}
	}

	const R_Mp = this.magnetosphereRadius.as(T.units.Dist.m) / rend.metersPerPixel;

	ctx.save();
		ctx.translate(coords.x, coords.y);
		ctx.rotate(fieldAngle);

		ctx.strokeStyle = 'rgba(0, 191, 255, 0.25)';
		ctx.lineWidth = 1.5;

		const lineCount = 8;
		for (let i = 1; i <= lineCount; i++) {
			const sizeFactor = (i / lineCount) * R_Mp * 1.5;

			drawAsymmetricLoop(ctx, sizeFactor, R_Mp, 1);
			drawAsymmetricLoop(ctx, sizeFactor, R_Mp, -1);
		}

		drawBowShock(ctx, R_Mp);
	ctx.restore();
}

function drawAsymmetricLoop(ctx, sizeFactor, R_Mp, side) {
	ctx.beginPath();
	const steps = 45;
	for (let j = 0; j <= steps; j++) {
		const theta = (j / steps) * Math.PI;
		
		// Dipole: r = L * sin^2(theta)
		let r = sizeFactor * Math.sin(theta) ** 2;
		
		// Calculating fields asymmetry depending on angle
		// cos(theta) = 1 in back, cos(theta) = -1 in front
		const asymmetry = 1.0 - 0.4 * (1.0 - Math.cos(theta)); 
		r *= asymmetry;

		// Setting front side to the magnetopause radius
		if (Math.cos(theta) < 0 && r > R_Mp) {
			r = R_Mp;
		}
		
		const x = r * Math.cos(theta);
		const y = r * Math.sin(theta) * side;

		if (j === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();

	ctx.stroke();
}

function drawBowShock(ctx, R_Mp) {
	ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
	ctx.lineWidth = 2;

	ctx.beginPath();
	// The front point is placed at distance of -R_Mp 
	for (let y = -R_Mp * 2.5; y <= R_Mp * 2.5; y += R_Mp*5/45) {
		// Magnetic field tail parabola: x = -r_mp + (y^2 / (3 * r_mp))
		const x = -R_Mp + (y ** 2) / (3.5 * R_Mp);
		
		if (y === -R_Mp * 2.5) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}

	ctx.stroke();
}
