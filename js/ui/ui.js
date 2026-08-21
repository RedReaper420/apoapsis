
import {events, eventBus} from "../utils/eventbus.js";
import * as settings from "./settings.js";

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

const buttons = Array.from(document.getElementsByTagName('button'));
buttons.forEach(button => {
	button.addEventListener('click', (e) => {
		eventBus.emit('UI:ButtonClick', { data: e.target });
	});
});

eventBus.on('UI:ButtonClick', (cb) => handleButtonClick(cb.data));

/**
 * 
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
		case 'setting_showOceans':
		case 'setting_showGrid':
		case 'setting_showHabitableZone':
		case 'setting_showStarsCorona':
		case 'setting_trueStarsRotation':
		case 'setting_applyScaling':
		case 'setting_showMarkers':
		case 'setting_keepUIVisibile': {
			eventBus.emit('UI:SettingToggle', { setting: button.name, value: button.classList.contains('on') });
			break;
		}

		case 'setting_drawTrails': {
			switch (Number(button.dataset.currentSetting)) {
				case 0: button.innerHTML = '💫'; break;
				case 1: button.innerHTML = '🌠'; break;
				case 2: button.innerHTML = '⚫'; break;
			}
			eventBus.emit('UI:SettingToggle', { setting: button.name, value: Number(button.dataset.currentSetting) });
			break;
		}
	}
}
