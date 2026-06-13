
import {events, eventBus} from "../utils/eventbus.js";

import prng from "../utils/prng.js";
import * as types from "../data/types.js";
import consts from "../data/consts.js";

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// --- Real Physics Constants (SI Units) ---
/*
const G = 6.6743e-11;
const M_SUN = 1.989e30;
const M_EARTH = 5.972e24;
const M_MOON = 7.342e22;
*/
const AU = new types.Value(1, types.units.Dist.AU).getValueAs(types.units.Dist.m);

// --- Simulation Variables ---
let bodies = [];
let metersPerPixel = 1;
let targetMetersPerPixel = 1;
let systemBroadViewScale = 1;
let timeMultiplier = 86400;

// Camera / Interaction State
let trackedBody = null;
let cameraX = 0; // meters relative to system center
let cameraY = 0;

// --- UI Handling ---
const warpSlider = document.getElementById('warpSlider');
const warpDisplay = document.getElementById('warpDisplay');

function updateWarpSpeed() {
    const val = parseFloat(warpSlider.value);
    timeMultiplier = Math.pow(10, val);
    
    if (timeMultiplier < 3600) {
        warpDisplay.innerText = `${Math.round(timeMultiplier)} sec/sec`;
    } else if (timeMultiplier < 86400) {
        warpDisplay.innerText = `${(timeMultiplier / 3600).toFixed(1)} hours/sec`;
    } else if (timeMultiplier < 31536000) {
        warpDisplay.innerText = `${(timeMultiplier / 86400).toFixed(1)} days/sec`;
    } else {
        warpDisplay.innerText = `${(timeMultiplier / 31536000).toFixed(1)} years/sec`;
    }
}
warpSlider.addEventListener('input', updateWarpSpeed);

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/**
 * @param {types.Body} body 
 * @param {Array} bodies 
 */
