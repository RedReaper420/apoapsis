
import * as utils from "../utils/utils.js";
import { events, eventBus } from "../utils/eventbus.js";
import * as types from "../data/types.js";
import { getKeplerianPosition } from "./kepler.js";
import { setDrawFunctions } from "./body-drawers.js";

class Renderer {
	constructor () {
		this.canvas = document.getElementById('simCanvas');
		this.ctx = this.canvas.getContext('2d');

		this.shadowCanvas = document.createElement('canvas');
		this.shadowCtx = this.shadowCanvas.getContext('2d');

		this.lightCanvas = document.createElement('canvas');
		this.lightCtx = this.lightCanvas.getContext('2d');

		// --- Simulation Variables ---
		this.simTimeSeconds = 0;
		this.timeMultiplier = 86400;
		this.currentSystem = null;
		this.bodyList = [];
		this.systemMaxRadius = 0;

		// -- Camera / Interaction State --
		this.trackedBody = null;
		this.cameraPosition = { x: 0, y: 0, z: 0, }
		this.targetCameraPosition = { x: 0, y: 0, z: 0, }
		this.cameraPositionTransition = 0;
		this.systemBroadViewScale = 1;
		this.metersPerPixel = 1;
		this.targetMetersPerPixel = 1;
		this.hoverThreshold = 30;
		this.cursorX = Infinity;
		this.cursorY = Infinity;

		// --- System Generation ---
		eventBus.on(events.Generator.Generation.Completed, (cb) => {
			this.generateSystem(cb.data);
		});

		// --- UI Handling ---
		this.warpSlider = document.getElementById('warpSlider');
		this.warpDisplay = document.getElementById('warpDisplay');

		this.warpSlider.addEventListener('input', (e) => { this.updateWarpSpeed(e) });

		window.addEventListener('resize', (e) => { this.resizeCanvas(e) });
		this.resizeCanvas();

		// --- Interaction / Click Event ---
		this.canvas.addEventListener('click', (e) => { this.handleClick(e) });

		// --- Mouse Scroll Zoom Feature ---
		this.canvas.addEventListener('wheel', (e) => { this.handleWheel(e) }, { passive: false });
		this.canvas.addEventListener('mousemove', (e) => { this.onMouseMove(e) });

		// --- Main Animation Frame Engine ---
		this.lastRealTime = 0;
		// Start sequence
		this.updateWarpSpeed();
		requestAnimationFrame((timestamp) => this.loop(timestamp));
	}

	// --- System Generation ---
	generateSystem(system) {
		this.simTimeSeconds = 0;
		this.currentSystem = system;
		this.bodyList.length = 0;
		this.trackedBody = null;

		const scan = (body) => {
			let sma_max = 0;

			let pair_max = 0;
			if (body instanceof types.BinaryStar) {
				const sma_1 = scan(body.primary);
				const sma_2 = scan(body.secondary);
				pair_max = body.primary.sma.getValueAs(types.units.Dist.m) + Math.max(sma_1, sma_2);
			}

			let local_max = 0;
			for (const child in body.bodies) {
				let childSma = body.bodies[child].sma.getValueAs(types.units.Dist.m) + scan(body.bodies[child]);
				if (childSma > local_max) local_max = childSma;
			}

			sma_max = Math.max(pair_max, local_max);

			body.systemRadius = sma_max;

			return sma_max;
		}

		const minRadius = this.currentSystem.bodies[0].radius.getValueAs(types.units.Dist.m) * 10;
		this.systemMaxRadius = Math.max(minRadius, scan(this.currentSystem.bodies[0]));

		const minScreenDimension = Math.min(this.canvas.width, this.canvas.height);
		this.systemBroadViewScale = (this.systemMaxRadius * 2 * 1.25) / minScreenDimension;
		this.targetMetersPerPixel = this.systemBroadViewScale;
		this.metersPerPixel = this.systemBroadViewScale;

		const initBodies = (body) => {
			body.position = {
				local: { x: 0, y: 0, z: 0 },
				absolute: { x: 0, y: 0, z: 0 },
				relative: { x: 0, y: 0, z: 0 },
				screen: { x: 0, y: 0, z: 0 }
			}
			body.sim = {
				radius: body.radius.getValueAs(types.units.Dist.m),
				radius_atm: (body instanceof types.Planet)
					? Math.max(
							body.radius.getValueAs(types.units.Dist.m) + (body.atmosphere.scaleHeight * 3.5 * 1000),
							body.radius.getValueAs(types.units.Dist.m) + 1
						)
					: 0,
				lum_avg: 0,
				hover: false,
				cursorDist: Infinity,
				trail: [],
				isSystem: false,
			}
			setDrawFunctions(body, this);

			if (body instanceof types.Binary) {
				body.sim.radius = 500 * 1000;
				body.sim.isSystem = true;

				initBodies(body.primary);
				initBodies(body.secondary);
			}
			else {
				if (body.bodies.length > 0) {
					body.sim.isSystem = true;
				}
			}

			this.bodyList.push(body);

			body.bodies.forEach(child => initBodies(child));
		}
		initBodies(this.currentSystem.bodies[0]);

		document.getElementById('totalCountDisplay').innerText = this.bodyList.length;
		document.getElementById('maxRadiusDisplay').innerText = new types.Value(this.systemMaxRadius, types.units.Dist.m).getValueAs(types.units.Dist.AU).toFixed(1);
	}
	
