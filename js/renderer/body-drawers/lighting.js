
import * as T from "../../data/types.js";
import * as utils from "../../utils/utils.js";

export default function drawLighting() {
	if (!(this instanceof T.Planet))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;

	const ctx = rend.bodyCtx;
	const shdctx = rend.shadowCtx;
	const litctx = rend.lightCtx;

	if (this.sim.radius_vis < 0.05)
		return;

	// Getting the list of stars (light sources)
	const stars = [];
	const parentStar = this.genData.parentStar;
	if (parentStar instanceof T.BinaryStar) {
		stars.push(parentStar.primary, parentStar.secondary);
	}
	else {
		if (parentStar.parentBody instanceof T.BinaryStar) {
			stars.push(parentStar, parentStar.parentBody.primary, parentStar.parentBody.secondary);
		}
		else {
			stars.push(parentStar);
		}
	}
	
	shdctx.clearRect(0, 0, shdctx.canvas.width, shdctx.canvas.height);

	if (this instanceof T.Binary) {
		shdctx.strokeStyle = 'white';
		shdctx.lineWidth = 5;
		shdctx.stroke();
	}
	else {
		shdctx.save();
			shdctx.drawImage(rend.bodyCanvas, 0, 0);
			shdctx.globalCompositeOperation = 'source-in';
			shdctx.fillStyle = rend.setting_enableLighting
				? 'rgba(0, 0, 0, 0.9)'
				: 'white';
			shdctx.fillRect(0, 0, shdctx.canvas.width, shdctx.canvas.height);
		shdctx.restore();
	}
	
	litctx.clearRect(0, 0, litctx.canvas.width, litctx.canvas.height);

	litctx.save();
		litctx.globalCompositeOperation = 'lighter';
		let lum_avg = 0;
		stars.forEach(star => { lum_avg += drawLightCone(litctx, star, this); });
		lum_avg /= stars.length;
		this.sim.lum_avg = lum_avg;
	litctx.restore();
	
	shdctx.save();
		shdctx.globalCompositeOperation = 'lighter';
		shdctx.drawImage(rend.lightCanvas, 0, 0);

		if (this.glowColor.endsWith('00') === false) {
			const glowGrad = shdctx.createRadialGradient(
				coords.x, coords.y, 0,
				coords.x, coords.y, this.sim.radius_vis
			);
			
			const color = utils.parseColor(this.glowColor);

			glowGrad.addColorStop(0.0, `rgba(255, 255, 127, ${(color.a/255).toFixed(2)}`);
			glowGrad.addColorStop(0.6, `rgba(${Math.min(Math.floor(color.r * 1.2))}, ${Math.min(Math.floor(color.g * 1.2))}, ${Math.min(Math.floor((color.r + color.g) / 4))}, ${(color.a/255).toFixed(2)})`);
			glowGrad.addColorStop(1.0, `rgba(${color.r}, ${color.g}, 0, ${(color.a/255).toFixed(2)})`);

			shdctx.beginPath();
			shdctx.arc(coords.x, coords.y, this.sim.radius_vis, 0, Math.PI * 2);
			shdctx.fillStyle = glowGrad;
			shdctx.fill();
		}
	shdctx.restore();
	
	
	ctx.save();
		ctx.globalCompositeOperation = 'multiply';
		ctx.drawImage(rend.shadowCanvas, 0, 0);
	ctx.restore();
}

function drawLightCone(ctx, star, planet) {
	const { alpha } = calculateStarIllumination(star, planet);
	const angle = Math.atan2(
		star.position.screen.y - planet.position.screen.y,
		star.position.screen.x - planet.position.screen.x
	);

	const lightDirX = Math.cos(angle + Math.PI);
  	const lightDirY = Math.sin(angle + Math.PI);
	
	const grad = ctx.createLinearGradient(
		planet.position.screen.x + lightDirX, 
		planet.position.screen.y + lightDirY,
		planet.position.screen.x - lightDirX * planet.sim.radius_atm_vis, 
		planet.position.screen.y - lightDirY * planet.sim.radius_atm_vis
	);

	const maskGrad = ctx.createRadialGradient(
		planet.position.screen.x, planet.position.screen.y, 0,
		planet.position.screen.x, planet.position.screen.y, planet.sim.radius_atm_vis
	);

	maskGrad.addColorStop(1, `rgb(255, 255, 255, 0)`);
	maskGrad.addColorStop((planet.sim.radius_vis / planet.sim.radius_atm_vis + 1) / 2, `rgb(255, 255, 255, 0.25)`);
	maskGrad.addColorStop(planet.sim.radius_vis / planet.sim.radius_atm_vis, `rgb(255, 255, 255, 1)`);
	maskGrad.addColorStop(0, `rgb(255, 255, 255, 1)`);

	const starColor = utils.parseColor(star.color);
  
	const dayColor   = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${alpha.toFixed(3)})`;
	const termColor  = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${(alpha * 0.5).toFixed(3)})`;
	const nightColor = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, 0)`;

	grad.addColorStop(1.0, dayColor);
	grad.addColorStop(0.5, termColor);
	grad.addColorStop(0.0, nightColor);
	
	ctx.beginPath();
		ctx.arc(
			planet.position.screen.x, planet.position.screen.y, 
			planet.sim.radius_atm_vis, 
			angle - Math.PI/2, angle + Math.PI/2, 
			false
		);
		ctx.fillStyle = grad;
		ctx.fill();
	ctx.closePath();

	ctx.save();
		ctx.globalCompositeOperation = 'destination-in';
		ctx.beginPath();
			ctx.arc(planet.position.screen.x, planet.position.screen.y, planet.sim.radius_atm_vis, 0, Math.PI * 2);
			ctx.fillStyle = maskGrad;
			ctx.fill();
		ctx.closePath();
	ctx.restore();

	return alpha;
}

/**
 * 
 * @param {T.Star} star 
 * @param {T.Planet} planet 
 * @returns {{ 
 * alpha: number, 
 * color: string, 
 * rawIntensity: number 
 * }}
 */
function calculateStarIllumination(star, planet) {
	const dx = planet.position.absolute.x - star.position.absolute.x;
	const dy = planet.position.absolute.y - star.position.absolute.y;
	const distanceMeters = Math.hypot(dx, dy);
	
	const AU_IN_METERS = 149597870700;
	const distAU = Math.max(0.01, distanceMeters / AU_IN_METERS);
	
	const hdr = planet.renderer.setting_applyHDR;
	const rawIntensity = star.luminosity / (distAU ** 2);
	const visualIntensity = Math.min(1.0, hdr ? Math.pow(rawIntensity, 1/4) : rawIntensity); // HDR
	const ambientLight = 0.15;
	const finalAlpha = Math.max(ambientLight, visualIntensity);


	return {
		alpha: finalAlpha,
		rawIntensity: rawIntensity
	};
}
