
import * as T from "../../data/types.js";

const GAS_COLORS = Object.freeze({
	H2:   Object.freeze({ r: 200, g: 210, b: 230, a: 0.15 }), // rgb(200, 210, 230)
	He:   Object.freeze({ r: 220, g: 210, b: 230, a: 0.10 }), // rgb(220, 210, 230)
	
	N2:   Object.freeze({ r: 130, g: 180, b: 255, a: 0.30 }), // rgb(130, 180, 255)
	O2:   Object.freeze({ r: 160, g: 210, b: 255, a: 0.25 }), // rgb(160, 210, 255)
	Ar:   Object.freeze({ r: 140, g: 160, b: 200, a: 0.20 }), // rgb(140, 160, 200)
	CO:   Object.freeze({ r: 180, g: 180, b: 180, a: 0.25 }), // rgb(180, 180, 180)

	CH4:  Object.freeze({ r: 60,  g: 180, b: 220, a: 0.55 }), // rgb( 60, 180, 220)
	CO2:  Object.freeze({ r: 230, g: 210, b: 170, a: 0.45 }), // rgb(230, 210, 170)
	H2O:  Object.freeze({ r: 240, g: 245, b: 255, a: 0.50 }), // rgb(240, 245, 255)

	NH3:  Object.freeze({ r: 230, g: 220, b: 180, a: 0.65 }), // rgb(230, 220, 180)
	SO2:  Object.freeze({ r: 220, g: 190, b: 70,  a: 0.75 }), // rgb(220, 190,  70)
	Ne:   Object.freeze({ r: 255, g: 140, b: 100, a: 0.35 }), // rgb(255, 140,  100)

	SiO2: Object.freeze({ r: 200, g: 100, b: 50,  a: 0.85 }), // rgb(200, 100,  50)
	NaK:  Object.freeze({ r: 180, g: 80,  b: 200, a: 0.90 }), // rgb(180,  80, 200)
});

export default function drawAtmosphereClouds() {
	if (!(this instanceof T.Planet))
		return;
	
	if (this.sim.radius_vis < 0.1)
		return;

	const P = this.atmosphere.pressure.as(T.units.Press.atm);

	if (P < 0.001)
		return;

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;

	let r = 0, g = 0, b = 0, a = 0;
	for (const [gas, fraction] of Object.entries(this.atmosphere.composition)) {
		if (GAS_COLORS[gas]) {
			r += GAS_COLORS[gas].r * fraction;
			g += GAS_COLORS[gas].g * fraction;
			b += GAS_COLORS[gas].b * fraction;
			a += GAS_COLORS[gas].a * fraction;
		}
	}
	r = Math.floor(r);
	g = Math.floor(g);
	b = Math.floor(b);
	a = Math.min(0.95, 1 - Math.exp(-1 * 0.5 * P * a));

	const outerGrad = ctx.createRadialGradient(
		coords.x, coords.y, this.sim.radius_vis,
		coords.x, coords.y, this.sim.radius_atm_vis
	);
	
	outerGrad.addColorStop(0.0,  `rgba(${r} ${g} ${b} / ${a * 1.0})`);
	outerGrad.addColorStop(0.15, `rgba(${r} ${g} ${b} / ${a * 0.5})`);
	outerGrad.addColorStop(0.6,  `rgba(${r} ${g} ${b} / ${a * 0.1})`);
	outerGrad.addColorStop(1.0,  `rgba(${r} ${g} ${b} / 0)`);

	ctx.save();
		ctx.globalCompositeOperation = 'screen';

		ctx.beginPath();
			ctx.arc(coords.x, coords.y, this.sim.radius_atm_vis, 0, Math.PI * 2);
		ctx.closePath();
		ctx.fillStyle = outerGrad;
		ctx.fill();
	ctx.restore();
}
