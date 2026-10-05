
import * as T from "../data/types.js";

import drawTrail from "./body-drawers/trail.js";
import drawOrbit from "./body-drawers/orbit.js";
import drawHint from "./body-drawers/hint.js";

import drawHabitableZone from "./body-drawers/habitable-zone.js";
import drawMagneticField from "./body-drawers/magnetic-field.js";

import drawBarycenter from "./body-drawers/barycenter.js";
import drawStar from "./body-drawers/star.js";
import drawPlanet from "./body-drawers/planet.js";

import drawRings from "./body-drawers/rings.js";
import drawAtmosphere from "./body-drawers/atmosphere.js";
import drawLighting from "./body-drawers/lighting.js";

/**
 * 
 * @param {T.Body} body 
 */
export function setDrawFunctions(body, renderer) {
	body.renderer = renderer;

	body.drawBody = drawBody;

	body.drawTrail = drawTrail;
	body.drawOrbit = drawOrbit;

	body.drawHabitableZone = drawHabitableZone;
	body.drawMagneticField = drawMagneticField;

	body.drawBarycenter = drawBarycenter;
	body.drawStar = drawStar;
	body.drawPlanet = drawPlanet;

	body.drawRings = drawRings;
	body.drawAtmosphere = drawAtmosphere;
	body.drawLighting = drawLighting;

	body.drawHint = drawHint;
}

function drawBody() {
	const coords = this.position.screen;
	const rend = this.renderer;
	const ctx = rend.ctx;
	const bodyCtx = rend.bodyCtx;

	this.sim.radius_vis = this.sim.radius / rend.metersPerPixel;
	this.sim.radius_atm_vis = this.sim.radius_atm / rend.metersPerPixel;
	this.sim.system_vis = this.systemRadius / rend.metersPerPixel;
	this.sim.radius_vis_scaled = this instanceof T.Binary ? 0.5 : Math.log10(1.0 + (this.sim.radius / 1000) * 0.1);

	if (!rend.setting_showAtmospheres)
		this.sim.radius_atm_vis = (this.sim.radius + 1) / rend.metersPerPixel;

	if (!rend.setting_applyScaling)
		this.sim.radius_vis_scaled = this.sim.radius_vis;

	switch (rend.setting_drawTrails) {
		case 0:
			// No orbit, no trail
			break;
		case 1:
			// Orbit
			this.drawOrbit();
			break;
		case 2:
			// Trail
			this.drawTrail();
			break;
	}

	// Culling
	if (Math.hypot(coords.x, coords.y) > Math.max(rend.canvas.width, rend.canvas.height) * 50)
		return;

	// Habitable zone
	if (rend.setting_showHabitableZone)
		this.drawHabitableZone();

	// Magnetosphere
	if (rend.setting_showMagnetospheres)
		this.drawMagneticField();
	
	// Drawing body parts on a body canvas

	bodyCtx.clearRect(0, 0, bodyCtx.canvas.width, bodyCtx.canvas.height);

	// Barycenter
	this.drawBarycenter();

	// Star
	this.drawStar(rend.simTimeSeconds);

	// Planet
	this.drawPlanet(rend.simTimeSeconds);

	// Atmosphere
	if (rend.setting_showAtmospheres)
		this.drawAtmosphere();

	// Light & shadow
	this.drawLighting();

	// Rings
	this.drawRings();
	
	ctx.drawImage(rend.bodyCanvas, 0, 0);

	/*
	// System outline
	if (this.sim.isSystem) {
		ctx.save();
			ctx.setLineDash([5, 5]);
			const opacity = 0.1 + 0.4 * Math.min(1, rend.metersPerPixel / (rend.systemBroadViewScale * 2));
			ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
				ctx.arc(coords.x, coords.y, this.sim.system_vis * 1.25, 0, Math.PI * 2);
			ctx.closePath();
			ctx.stroke();
		ctx.restore();
	}
	*/
	
	this.drawHint();
}
