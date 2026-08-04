
import consts from "../data/consts.js";
import * as types from "../data/types.js";

/**
 * 
 * @param {types.Body} body 
 */
export function setDrawFunctions(body, renderer) {
	body.renderer = renderer;

	body.drawBody = drawBody;
	body.drawTrail = drawTrail;
	body.drawRings = drawRings;
	body.drawMagneticField = drawMagneticField;
	body.drawAtmosphereGlow = drawAtmosphereGlow;
	body.drawShadow = drawShadow;
	body.drawStar = drawStar;
	body.drawHint = drawHint;
}

function drawBody() {
	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;

	this.sim.radius_vis = this.sim.radius / rend.metersPerPixel;
	this.sim.radius_atm_vis = this.sim.radius_atm / rend.metersPerPixel;
	this.sim.system_vis = this.systemRadius / rend.metersPerPixel;
	this.sim.radius_vis_scaled = Math.log10(1.0 + (this.sim.radius / 1000) * 0.1);

	// Trail
	this.drawTrail();

	// Culling
	if (Math.hypot(coords.x, coords.y) > Math.max(rend.canvas.width, rend.canvas.height) * 50)
		return;

	// Magnetosphere
	this.drawMagneticField();

	// Body
	const visualRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled);
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, visualRadius, 0, Math.PI * 2);
	ctx.closePath();
	if (this instanceof types.Binary) {
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.lineWidth = 5;
		ctx.fill();
	}
	else {
		ctx.fillStyle = this.color;
		ctx.fill();
	}

	// Atmosphere
	this.drawAtmosphereGlow();

	// Light & shadow
	this.drawShadow();

	// Rings
	for (const ring in this.rings) {
		this.drawRings();
	}

	// performance.now() / 1000
	this.drawStar(rend.simTimeSeconds);

	// System outline
	if (this.sim.isSystem) {
		const opacity = 0.1 + 0.4 * Math.min(1, rend.metersPerPixel / (rend.systemBroadViewScale * 2));
		ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
		ctx.lineWidth = 1;
		ctx.beginPath();
			ctx.arc(coords.x, coords.y, this.sim.system_vis * 1.25, 0, Math.PI * 2);
		ctx.closePath();
		ctx.stroke();
	}

	// Highlight if tracked
	ctx.save();
		if ((rend.trackedBody === this) || (this.sim.hover)) {
			ctx.setLineDash(((rend.trackedBody === this) < (this.sim.hover)) ? [3, 3] : []);
			ctx.strokeStyle = 'rgba(255,255,255,0.4)';
			ctx.lineWidth = 1;
			ctx.beginPath();
				ctx.arc(coords.x, coords.y, visualRadius * 2, 0, Math.PI * 2);
			ctx.closePath();
			ctx.stroke();
		}
	ctx.restore();

	this.drawHint();
}

function drawHint() {

	const coords = this.position.screen;
	const rend = this.renderer;
	const canvas = rend.canvas;
	const ctx = rend.ctx;

	if ((this.sim.hover === false) && (rend.trackedBody !== this))
		return;
	
	ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
	ctx.lineWidth = 1;
	
	const hintX = coords.x + this.sim.radius_vis_scaled + 30;
	const hintY = coords.y - 30;
	const width = 160;
	const height = 62;

	ctx.fillRect(hintX, hintY, width, height);
	ctx.strokeRect(hintX, hintY, width, height);

	ctx.fillStyle = '#fff';
	ctx.font = 'bold 12px sans-serif';
	ctx.fillText(this.name, hintX + 8, hintY + 18);

	ctx.fillStyle = '#aaa';
	ctx.font = '10px sans-serif';
	ctx.fillText(`Class: ${this.type}`, hintX + 8, hintY + 34);
	
	const getUnit = (body) => {
		if (body instanceof types.Binary)
			return getUnit(body.primary);

		if (body instanceof types.Star)
			return { unit: types.units.Mass.M_Sun, char: '☉' };
		else {
			if (body.genData.isMoon) {
				if (body.genData.type !== types.moonTypes.Binary) {
					return { unit: types.units.Mass.M_Moon, char: '☾' };
				}
			}
			
			if (body.mass.getValueAs(types.units.Mass.M_Earth) < 60)
				return { unit: types.units.Mass.M_Earth, char: '⊕' };
			else
				return { unit: types.units.Mass.M_Jupiter, char: '♃' };
		}
	};
	const unit = getUnit(this);
	const mass = this.mass.getValueAs(unit.unit);
	const massString = `${mass.toFixed(mass < 0.01 ? 3 : 2)} M${unit.char}`;
	
	ctx.fillText(`Mass: ${massString}`, hintX + 8, hintY + 48);
}

