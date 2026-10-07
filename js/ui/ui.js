
import eventBus from "../dependencies/event-bus.js";
import events from "../data/events.js";

import Toastify from '../dependencies/toastify-es.js';

import "./settings.js";
import { saveDocument } from "./document.js";
import "./script-selector.js";
import * as T from "../data/types.js";

//#region | Toasts

function showNoSystemToast() {
	Toastify({
		text: "The system hasn't been generated yet!",
		duration: 3000,
		position: 'center',
		gravity: 'top',
		style: {
			color: 'var(--col-main)',
			background: 'var(--col-background)',
			border: '1px solid var(--col-main)',
			borderRadius: 'var(--corner-radius)'
		}
	}).showToast();
}

function showSystemFoundToast() { 
	Toastify({
		text: "Succesfully generated a system that meets the conditions.",
		duration: 3000,
		position: 'center',
		gravity: 'top',
		style: {
			color: 'var(--col-main)',
			background: 'var(--col-background)',
			border: '1px solid limegreen',
			borderRadius: 'var(--corner-radius)'
		}
	}).showToast();
}

function showSystemNotFoundToast() {
	Toastify({
		text: "Failed to generate a system that meets the conditions.",
		duration: 3000,
		position: 'center',
		gravity: 'top',
		style: {
			color: 'var(--col-main)',
			background: 'var(--col-background)',
			border: '1px solid crimson',
			borderRadius: 'var(--corner-radius)'
		}
	}).showToast();
}

eventBus.on(events.Generator.Generation.Completed, (cb) => {
	if (cb.status === 'found')
		showSystemFoundToast();
	else if (cb.status === 'not_found')
		showSystemNotFoundToast();
});

//#endregion

//#region | Tabs setup

const tabContent = document.querySelectorAll('.tabContent');
const tabButtons = document.querySelectorAll('.tabButton');

function openTab(evt, tabName) {
	if (!evt.currentTarget.classList.contains('active')) {
		closeTab();
		evt.currentTarget.className += " active";
		document.getElementById(tabName).className += " active";
	}
}

function closeTab() {
	tabContent.forEach(section => { section.classList.remove('active'); });
	tabButtons.forEach(tab => { tab.classList.remove('active'); });
}

// Tabs initiation
for (let i = 0; i < tabButtons.length; i++) {
	tabButtons[i].addEventListener('click', () => { openTab(event, tabButtons[i].name); });

	if (i === 0)
		tabButtons[i].click();
}

//#endregion

const systemLoader = document.getElementById('systemLoader');
const settingsLoader = document.getElementById('settingsLoader');

// System load upon file select handle
systemLoader.addEventListener('change', async () => {
	if (!systemLoader.files.length) {
		return;
	}

	const data = await systemLoader.files[0].text();

	const classMap = {
		'Star': T.Star,
		'Planet': T.Planet,
		'BinaryStar': T.BinaryStar,
		'BinaryPlanet': T.BinaryPlanet,
		'Value': T.Value,
	};

	function reviver(key, value) {
		if (value && typeof value === 'object' && value.$type && classMap[value.$type]) {
			Object.setPrototypeOf(value, classMap[value.$type].prototype);
		}
		return value;
	}

	const loadedSystem = JSON.retrocycle(JSON.parse(data, reviver));
	eventBus.emit(events.Generator.Generation.Completed, { data: loadedSystem });
});

// Settings load upon file select handle
settingsLoader.addEventListener('change', async () => {
	if (!settingsLoader.files.length)
		return;

	const data = await settingsLoader.files[0].text();
	const settings = JSON.parse(data);

	const inputs = Array.from(document.getElementsByTagName('input'));
	inputs.forEach(input => {
		const setting = input.name.replace('settings_', '');

		if (settings[setting] !== undefined) {
			switch (input.type) {
				case 'checkbox': input.checked = settings[setting];

				default: input.value = settings[setting];
			}
			input.dispatchEvent(new Event('input'));
		}
	});

	const seed = document.getElementById('gen_seed');
	seed.value = settings.seed_user ? settings.seed_user : settings.seed;
	seed.dispatchEvent(new Event('input'));
});

// Click event emitting for buttons
const buttons = Array.from(document.getElementsByTagName('button'));
buttons.forEach(button => {
	button.addEventListener('click', (e) => {
		eventBus.emit(events.UI.ButtonClick, { data: e.target });
	});
});

eventBus.on(events.UI.ButtonClick, (cb) => handleButtonClick(cb.data));

/**
 * @param {HTMLButtonElement} button 
 */
