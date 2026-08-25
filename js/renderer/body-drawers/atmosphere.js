
import * as T from "../../data/types.js";

const GASES_COLORS = Object.freeze({
    H2:   Object.freeze({ r: 255, g: 153, b: 204 }), // rgb(255, 153, 204)
    He:   Object.freeze({ r: 255, g: 204, b: 153 }), // rgb(255, 204, 153)
    CH4:  Object.freeze({ r: 66,  g: 135, b: 245 }), // rgb( 66, 135, 245)
    NH3:  Object.freeze({ r: 240, g: 230, b: 200 }), // rgb(240, 230, 200)
    H2O:  Object.freeze({ r: 180, g: 220, b: 255 }), // rgb(180, 220, 255)
    Ne:   Object.freeze({ r: 255, g: 77,  b: 0   }), // rgb(255,  77,   0)
    CO:   Object.freeze({ r: 160, g: 180, b: 210 }), // rgb(160, 180, 210)
    N2:   Object.freeze({ r: 135, g: 206, b: 235 }), // rgb(135, 206, 235)
    O2:   Object.freeze({ r: 175, g: 225, b: 255 }), // rgb(175, 225, 255)
    Ar:   Object.freeze({ r: 153, g: 102, b: 255 }), // rgb(153, 102, 255)
    CO2:  Object.freeze({ r: 215, g: 180, b: 140 }), // rgb(215, 180, 140)
    SO2:  Object.freeze({ r: 230, g: 220, b: 100 }), // rgb(230, 220, 100)
    SiO2: Object.freeze({ r: 220, g: 120, b: 60  }), // rgb(220, 120,  60)
	NaK:  Object.freeze({ r: 60,  g: 30,  b: 15  }), // rgb( 60,  30,  15)
});

export default function drawAtmosphereGlow() {
	if (!(this instanceof T.Planet))
		return;
	
	if (this.sim.radius_vis < 0.1)
		return;

	if (this.atmosphere.pressure < 0.001)
		return;
	

	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.bodyCtx;
	
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
	
	outerGrad.addColorStop(0.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 1.0})`);
	outerGrad.addColorStop(0.2, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.5})`);
	outerGrad.addColorStop(0.6, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.1})`);
	outerGrad.addColorStop(1.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, 0)`);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, this.sim.radius_atm_vis, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = outerGrad;
	ctx.fill();
}