function drawTrail() {
	if (this instanceof types.Binary)
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
		
	ctx.strokeStyle = this.color + '4f';
	ctx.lineWidth = 1;
	ctx.stroke();
}

function drawRings() {
	if (this.sim.radius_vis < 0.1)
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	
	for (const ring of this.rings) {
		const innerRadius = ring.innerRadius.getValueAs(types.units.Dist.m) / rend.metersPerPixel;
		const outerRadius = ring.outerRadius.getValueAs(types.units.Dist.m) / rend.metersPerPixel;
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
			ctx.arc(coords.x, coords.y, innerRadius, 0, Math.PI * 2, true); // Drawing counter-clockwise cuts a hole in the middle
		ctx.closePath();
		
		ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			ctx.fillStyle = gradient;
			ctx.fill();
		ctx.restore();
	}
}

function drawMagneticField() {
	if (!(this instanceof types.Planet))
		return;
	
	if (this.magneticField === 0) 
		return;

	if (this.sim.radius_vis < 0.1)
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;

	const starPosition = this.genData.parentStar.position.screen;
	const starAngle = Math.atan2(starPosition.y - coords.y, starPosition.x - coords.x);
	
	let fieldAngle = starAngle + Math.PI;
	if (this.parentBody instanceof types.Planet) {
		if (this.parentBody.magneticField > 0) {
			if (this.parentBody.magnetosphereRadius.getValueAs(types.units.Dist.m) > this.sma.getValueAs(types.units.Dist.m)) {
				const parentPosition = this.parentBody.position.screen;
				const parentAngle = Math.atan2(parentPosition.y - coords.y, parentPosition.x - coords.x);
				fieldAngle = parentAngle - Math.PI/2;
			}
		}
	}

	const R_Mp = this.magnetosphereRadius.getValueAs(types.units.Dist.m) / rend.metersPerPixel;

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

const GASES_COLORS = Object.freeze({
    H2:   Object.freeze({ r: 255, g: 153, b: 204 }), // Светло-розовый / пурпурный (эмиссионный спектр водорода)
    He:   Object.freeze({ r: 255, g: 204, b: 153 }), // Персиково-оранжевый (плазма гелия)
    CH4:  Object.freeze({ r: 66,  g: 135, b: 245 }), // Ярко-голубой / бирюзовый (поглощение метаном красного света, как на Уране/Нептуне)
    NH3:  Object.freeze({ r: 240, g: 230, b: 200 }), // Белесый / бледная слоновая кость (облака аммиака на Юпитере)
    H2O:  Object.freeze({ r: 180, g: 220, b: 255 }), // Нежно-голубой (водяной пар / дымка)
    Ne:   Object.freeze({ r: 255, g: 77,  b: 0   }), // Насыщенный красно-оранжевый (неоновое свечение)
    CO:   Object.freeze({ r: 160, g: 180, b: 210 }), // Бледный серо-голубой
    N2:   Object.freeze({ r: 135, g: 206, b: 235 }), // Небесно-голубой (рэлеевское рассеяние азотной атмосферы Земли)
    O2:   Object.freeze({ r: 175, g: 225, b: 255 }), // Прозрачно-голубоватый
    Ar:   Object.freeze({ r: 153, g: 102, b: 255 }), // Фиолетово-синий (свечение аргоновой плазмы)
    CO2:  Object.freeze({ r: 215, g: 180, b: 140 }), // Желтовато-оранжевый / бежевый (атмосфера Венеры и Марса)
    SO2:  Object.freeze({ r: 230, g: 220, b: 100 }), // Серно-желтый / зеленоватый
    SiO2: Object.freeze({ r: 220, g: 120, b: 60  }), // Раскаленный оранжево-коричневый (силикатные испарения / каменный дождь)
	NaK:  Object.freeze({ r: 60,  g: 30,  b: 15  }),
});

function drawAtmosphereGlow() {
	if (!(this instanceof types.Planet))
		return;

	if (this.atmosphere.pressure < 0.001)
		return;
	
	if (this.sim.radius_vis < 0.1)
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	
	// Atmosphere color
	const atmColor = { r: 0, g: 0, b: 0 };

	const excludedGases = [];
	let gasesNumber = 0;
	for (let i = 0; i < 2; i++) {
		let mainGas = '';
		let max_f = 0;
		for (const gas in this.atmosphere.composition) {
			if (excludedGases.includes(gas))
				continue;

			if (this.atmosphere.composition[gas] > max_f) {
				max_f = this.atmosphere.composition[gas];
				mainGas = gas;
			}
		}

		if (mainGas !== '') {
			gasesNumber++;

			atmColor.r += GASES_COLORS[mainGas].r * max_f;
			atmColor.g += GASES_COLORS[mainGas].g * max_f;
			atmColor.b += GASES_COLORS[mainGas].b * max_f;

			excludedGases.push(mainGas);
		}
	}

	if (gasesNumber > 0) {
		atmColor.r /= gasesNumber;
		atmColor.g /= gasesNumber;
		atmColor.b /= gasesNumber;
	}

	const maxAlpha = Math.min(0.95, 1 - Math.exp(-1 * 1.0 * this.atmosphere.pressure));

	const outerGrad = ctx.createRadialGradient(
		coords.x, coords.y, this.sim.radius_vis,
		coords.x, coords.y, this.sim.radius_atm_vis
	);
	
	outerGrad.addColorStop(0.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.8})`);
	outerGrad.addColorStop(0.2, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.4})`);
	outerGrad.addColorStop(0.6, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.1})`);
	outerGrad.addColorStop(1.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, 0)`);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, this.sim.radius_atm_vis, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = outerGrad;
	ctx.fill();

	const innerThickness = Math.min(this.sim.radius_vis * 0.4, (this.sim.radius_atm_vis - this.sim.radius_vis) * 1.2);
	const innerGrad = ctx.createRadialGradient(
		coords.x, coords.y, this.sim.radius_vis - innerThickness,
		coords.x, coords.y, this.sim.radius_atm_vis
	);

	innerGrad.addColorStop(0.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, 0)`);
	innerGrad.addColorStop(0.7, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.25})`);
	innerGrad.addColorStop(1.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.60})`);

	ctx.beginPath();
		ctx.arc(coords.x, coords.y, this.sim.radius_vis, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = innerGrad;
	ctx.fill();
}

function drawShadow() {
	if (!(this instanceof types.Planet))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	const shdctx = rend.shadowCtx;
	const litctx = rend.lightCtx;

	if ((this.sim.radius / rend.metersPerPixel) < 0.1)
		return;

	const stars = [];
	const parentStar = this.genData.parentStar;
	if (parentStar instanceof types.BinaryStar) {
		stars.push(parentStar.primary, parentStar.secondary);
	}
	else {
		if (parentStar.parentBody instanceof types.BinaryStar) {
			stars.push(parentStar, parentStar.parentBody.primary, parentStar.parentBody.secondary);
		}
		else {
			stars.push(parentStar);
		}
	}
	
	shdctx.clearRect(0, 0, shdctx.canvas.width, shdctx.canvas.height);

	shdctx.beginPath();
		shdctx.arc(coords.x, coords.y, Math.max(this.sim.radius_vis_scaled, this.sim.radius_vis), 0, Math.PI * 2);
	shdctx.closePath();
	if (this instanceof types.Binary) {
		shdctx.strokeStyle = 'rgba(15, 10, 5, 0.9)';
		shdctx.lineWidth = 5;
		shdctx.stroke();
	}
	else {
		shdctx.fillStyle = 'rgba(15, 10, 5, 0.9)';
		shdctx.fill();
	}

	litctx.clearRect(0, 0, litctx.canvas.width, litctx.canvas.height);

	litctx.beginPath();
		litctx.arc(coords.x, coords.y, Math.max(this.sim.radius_vis_scaled, this.sim.radius_atm_vis), 0, Math.PI * 2);
		if (this instanceof types.Binary) {
			litctx.strokeStyle = 'black';
			litctx.lineWidth = 5;
			litctx.stroke();
		}
		else {
			const grad = ctx.createRadialGradient(
				coords.x, coords.y, 0,
				coords.x, coords.y, this.sim.radius_atm_vis
			);

			grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
			grad.addColorStop((this.sim.radius_vis / this.sim.radius_atm_vis + 1.0) / 2, 'rgba(0, 0, 0, 0.25)');
			grad.addColorStop(this.sim.radius_vis / this.sim.radius_atm_vis, 'rgba(0, 0, 0, 1.0)');
			grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');

			litctx.fillStyle = grad;
			litctx.fill();
		}
	litctx.closePath();

	litctx.save();
		litctx.globalCompositeOperation = 'lighter';
		let lum_avg = 0;
		stars.forEach(star => {
			lum_avg += drawLightCone(litctx, star, this);
		});
		lum_avg /= stars.length;
		this.sim.lum_avg = lum_avg;
	litctx.restore();
	
	shdctx.save();
		shdctx.globalCompositeOperation = 'lighter';
		shdctx.drawImage(rend.lightCanvas, 0, 0);
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
	const coneLength = 5000; 

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

	const starColor = parseColor(star.color);
  
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
 * @param {types.Star} star 
 * @param {types.Planet} planet 
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
	
	const rawIntensity = star.luminosity / (distAU ** 2);
	const visualIntensity = Math.min(1.0, Math.pow(rawIntensity, 1/5)); // HDR
	const ambientLight = 0.15;
	const finalAlpha = Math.max(ambientLight, visualIntensity);

	return {
		alpha: finalAlpha,
		rawIntensity: rawIntensity
	};
}

function parseColor(colorStr) {
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex.slice(0, 6), 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }
  
  return { r: 255, g: 255, b: 255 };
}

/**
 * 
 * @param {number} simTime
 */
function drawStar(simTime = 0) {
	if (!(this instanceof types.Star))
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	
	const coreRadius = Math.max(1.5, this.sim.radius_vis);

	const color = parseColor(this.color || '#ffffff');

	ctx.save();

	// -------------------------------------------------------------
	// 1. OUTER CORONA W/ RAYS
	// -------------------------------------------------------------
	ctx.globalCompositeOperation = 'lighter';
	const coronaScale = 1 + Math.log10(this.luminosity + 1);
	
	const rayCount = 12;
	const coronaRadius = coreRadius * 3.5 * coronaScale;

	ctx.save();
	ctx.translate(coords.x, coords.y);
	
	const rotationSpeed = -(2 * Math.PI / this.rotationPeriod.getValueAs(types.units.Time.s));
	const rotation = (simTime * rotationSpeed);
	ctx.rotate(rotation % (Math.PI * 2));

	for (let i = 0; i < rayCount; i++) {
		const angle = (i / rayCount) * Math.PI * 2;
		
		// Pulsating effect utilizing sine functions with different frequencies
		const pulse = Math.sin(20 * rotation * 2 + i * 1.5) * 0.2 + Math.cos(20 * rotation * 3 - i) * 0.15;
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