function handleButtonClick(button) {
	if (button.classList.contains('toggle'))
		button.classList.toggle('on');
	else if (button.classList.contains('multitoggle'))
		button.dataset.currentSetting = String((Number(button.dataset.currentSetting) + 1) % Number(button.dataset.settings));

	switch (button.name) {
		case 'generate': {
			eventBus.emit(events.Generator.Generation.Start);
			break;
		}
		
		case 'settings': {
			const settings = document.getElementById('generatorSettings');
			settings.classList.toggle('open');
			break;
		}

		case 'document': {
			if (!window.apoapsis_system) {
				showNoSystemToast();
			}
			else {
				saveDocument();
			}
			break;
		}

		case 'save': {
			saveSystem();
			break;
		}

		case 'load': {
			systemLoader.click();
			break;
		}

		case 'copySeed': {
			copySeed();
			break;
		}

		case 'resetSeed': {
			const seed = document.getElementById('gen_seed');
			seed.placeholder = seed.value;
			seed.value = '';
			seed.dispatchEvent(new Event('input'));

			break;
		}

		case 'saveSettings': {
			saveSettings();
			break;
		}

		case 'loadSettings': {
			settingsLoader.click();
			break;
		}

		case 'navigation': 
		case 'inspector': {
			button.innerHTML = button.classList.contains('on')
				? `${button.innerText} ${button.name.charAt(0).toUpperCase() + button.name.slice(1)}` 
				: button.innerText.slice(0, 2);
			const targetPanel = document.getElementById(button.name);
			targetPanel.classList.toggle('closed');
			break;
		}

		case 'pause':
			button.innerHTML = button.classList.contains('on') ? '▶️' : '⏸️';
		case 'setting_enableLighting':
		case 'setting_applyHDR':
		case 'setting_showMagnetospheres':
		case 'setting_showAtmospheres':
		case 'setting_showGrid':
		case 'setting_showHabitableZone':
		case 'setting_showStarsCorona':
		case 'setting_trueStarsRotation':
		case 'setting_applyScaling':
		case 'setting_showMarkers':
		case 'setting_keepUIVisibile': {
			eventBus.emit(events.UI.SettingToggle, { setting: button.name, value: button.classList.contains('on') });
			break;
		}

		case 'setting_drawTrails': {
			switch (Number(button.dataset.currentSetting)) {
				case 0: button.innerHTML = '⚫'; break;
				case 1: button.innerHTML = '💫'; break;
				case 2: button.innerHTML = '🌠'; break;
			}
			eventBus.emit(events.UI.SettingToggle, { setting: button.name, value: Number(button.dataset.currentSetting) });
			break;
		}
	}
}

function saveSystem() {
	if (!window.apoapsis_system) {
		showNoSystemToast();
		return;
	}
	
	// Making a copy of the generated system.
	// Using decycle + retrocycle to get rid of circular references.
	const systemSaved = JSON.retrocycle(JSON.parse(
		JSON.stringify(JSON.decycle(window.apoapsis_system))
	));
	
	// Deleting unnecessary properties
	const optimize = (body) => {
		delete body.planetEvolution;
		delete body.sim;
		delete body.systemRadius;
		delete body.position;
		delete body.renderer;

		// ---

		if (body.$type.includes('Binary')) {
			optimize(body.primary);
			optimize(body.secondary);
		}
		body.bodies.forEach(child => { 
			optimize(child);
		});
	}
	systemSaved.bodies.forEach(body => { optimize(body) });

	// Saving the system into a file
	const data = JSON.stringify(JSON.decycle(systemSaved), null, '\t');
	const blob = new Blob([data], { type: "application/json" });
	
	const timestamp = (new Date()).toISOString();
	
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = `Apoapsis System ${timestamp}.json`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function saveSettings() {
	const data = JSON.stringify(window.apoapsis_generator.settings, null, '\t');
	const blob = new Blob([data], { type: "application/json" });
	
	const timestamp = (new Date()).toISOString();
	
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = `Apoapsis Settings ${timestamp}.json`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function copySeed() {
	const seed = document.getElementById('gen_seed');
	const value = seed.value ? seed.value : seed.placeholder;

	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard.writeText(value);
	}
	else {
		const textArea = document.createElement('textarea');
		textArea.value = value;
		
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		
		textArea.focus();
		textArea.select();
		
		new Promise((resolve, reject) => {
			try {
				const successful = document.execCommand('copy');
				document.body.removeChild(textArea);
				if (successful) {
					resolve();
				} else {
					reject(new Error('Failed to copy text.'));
					alert('Failed to copy text. Copy the seed manually, or save the config and retrieve the seed from there.');
				}
			} catch (err) {
				document.body.removeChild(textArea);
				reject(err);
				alert('Failed to copy text. Copy the seed manually, or save the config and retrieve the seed from there.');
			}
		});
	}
}

//#region | Outbound URL setup

const defaultUrl = `https://github.com/RedReaper420/apoapsis`;

const outboundUrlPrompt = document.getElementById('outboundPage');
const outboundButton = document.getElementById('outboundButton');

fetch('home_url.txt')
.then(response => {
	if (response.ok) {
		return response.text();
	}
	else {
		console.error(response.status);
		return defaultUrl;
	}
})
.then(response => {
	outboundUrlPrompt.innerText = response;
	outboundButton.href = response;
});

//#endregion