	updateAbsolutePositions() {
		const update = (body, parentCoords) => {
			if (body.parentBody === null)
				body.position.local = { x: 0, y: 0, z: 0 };
			else
				body.position.local = getKeplerianPosition(body.orbit, this.simTimeSeconds);

			body.position.absolute = {
				x: parentCoords.x + body.position.local.x,
				y: parentCoords.y + body.position.local.y,
				z: parentCoords.z + body.position.local.z
			}

			if (body instanceof types.Binary) {
				update(body.primary, body.position.absolute);
				update(body.secondary, body.position.absolute);
			}
			body.bodies.forEach(child => update(child, body.position.absolute));
		};

		if (this.currentSystem !== null)
			update(this.currentSystem.bodies[0], { x: 0, y: 0, z: 0});
	}

	updateRelativePositions() {
		const update = (body) => {
			body.position.relative = {
				x: body.position.absolute.x - this.cameraPosition.x,
				y: body.position.absolute.y - this.cameraPosition.y,
				z: body.position.absolute.z - this.cameraPosition.z
			}

			body.position.screen = {
				x:  (this.canvas.width / 2) + (body.position.relative.x / this.metersPerPixel),
				y: (this.canvas.height / 2) - (body.position.relative.y / this.metersPerPixel),
				z: 0
			}

			if (body instanceof types.Binary) {
				update(body.primary, body.position.absolute);
				update(body.secondary, body.position.absolute);
			}
			body.bodies.forEach(child => update(child));
		};

		if (this.currentSystem !== null)
			update(this.currentSystem.bodies[0]);
	}

	/**
	 * 
	 * @param {InputEvent} e 
	 */
	updateWarpSpeed(e) {
		const timeUnits = Object.freeze({
			Hour: 3600,
			Day: 86400,
			Year: 31557600
		});
		
		const val = parseFloat(this.warpSlider.value);
		this.timeMultiplier = Math.pow(10, val);
		
		if (this.timeMultiplier < timeUnits.Hour)
			this.warpDisplay.innerText = `${Math.round(this.timeMultiplier)} sec/sec`;
		else if (this.timeMultiplier < timeUnits.Day)
			this.warpDisplay.innerText = `${(this.timeMultiplier / timeUnits.Hour).toFixed(1)} hours/sec`;
		else if (this.timeMultiplier < timeUnits.Year)
			this.warpDisplay.innerText = `${(this.timeMultiplier / timeUnits.Day).toFixed(1)} days/sec`;
		else
			this.warpDisplay.innerText = `${(this.timeMultiplier / timeUnits.Year).toFixed(1)} years/sec`;
	}

	/**
	 * 
	 * @param {UIEvent} e 
	 */
	resizeCanvas(e) {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;

		this.shadowCanvas.width = window.innerWidth;
		this.shadowCanvas.height = window.innerHeight;

		this.lightCanvas.width = window.innerWidth;
		this.lightCanvas.height = window.innerHeight;
	}

	/**
	 * 
	 * @param {PointerEvent} e 
	 */
	handleClick(e) {
		// Check if clicked element was inside UI panel bounding rect
		const uiPanel = document.getElementById('ui-panel');
		const rect = uiPanel.getBoundingClientRect();
		if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
			return; 
		}