function addBody(body, bodies) {
    body.x = 0;
    body.y = 0;
    body.vx = 0;
    body.vy = 0;
    body.trail = [];

    body.mass.convertUnitTo(types.units.Mass.kg);
    if (body instanceof types.BinaryStar) {
        body.genData = { angle: Math.random() * Math.PI * 2 };
    }

    if (body.parentBody !== null) {
        let angle = Math.random() * Math.PI * 2;
        let r = body.sma.getValueAs(types.units.Dist.m);
        
		if (body.parentBody instanceof types.BinaryStar) {
			if (body instanceof types.Star) {
				const binary = body.parentBody;
				const mPrimary = binary.primary.mass.value;
				const mSecondary = binary.secondary.mass.value;
				const mTotal = mPrimary + mSecondary;
				
				// Shared angle orientation for the binary axis
				angle = binary.genData.angle;
				
				// Calculate total orbital separation distance between the two stars
				const totalSeparation = body.sma.getValueAs(types.units.Dist.m);//binary.sma.getValueAs(types.units.Dist.m);

				if (binary.primary === body) {
					// Primary distance from barycenter depends on secondary's mass fraction
					r = totalSeparation * (mSecondary / mTotal);
					// Rotate 180 degrees so they face opposite sides of the barycenter centerpoint
					angle += Math.PI; 
				} else {
					// Secondary distance from barycenter depends on primary's mass fraction
					r = totalSeparation * (mPrimary / mTotal);
				}

				// Correct Barycentric Orbital Velocity:
				// v = sqrt( (G * M_partner^2) / (M_total * totalSeparation) )
				const partnerMass = (binary.primary === body) ? mSecondary : mPrimary;
				const orbitalSpeed = Math.sqrt((consts.PHY_G * partnerMass**2) / (mTotal * totalSeparation));

				body.x = binary.x + Math.cos(angle) * r;
				body.y = binary.y + Math.sin(angle) * r;

				// Notice the matching angle variable naturally separates their direction vectors now
				body.vx = binary.vx + -Math.sin(angle) * orbitalSpeed;
				body.vy = binary.vy + Math.cos(angle) * orbitalSpeed;
			}
			else {
				const binary = body.parentBody;
				const m1 = binary.primary.mass.value;
				const m2 = binary.secondary.mass.value;
				const mTotal = m1 + m2;
				
				const d = binary.primary.sma.getValueAs(types.units.Dist.m); // Distance between stars
				const r = body.sma.getValueAs(types.units.Dist.m);   // Distance from planet to barycenter

				// Point source baseline
				const baseVelocity = Math.sqrt((consts.PHY_G * mTotal) / r);
				
				// Quadrupole correction factor
				const massFraction = (m1 * m2) / (mTotal * mTotal);
				const correction = 1 + (0.75 * Math.pow(d / r, 2) * massFraction);
				
				// Corrected stable velocity
				const orbitalSpeed = baseVelocity * Math.sqrt(correction);

				body.x = body.parentBody.x + Math.cos(angle) * r;
				body.y = body.parentBody.y + Math.sin(angle) * r;
				
				body.vx = binary.vx + -Math.sin(angle) * orbitalSpeed;
				body.vy = binary.vy + Math.cos(angle) * orbitalSpeed;
			}
		}
		else {
			// --- Standard Keplerian Orbit for Planets around stars ---
			body.x = body.parentBody.x + Math.cos(angle) * r;
			body.y = body.parentBody.y + Math.sin(angle) * r;

			const orbitalSpeed = Math.sqrt((consts.PHY_G * body.parentBody.mass.value) / r);
			body.vx = body.parentBody.vx + -Math.sin(angle) * orbitalSpeed;
			body.vy = body.parentBody.vy + Math.cos(angle) * orbitalSpeed;
		}
    }
    
    if (body instanceof types.Planet) {
        body.color = body.type === 'Terrestrial' ? '#7fa1b5' : '#e29a4a';
    }

    bodies.push(body);

    if (body instanceof types.BinaryStar) {
		body.primary.mass.convertUnitTo(types.units.Mass.kg);
		body.secondary.mass.convertUnitTo(types.units.Mass.kg);
        addBody(body.primary, bodies);
        addBody(body.secondary, bodies);
    }
    body.bodies.forEach(childBody => { addBody(childBody, bodies); });
}

function updatePosition(dt) {
	this.x += this.vx * dt;
	this.y += this.vy * dt;
}

function getScreenCoords() {
	const screenX = canvas.width / 2 + (this.x - cameraX) / metersPerPixel;
	const screenY = canvas.height / 2 + (this.y - cameraY) / metersPerPixel;
	return { x: screenX, y: screenY };
}

function drawTrail() {
	if (this.trail.length < 2) return;
	
	ctx.beginPath();
	let start = canvas.width / 2 + (this.trail[0].x - cameraX) / metersPerPixel;
	let startY = canvas.height / 2 + (this.trail[0].y - cameraY) / metersPerPixel;
	ctx.moveTo(start, startY);
	
	for (let p of this.trail) {
		ctx.lineTo(canvas.width / 2 + (p.x - cameraX) / metersPerPixel, canvas.height / 2 + (p.y - cameraY) / metersPerPixel);
	}
	//ctx.strokeStyle = this.type === 'Moon' ? this.color + '11' : this.color + '22';
	ctx.strokeStyle = this.color + '22';
	ctx.lineWidth = 1;
	ctx.stroke();
}

