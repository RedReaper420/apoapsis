
import * as utils from "../utils/utils.js";
import { events, eventBus } from "../utils/eventbus.js";
import * as T from "../data/types.js";
import { getKeplerianPosition } from "./kepler.js";
import { setDrawFunctions } from "./body-drawers.js";
import * as inspector from "../ui/inspector.js";
import generateIslandMap from "./islands-gen.js";

class Renderer {
	constructor () {
		this.canvas = document.getElementById('simCanvas');
		this.ctx = this.canvas.getContext('2d');

		this.bodyCanvas = document.createElement('canvas');
		this.bodyCtx = this.bodyCanvas.getContext('2d');

		this.shadowCanvas = document.createElement('canvas');
		this.shadowCtx = this.shadowCanvas.getContext('2d');

		this.lightCanvas = document.createElement('canvas');
		this.lightCtx = this.lightCanvas.getContext('2d');

		this.canvases = [
			this.canvas, 
			this.bodyCanvas,
			this.shadowCanvas,
			this.lightCanvas
		];

		// --- Simulation Variables ---
		this.simTimeSeconds = 0;
		this.timeMultiplier = 86400;
		this.pause = false;
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

		this.setting_enableLighting = true;
		this.setting_applyHDR = true;
		this.setting_showMagnetospheres = true;
		this.setting_showAtmospheres = true;
		this.setting_showHabitableZone = false;
		this.setting_showStarsCorona = true;
		this.setting_trueStarsRotation = true;
		this.setting_showGrid = false;
		this.setting_applyScaling = true;
		this.setting_showMarkers = true;

		this.setting_drawTrails = 0;

		this.setting_keepUIVisibile = true;
		this.idle = 0;
		this.idleMax = 1.0;

		this.uiElements = Array.from(document.getElementsByClassName('ui'));

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

		eventBus.on('UI:SettingToggle', (cb) => { 
			this[cb.setting] = cb.value; 
		});

		this.bodyListElement = document.getElementById('bodyList');
		this.bodyListElement.addEventListener('click', (e) => {
			const target = e.target.closest('[data-id]');
			if (!target) return;

			const bodyId = Number(target.dataset.id);
			const body = this.bodyList[bodyId];

			this.cameraPositionTransition = 0;
			this.focusOnBody(body, true);

		});
		this.trackedBodyElement = null;
	}



