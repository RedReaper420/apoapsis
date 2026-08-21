
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

/**
 * 
 * @param {number} simTime
 */
export default function drawStar(simTime = 0) {
	if (!(this instanceof T.Star))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;
	
	const coreRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled / 2);

	const color = utils.parseColor(this.color);

	ctx.save();

	// -------------------------------------------------------------
	// 1. OUTER CORONA W/ RAYS
	// -------------------------------------------------------------
	ctx.globalCompositeOperation = 'lighter';
	const coronaScale = 1 + Math.log10(this.luminosity + 1);
	
	const rayCount = 12;
	const coronaRadius = coreRadius * 3.5 * coronaScale;

	if (rend.setting_showStarsCorona) {
		ctx.save();
			ctx.translate(coords.x, coords.y);
			
			const rotationSpeed = -(2 * Math.PI / this.rotationPeriod.as(T.units.Time.s));
			const rotation = rend.setting_trueStarsRotation ? simTime * rotationSpeed : -(performance.now() / 1000) * 0.1;
			ctx.rotate(rotation % (Math.PI * 2));

			for (let i = 0; i < rayCount; i++) {
				const angle = (i / rayCount) * Math.PI * 2;
				
				// Pulsating effect utilizing sine functions with different frequencies
				const pulse = Math.sin(10 * rotation * 2 + i * 1.5) * 0.2 + Math.cos(10 * rotation * 3 - i) * 0.15;
				const currentRayLength = coronaRadius * (1 + pulse);

				const rayGrad = ctx.createRadialGradient(0, 0, coreRadius * 0.5, 0, 0, currentRayLength);
				rayGrad.addColorStop(0.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`);
				rayGrad.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, 0.1)`);
				rayGrad.addColorStop(1.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.0)`);

				ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.arc(0, 0, currentRayLength, angle - 0.15, angle + 0.15);
				ctx.closePath();
				ctx.fillStyle = rayGrad;
				ctx.fill();
			}
		ctx.restore();
	}
	
	// -------------------------------------------------------------
	// 2. PHOTOSPHERE (INNER GLOW)
	// -------------------------------------------------------------
	const glowRadius = coreRadius * 2.2 * coronaScale;
	const glowGrad = ctx.createRadialGradient(
		coords.x, coords.y, coreRadius * 0.2,
		coords.x, coords.y, glowRadius
	);

	glowGrad.addColorStop(0.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`);
	glowGrad.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`);
	glowGrad.addColorStop(0.7, `rgba(${color.r}, ${color.g}, ${color.b}, 0.1)`);
	glowGrad.addColorStop(1.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.0)`);

	ctx.beginPath();
	ctx.arc(coords.x, coords.y, glowRadius, 0, Math.PI * 2);
	ctx.fillStyle = glowGrad;
	ctx.fill();

	// -------------------------------------------------------------
	// 3. STAR CORE
	// -------------------------------------------------------------
	ctx.globalCompositeOperation = 'source-over';

	const coreGrad = ctx.createRadialGradient(
		coords.x, coords.y, 0,
		coords.x, coords.y, coreRadius
	);
	
	coreGrad.addColorStop(0.0, '#ffffff');
	coreGrad.addColorStop(0.6, `rgb(${Math.min(255, color.r + 50)}, ${Math.min(255, color.g + 50)}, ${Math.min(255, color.b + 50)})`);
	coreGrad.addColorStop(1.0, `rgb(${color.r}, ${color.g}, ${color.b})`);

	ctx.beginPath();
	ctx.arc(coords.x, coords.y, coreRadius, 0, Math.PI * 2);
	ctx.fillStyle = coreGrad;
	ctx.fill();

	ctx.restore();
}