function drawBody() {
	const coords = this.getScreenCoords();
	ctx.beginPath();
	const trueVisualRadius = this.radius.getValueAs(types.units.Dist.m) / metersPerPixel;
	const visualRadius = Math.max(2 + Math.log10(1 + this.radius.getValueAs(types.units.Dist.R_Moon)), trueVisualRadius);
	ctx.arc(coords.x, coords.y, visualRadius, 0, Math.PI * 2);
	ctx.fillStyle = this.color;
	ctx.fill();

	// Highlight if tracked
	if (trackedBody === this) {
		ctx.beginPath();
		ctx.arc(coords.x, coords.y, visualRadius * 1.25 + 1, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(255,255,255,0.4)';
		ctx.lineWidth = 1;
		ctx.stroke();
	}
}

function drawHint() {
	if (trackedBody !== this) return;
	const coords = this.getScreenCoords();
	
	ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
	ctx.lineWidth = 1;
	
	const visualRadius = this.radius.getValueAs(types.units.Dist.m) / metersPerPixel;
	const hintX = coords.x + visualRadius + 30;
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
	
	let massString = "";
	if(this instanceof types.Star) massString = `${this.mass.getValueAs(types.units.Mass.M_Sun).toFixed(2)} M☉`;
	//else if (this.type === "Moon") massString = `${(this.mass / M_MOON).toFixed(2)} Moons`;
	else massString = `${this.mass.getValueAs(types.units.Mass.M_Earth).toFixed(2)} Earths`;
	
	ctx.fillText(`Mass: ${massString}`, hintX + 8, hintY + 48);
}

// --- System Generation ---
function generateSystem(system) {
    bodies = [];
    trackedBody = null;
	
	system.bodies.forEach(body => {
		addBody(body, bodies);
	});

	let systemMaxRadius = 0;
	for (const b in bodies) {
		const body = bodies[b];
		if (body instanceof types.BinaryStar) {
			body.mass.value = 0;
			body.radius = new types.Value(1, types.units.Dist.R_Earth);
			body.color = '#cd0000';
		}
		body.radius.convertUnitTo(types.units.Dist.m);

		body.updatePosition = updatePosition;
		body.getScreenCoords = getScreenCoords;
		body.drawTrail = drawTrail;
		body.drawBody = drawBody;
		body.drawHint = drawHint;

		const dist = Math.sqrt(body.x**2 + body.y**2);
		if (dist > systemMaxRadius)
			systemMaxRadius = dist;
	}

    document.getElementById('totalCountDisplay').innerText = bodies.length;
    document.getElementById('maxRadiusDisplay').innerText = new types.Value(systemMaxRadius, types.units.Dist.m).getValueAs(types.units.Dist.AU).toFixed(1);

    const minScreenDimension = Math.min(canvas.width, canvas.height);
    systemBroadViewScale = (systemMaxRadius * 2.3) / minScreenDimension; 
    targetMetersPerPixel = systemBroadViewScale;
    metersPerPixel = systemBroadViewScale;
}

// --- Physics Engine (O(N²)) ---
function updatePhysics(frameTimeSeconds) {
	if (frameTimeSeconds <= 0) return;

    const n = bodies.length;
	
	// If the slider makes a frame step forward by 100,000 seconds, the engine dynamically 
    // runs 100 precise physics substeps inside this frame instead of breaking.
    const maxSubstepDt = 1000; 
    const dynamicSubsteps = Math.max(12, Math.ceil(frameTimeSeconds / maxSubstepDt));
    const dt = frameTimeSeconds / dynamicSubsteps;

    for (let step = 0; step < dynamicSubsteps; step++) {
        let fxs = new Array(n).fill(0);
        let fys = new Array(n).fill(0);

        for (let i = 0; i < n; i++) {
            const bI = bodies[i];
            for (let j = i + 1; j < n; j++) {
                const bJ = bodies[j];

                const dx = bJ.x - bI.x;
                const dy = bJ.y - bI.y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);

                if (dist === 0) continue;

                const forceMag = (consts.PHY_G * bI.mass.value * bJ.mass.value) / distSq;
                const fx = forceMag * (dx / dist);
                const fy = forceMag * (dy / dist);

                fxs[i] += fx;
                fys[i] += fy;
                fxs[j] -= fx;
                fys[j] -= fy;
            }
        }

        for (let i = 0; i < n; i++) {
            const b = bodies[i];
			if (b instanceof types.BinaryStar) continue

            b.vx += (fxs[i] / b.mass.value) * dt;
            b.vy += (fys[i] / b.mass.value) * dt;
            b.updatePosition(dt);
        }
    }

    // Capture trails periodically
    for (let i = 0; i < n; i++) {
		bodies[i].trail.push({x: bodies[i].x, y: bodies[i].y});
		if (bodies[i].trail.length > 300) bodies[i].trail.shift();
    }
}