	// --- System Generation ---
	generateSystem(system) {
		this.simTimeSeconds = 0;
		this.currentSystem = system;
		this.bodyList.length = 0;
		this.trackedBody = null;
		this.trackedBodyElement = null;

		const inspectorEl = document.getElementById('inspector');
		inspectorEl.innerHTML = '';

		const scan = (body) => {
			let sma_max = 0;

			let pair_max = 0;
			if (body instanceof T.BinaryStar) {
				const sma_1 = scan(body.primary);
				const sma_2 = scan(body.secondary);
				pair_max = body.primary.sma.as(T.units.Dist.m) + Math.max(sma_1, sma_2);
			}

			let local_max = 0;
			for (const child in body.bodies) {
				let childSma = body.bodies[child].sma.as(T.units.Dist.m) + scan(body.bodies[child]);
				if (childSma > local_max) local_max = childSma;
			}

			sma_max = Math.max(pair_max, local_max);

			body.systemRadius = sma_max;

			return sma_max;
		}

		const minRadius = this.currentSystem.bodies[0].radius.as(T.units.Dist.m) * 10;
		this.systemMaxRadius = Math.max(minRadius, scan(this.currentSystem.bodies[0]));

		const minScreenDimension = Math.min(this.canvas.width, this.canvas.height);
		let bodyCount = 0;
		this.systemBroadViewScale = (this.systemMaxRadius * 2 * 1.25) / minScreenDimension;
		this.targetMetersPerPixel = this.systemBroadViewScale;
		this.metersPerPixel = this.systemBroadViewScale;

		let bodyIdCount = 0;
		const initBodies = (body) => {

			body.position = {
				local: { x: 0, y: 0, z: 0 },
				absolute: { x: 0, y: 0, z: 0 },
				relative: { x: 0, y: 0, z: 0 },
				screen: { x: 0, y: 0, z: 0 }
			}
			body.sim = {
				radius: body.radius.as(T.units.Dist.m),
				radius_atm: (body instanceof T.Planet)
					? Math.max(
							body.radius.as(T.units.Dist.m) + (body.atmosphere.scaleHeight * 3.5 * 1000),
							body.radius.as(T.units.Dist.m) + 1
						)
					: 0,
				lum_avg: 0,
				hover: false,
				cursorDist: Infinity,
				trail: [],
				isSystem: false,
				islandMap: generateIslandMap(body.oceanColor || '#00000000', body.color, body.oceanCoverVisual || '0', body.landscape || undefined),
			}
			setDrawFunctions(body, this);

			const listItem = document.createElement('li');

			const bodyMark = document.createElement('span');
			bodyMark.classList.add('body', body instanceof T.Binary
				? 'binary'
				: body instanceof T.Star
					? 'star'
					: body.type !== T.planetTypes.Terrestrial
						? 'giant'
						: 'planet'
			);
			bodyMark.innerText = `${body.name}`;
			listItem.appendChild(bodyMark);

			if ((body instanceof T.Binary) || (body.bodies.length > 0)) {
				const listHolder = document.createElement('ul');
				listItem.appendChild(listHolder);
				
				if (body instanceof T.Binary) {
					body.sim.radius = 500 * 1000;
					body.sim.isSystem = true;

					listHolder.appendChild(initBodies(body.primary));
					listHolder.appendChild(initBodies(body.secondary));
				}
				else {
					if (body.bodies.length > 0) {
						body.sim.isSystem = true;
					}
				}
				
				body.bodies.forEach(child => listHolder.appendChild(initBodies(child)));
			}
			
			if (!(body instanceof T.Binary))
				bodyCount++;

			this.bodyList.push(body);

			bodyMark.dataset.id = String(bodyIdCount);
			bodyIdCount++;
			body.sim.navMark = bodyMark;

			body.sim.profile = inspector.generateProfile(body);

			return listItem;
		}

		this.bodyListElement.innerHTML = '';
		this.bodyListElement.appendChild(initBodies(this.currentSystem.bodies[0]));

		document.getElementById('systemType').innerText = system.type;
		document.getElementById('systemTotalBodies').innerText = bodyCount;
		document.getElementById('systemMaxRadius').innerText = new T.Value(this.systemMaxRadius, T.units.Dist.m).as(T.units.Dist.AU).toFixed(1);

		const systemAgeFit = utils.getFittingValue(
			this.bodyList[0].age,
			T.units.Time.s,
			[T.units.Time.y, T.units.Time.My, T.units.Time.Gy],
			0.5
		);
		document.getElementById('systemAgeValue').innerText = systemAgeFit.value.toFixed(2);
		document.getElementById('systemAgeUnit').innerText = systemAgeFit.unit;
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

			if (body instanceof T.Binary) {
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

			if (body instanceof T.Binary) {
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
		for (const canvas of this.canvases) {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		}
	}

	/**
	 * 
	 * @param {PointerEvent} e 
	 */
	handleClick(e) {
		// Check if clicked element was inside UI panel bounding rect
		/*
		const uiPanel = document.getElementById('ui-panel');
		const rect = uiPanel.getBoundingClientRect();
		if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
			return; 
		}
		*/

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
			this.focusOnBody(clickedBody);
		}
		else {
			// Space clicked: restore system view
			if (this.trackedBody !== null)
				this.trackedBody.sim.navMark.classList.remove('active');
			this.trackedBodyElement = null;

			this.trackedBody = null;
			
			this.targetMetersPerPixel = this.systemBroadViewScale;

			const inspectorEl = document.getElementById('inspector');
			inspectorEl.innerHTML = '';
		}
	}

	focusOnBody(body, refocus = false) {
		if (this.trackedBodyElement !== null)
			this.trackedBodyElement.classList.remove('active');
		this.trackedBodyElement = body.sim.navMark;
		this.trackedBodyElement.classList.add('active');

		if ((this.trackedBody === null) || refocus) {
			const radius = body instanceof T.Binary
				? body.primary.sma.as(T.units.Dist.m)
				: body.radius.as(T.units.Dist.m);
			const broadScale = body instanceof T.Binary
				? 1.25
				: 25;
			this.targetMetersPerPixel = (2 * radius) / Math.min(this.canvas.width, this.canvas.height) * broadScale;
		}
		this.trackedBody = body;
		
		const inspectorEl = document.getElementById('inspector');
		inspectorEl.innerHTML = '';
		inspectorEl.appendChild(body.sim.profile);
	}

	/**
	 * 
	 * @param {MouseEvent} e 
	 */
	onMouseMove(e) {
		this.cursorX = e.clientX;
		this.cursorY = e.clientY;
		this.idle = 0;
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
		this.simTimeSeconds += simDt * (!this.pause);

		if (this.setting_keepUIVisibile) this.idle = 0;
		else this.idle = Math.min(this.idleMax, this.idle + realDt);

		if (this.idle === this.idleMax)
			this.uiElements.forEach(el => { el.classList.add('hidden'); });
		else
			this.uiElements.forEach(el => { el.classList.remove('hidden'); });

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

		if (this.setting_showGrid)
			this.drawGrid();

		const fittingCellScale = utils.getFittingValue(
			new T.Value(this.metersPerPixel, T.units.Dist.m),
			T.units.Dist.m,
			[
				T.units.Dist.m, 
				T.units.Dist.km, 
				T.units.Dist.AU, 
				T.units.Dist.ly
			],
			(1/100) * 0.1
		);

		const cellValue = document.getElementById('cellValue');
		cellValue.innerText = (fittingCellScale.value * 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

		const cellUnit = document.getElementById('cellUnit');
		cellUnit.innerText = fittingCellScale.unit;
		
		requestAnimationFrame((timestamp) => this.loop(timestamp));
	}

	drawGrid() {
		this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
		const cellSize = 100;
		const cam_x = (-this.cameraPosition.x / this.metersPerPixel) % cellSize;
		const cam_y = (this.cameraPosition.y / this.metersPerPixel) % cellSize;
		
		for (let i = -Math.ceil(this.canvas.width / cellSize / 2); i <= Math.ceil(this.canvas.width / cellSize / 2); i++) {
			this.ctx.beginPath();
			const pos_x = this.canvas.width / 2 + i * cellSize + cam_x;
			const pos_y1 = -this.canvas.height / 2 + -cellSize + cam_y;
			const pos_y2 = this.canvas.height + cellSize + cam_y;
			this.ctx.moveTo(pos_x, pos_y1);
			this.ctx.lineTo(pos_x, pos_y2);
			this.ctx.stroke();
		}
		
		for (let j = -Math.ceil(this.canvas.height / cellSize / 2); j <= Math.ceil(this.canvas.height / cellSize / 2); j++) {
			this.ctx.beginPath();
			const pos_x1 = -this.canvas.width / 2 + -cellSize + cam_x;
			const pos_x2 = this.canvas.width + cellSize + cam_x;
			const pos_y = this.canvas.height / 2 + j * cellSize + cam_y;
			this.ctx.moveTo(pos_x1, pos_y);
			this.ctx.lineTo(pos_x2, pos_y);
			this.ctx.stroke();
		}
	}
}

const renderer = new Renderer();