		let clickedBody = null;
		let closestDist = this.hoverThreshold; // Click selection radius in pixels

		for (let body of this.bodyList) {
			const coords = body.position.screen;
			let dist = Math.hypot(e.clientX - coords.x, e.clientY - coords.y) - (body.sim.radius / this.metersPerPixel);
			if (dist < closestDist) {
				closestDist = dist;
				clickedBody = body;
			}
		}

		this.cameraPositionTransition = 0;
		if (clickedBody) {
			// Dynamically adjust zoom
			if (this.trackedBody === null) {
				this.targetMetersPerPixel = (2 * clickedBody.radius.getValueAs(types.units.Dist.m)) / Math.min(this.canvas.width, this.canvas.height) * 25;
			}
			this.trackedBody = clickedBody;
		}
		else {
			// Space clicked: restore system view
			this.trackedBody = null;
			this.targetMetersPerPixel = this.systemBroadViewScale;
		}
	}

	/**
	 * 
	 * @param {MouseEvent} e 
	 */
	onMouseMove(e) {
		this.cursorX = e.clientX;
		this.cursorY = e.clientY;
	}

	/**
	 * 
	 * @param {WheelEvent} e 
	 */
	handleWheel(e) {
		e.preventDefault(); // Prevent standard browser page scrolling

		// Determine zoom factor multiplier (scrolling up zooms in, down zooms out)
		const zoomFactor = e.deltaY < 0 ? 0.97 : 1.03;
		
		// Scale the target metric
		let nextZoom = this.targetMetersPerPixel ** zoomFactor;

		// Boundary constraints: Prevents scrolling infinitely outwards or breaking floating math limit boundaries
		const maxZoomOut = this.systemBroadViewScale * 4;
		const maxZoomIn = 10 * 1000; 

		this.targetMetersPerPixel = utils.clamp(nextZoom, maxZoomIn, maxZoomOut);
	}

	updateCamera(dT) {
		this.metersPerPixel += (this.targetMetersPerPixel - this.metersPerPixel) * Math.sqrt(dT);

		if (this.trackedBody) {
			this.targetCameraPosition.x = this.trackedBody.position.absolute.x;
			this.targetCameraPosition.y = this.trackedBody.position.absolute.y;
			this.targetCameraPosition.z = this.trackedBody.position.absolute.z;
		}
		else {
			this.targetCameraPosition.x = 0;
			this.targetCameraPosition.y = 0;
			this.targetCameraPosition.z = 0;
		}

		this.cameraPositionTransition = this.cameraPositionTransition + Math.sqrt(1 - this.cameraPositionTransition) * dT;
		if (this.cameraPositionTransition > 0.99999) this.cameraPositionTransition = 1;

		this.cameraPosition.x += (this.targetCameraPosition.x - this.cameraPosition.x) * this.cameraPositionTransition;
		this.cameraPosition.y += (this.targetCameraPosition.y - this.cameraPosition.y) * this.cameraPositionTransition;
		this.cameraPosition.z += (this.targetCameraPosition.z - this.cameraPosition.z) * this.cameraPositionTransition;
	}

	loop(timestamp) {
		if (!this.lastRealTime) this.lastRealTime = timestamp;
		let realDt = (timestamp - this.lastRealTime) / 1000;
		this.lastRealTime = timestamp;

		if (realDt > 0.1) realDt = 0.1; 
		const simDt = realDt * this.timeMultiplier;
		this.simTimeSeconds += simDt;

		this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
		
		this.updateAbsolutePositions();

		this.updateCamera(realDt);

		this.updateRelativePositions();

		let closestDist = this.hoverThreshold; // Click selection radius in pixels
		let hoveredBody = null;

		for (let body of this.bodyList) {
			body.sim.hover = false;
			const coords = body.position.screen;
			let dist = Math.hypot(this.cursorX - coords.x, this.cursorY - coords.y) - body.sim.radius_vis;
			body.sim.cursorDist = dist;
			if (dist < closestDist) {
				closestDist = dist;
				hoveredBody = body;
			}
		}

		if (hoveredBody !== null) hoveredBody.sim.hover = true;

		if (this.currentSystem !== null)
			this.bodyList.forEach(body => {
			body.drawBody();
		});

		requestAnimationFrame((timestamp) => this.loop(timestamp));
	}
}

const renderer = new Renderer();