// --- Interaction / Click Event ---
canvas.addEventListener('click', (e) => {
    // Check if clicked element was inside UI panel bounding rect
    const uiPanel = document.getElementById('ui-panel');
    const rect = uiPanel.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return; 
    }

    let clickedBody = null;
    let closestDist = 20; // Click selection radius in pixels

    for (let body of bodies) {
        const coords = body.getScreenCoords();
        const dist = Math.hypot(e.clientX - coords.x, e.clientY - coords.y);
        if (dist < closestDist) {
            closestDist = dist;
            clickedBody = body;
        }
    }

    if (clickedBody) {
        trackedBody = clickedBody;
        // Dynamically adjust zoom targets depending on body classification
        if (trackedBody.type === 'Star') targetMetersPerPixel = systemBroadViewScale * 0.1;
        else if (trackedBody.type === 'Moon') targetMetersPerPixel = AU * 0.00003; 
        else targetMetersPerPixel = AU * 0.00008; // Planet view zoom scale
    } else {
        // Space clicked: restore system view
        trackedBody = null;
        targetMetersPerPixel = systemBroadViewScale;
    }
});

// --- Mouse Scroll Zoom Feature ---
canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent standard browser page scrolling

    // Determine zoom factor multiplier (scrolling up zooms in, down zooms out)
    const zoomFactor = e.deltaY < 0 ? 0.85 : 1.15;
    
    // Scale the target metric
    let nextZoom = targetMetersPerPixel * zoomFactor;

    // Boundary constraints: Prevents scrolling infinitely outwards or breaking floating math limit boundaries
    const maxZoomOut = systemBroadViewScale * 4;
    const maxZoomIn = AU * 0.000005; 

    if (nextZoom > maxZoomIn && nextZoom < maxZoomOut) {
        targetMetersPerPixel = nextZoom;
    }
}, { passive: false });

// --- Main Animation Frame Engine ---
let lastRealTime = 0;

function loop(timestamp) {
    if (!lastRealTime) lastRealTime = timestamp;
    let realDt = (timestamp - lastRealTime) / 1000;
    lastRealTime = timestamp;

    if (realDt > 0.1) realDt = 0.1; 
    const simDt = realDt * timeMultiplier;

    updatePhysics(simDt);

    // Camera Interpolation & Smoothing
	const trackingTightness = Math.min(1.0, 0.1 + (timeMultiplier / 5000000));
    if (trackedBody) {
        // Linear interpolation to smoothly follow tracked targets
        cameraX += (trackedBody.x - cameraX) * trackingTightness;
        cameraY += (trackedBody.y - cameraY) * trackingTightness;
    } else {
        // Return camera smoothly back to system geometric origin
        cameraX += (0 - cameraX) * 0.1;
        cameraY += (0 - cameraY) * 0.1;
    }
    // Zoom easing factor
    metersPerPixel += (targetMetersPerPixel - metersPerPixel) * 0.08;

    // Render pass updates
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#03030565';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw lines first so they render under bodies
    for (let body of bodies) body.drawTrail();
    for (let body of bodies) body.drawBody();
    if (trackedBody) trackedBody.drawHint();

    requestAnimationFrame(loop);
}

// Start sequence
updateWarpSpeed();
eventBus.on(events.Generator.Finished, (cb) => {
	generateSystem(cb.data);
});
requestAnimationFrame(loop);