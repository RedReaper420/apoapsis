
import * as T from "../../data/types.js";

const GASES_COLORS = Object.freeze({
    H2:   Object.freeze({ r: 255, g: 153, b: 204, a: 0.15 }), // rgb(255, 153, 204)
    He:   Object.freeze({ r: 255, g: 204, b: 153, a: 0.10 }), // rgb(255, 204, 153)
	
    N2:   Object.freeze({ r: 135, g: 206, b: 235, a: 0.30 }), // rgb(135, 206, 235)
    O2:   Object.freeze({ r: 175, g: 225, b: 255, a: 0.25 }), // rgb(175, 225, 255)
    Ar:   Object.freeze({ r: 153, g: 102, b: 255, a: 0.20 }), // rgb(153, 102, 255)
    CO:   Object.freeze({ r: 160, g: 180, b: 210, a: 0.25 }), // rgb(160, 180, 210)

    CH4:  Object.freeze({ r: 66,  g: 135, b: 245, a: 0.55 }), // rgb( 66, 135, 245)
    CO2:  Object.freeze({ r: 215, g: 180, b: 140, a: 0.45 }), // rgb(215, 180, 140)
    H2O:  Object.freeze({ r: 180, g: 220, b: 255, a: 0.50 }), // rgb(180, 220, 255)

    NH3:  Object.freeze({ r: 240, g: 230, b: 200, a: 0.65 }), // rgb(240, 230, 200)
    SO2:  Object.freeze({ r: 230, g: 220, b: 100, a: 0.75 }), // rgb(230, 220, 100)
    Ne:   Object.freeze({ r: 255, g: 77,  b: 0,   a: 0.35 }), // rgb(255,  77,   0)

    SiO2: Object.freeze({ r: 220, g: 120, b: 60,  a: 0.85 }), // rgb(220, 120,  60)
	NaK:  Object.freeze({ r: 60,  g: 30,  b: 15,  a: 0.90 }), // rgb( 60,  30,  15)
});

export default function drawAtmosphereGlow() {
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
	
	const atmColor = { r: 0, g: 0, b: 0, a: 0 };

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
			atmColor.a = Math.max(atmColor.a, GASES_COLORS[mainGas].a * max_f);

			excludedGases.push(mainGas);
		}
	}

	if (gasesNumber > 0) {
		atmColor.r /= gasesNumber;
		atmColor.g /= gasesNumber;
		atmColor.b /= gasesNumber;
	}

	const maxAlpha = Math.min(0.95, 1 - Math.exp(-1 * 1.0 * P));

	const outerGrad = ctx.createRadialGradient(
		coords.x, coords.y, this.sim.radius_vis,
		coords.x, coords.y, this.sim.radius_atm_vis
	);
	
	outerGrad.addColorStop(0.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${atmColor.a * maxAlpha * 1.0})`);
	outerGrad.addColorStop(0.2, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${atmColor.a * maxAlpha * 0.5})`);
	outerGrad.addColorStop(0.6, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${atmColor.a * maxAlpha * 0.1})`);
	outerGrad.addColorStop(1.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, 0)`);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, this.sim.radius_atm_vis, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = outerGrad;
	ctx.fill();
}
