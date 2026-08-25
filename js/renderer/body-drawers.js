
import * as T from "../data/types.js";
import * as utils from "../utils/utils.js";

import drawTrail from "./body-drawers/trail.js";
import drawOrbit from "./body-drawers/orbit.js";

import drawHabitableZone from "./body-drawers/habitable-zone.js";
import drawMagneticField from "./body-drawers/magnetic-field.js";

import drawBarycenter from "./body-drawers/barycenter.js";
import drawStar from "./body-drawers/star.js";
import drawPlanet from "./body-drawers/planet.js";

import drawRings from "./body-drawers/rings.js";
import drawAtmosphereGlow from "./body-drawers/atmosphere.js";
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
	body.drawAtmosphereGlow = drawAtmosphereGlow;
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
	this.sim.radius_vis_scaled = Math.log10(1.0 + (this.sim.radius / 1000) * 0.1);

	if (!rend.setting_showAtmospheres)
		this.sim.radius_atm_vis = (this.sim.radius + 1) / rend.metersPerPixel;

	if (!rend.setting_applyScaling)
		this.sim.radius_vis_scaled = this.sim.radius_vis;

	switch (rend.setting_drawTrails) {
		case 0:
			// Orbit
			this.drawOrbit();
			break;
		case 1:
			// Trail
			this.drawTrail();
			break;
		case 2:
			// No orbit, no trail
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
		this.drawAtmosphereGlow();

	// Light & shadow
	this.drawLighting();

	// Rings
	this.drawRings();
	
	ctx.drawImage(rend.bodyCanvas, 0, 0);

	/*
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
	*/

	// Highlight if tracked
	const visualRadius = Math.max(this.sim.radius_vis, this.sim.radius_vis_scaled);
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
	
	const hintX = coords.x + Math.max(this.sim.radius_vis_scaled, this.sim.radius_vis) + 30;
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
		if (body instanceof T.Binary)
			return getUnit(body.primary);

		if (body instanceof T.Star)
			return { unit: T.units.Mass.M_Sun, char: '☉' };
		else {
			if (body.genData.isMoon) {
				if (body.genData.moonType !== T.moonTypes.Binary) {
					return { unit: T.units.Mass.M_Moon, char: '☾' };
				}
			}
			
			if (body.mass.as(T.units.Mass.M_Earth) < 60)
				return { unit: T.units.Mass.M_Earth, char: '⊕' };
			else
				return { unit: T.units.Mass.M_Jupiter, char: '♃' };
		}
	};
	const unit = getUnit(this);
	const mass = this.mass.as(unit.unit);
	const massString = `${mass.toFixed(mass < 0.01 ? 3 : 2)} M${unit.char}`;
	
	ctx.fillText(`Mass: ${massString}`, hintX + 8, hintY + 48);
}
