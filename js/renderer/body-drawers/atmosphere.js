
import * as T from "../../data/types.js";

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

export default function drawAtmosphereGlow() {
	if (!(this instanceof T.Planet))
		return;

	if (this.atmosphere.pressure < 0.001)
		return;
	
	if (this.sim.radius_vis < 0.1)
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
	
	outerGrad.addColorStop(0.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.8})`);
	outerGrad.addColorStop(0.2, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.4})`);
	outerGrad.addColorStop(0.6, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, ${maxAlpha * 0.1})`);
	outerGrad.addColorStop(1.0, `rgba(${atmColor.r}, ${atmColor.g}, ${atmColor.b}, 0)`);
	
	ctx.beginPath();
		ctx.arc(coords.x, coords.y, this.sim.radius_atm_vis, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fillStyle = outerGrad;
	ctx.fill();
}
