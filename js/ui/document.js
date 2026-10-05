
import * as T from "../data/types.js";

export function saveDocument() {
	const data = generateDocument();
	const blob = new Blob([data], { type: "text/html" });
	
	const timestamp = (new Date()).toISOString();
	
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = `Apoapsis System Report ${timestamp}.html`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function generateDocument() {
	const partFirst = `<!DOCTYPE html>
<html lang="en">
<head>
	<title>Star System</title>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		:root {
			--col-main: hsl(41, 100%, 87%);
			--col-main-dim: hsl(41, 62%, 70%, 50%);
			--col-alt: hsl(41, 100%, 95%);
			--col-background: #0808087f;

			--transition-speed-fast:   0.25s;
			--transition-speed-medium: 0.33s;
			--transition-speed-slow:   0.50s;

			--corner-radius: 0.33em;
			--corner-radius-big: 0.67em;
		}

		html {
			font-size: 16px;
			font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
			color: var(--col-main);
			background-color: #090909;
			scroll-behavior: smooth;
			box-sizing: border-box;
		}

		*,
		*::before,
		*::after {
			box-sizing: inherit;
		}
		
		body {
			margin: 1em;
			padding: 0;
		}

		a {
			color: var(--col-alt);
		}

		/* Navigation tree */

		.tree {
			--spacing: round(down, 1.25em, 2px);
			--radius: 0.2em;
			--color: var(--col-main);
			padding-inline-start: 0;
			user-select: none;
		}

		.tree li {
			display: block;
			position: relative;
			padding-left: calc(2 * var(--spacing) - var(--radius) - 2px);
		}

		.tree ul {
			margin-left: calc(var(--radius) - var(--spacing));
			padding-left: 0;
		}

		.tree ul li {
			border-left: 2px solid var(--color);
		}

		.tree ul li:last-child {
			border-color: transparent;
		}

		.tree ul li::before {
			content: '';
			display: block;
			position: absolute;
			top: calc(var(--spacing) / -2);
			left: -2px;
			width: calc(var(--spacing) + 2px);
			height: calc(var(--spacing) + 1px);
			border: solid var(--color);
			border-width: 0 0 2px 2px;
		}

		.tree li::after {
			content: '';
			display: block;
			position: absolute;
			top: calc(var(--spacing) / 2 - var(--radius));
			left: calc(var(--spacing) - var(--radius) - 1px);
			width: calc(2 * var(--radius));
			height: calc(2 * var(--radius));
			border-radius: 50%;
			background: var(--color);
		}

		.body {
			&.active {
				text-shadow: 0 0 1.0em white;
				font-weight: bold;
			}
		}
		.body::before {
			content: '';
			position: relative;
			right: 0.25em;
			text-shadow: 0 0 0.1em white, 0 0 0.25em white;
		}
		.binary::before {
			content: '♋';
		}
		.star::before {
			content: '☀️';
		}
		.giant::before {
			content: '🪐';
		}
		.planet::before {
			content: '🌑';
		}

		hr {
			height: 1px;
			border: none;
			margin: 1em 0;
			background: linear-gradient(to right, transparent 0%, var(--col-main) 50%, transparent 100%);
		}

		details {
			margin: 0.5em 0;
		}

		summary {
			font-weight: bold;
			margin: 0.25em;
		}

		table {
			width: 100%;
		}

		th, td {
			padding: 0.25em;
		}

		th {
			text-align: right;
			width: 50%;
		}

		th[colspan="2"] {
			text-align: left;
		}

		/* Borders & Round corners */
		table {
			border-collapse: separate;
			border-spacing: 0;
			border-radius: var(--corner-radius);
		}
		table, th, td {
			border: 1px solid var(--col-main-dim);
		}
		th, td {
			border-left: none;
		}
		tr:first-child th,
		tr:first-child td {
			border-top: none;
		}
		tr:last-child th,
		tr:last-child td {
			border-bottom: none;
		}
		th:first-child,
		td:first-child {
			border-left: none;
		}
		th:last-child,
		td:last-child {
			border-right: none;
		}

		/* Alternating rows coloring */
		tr {
			background-color: hsla(38, 75%, 40%, 0.1);
		}
		tr:nth-of-type(2n) {
			background-color: transparent;
		}

		/* Tooltips */
		.tooltip {
			position: relative;
			display: inline-block;
			border-bottom: 1px dotted var(--col-main);
			text-shadow: none;
			cursor: help;
		}
		.tooltiptext {
			--width: 10em;
			
			font-size: 1rem;
			text-align: center;

			position: absolute;
			bottom: 125%;
			left: 50%;
			z-index: 10;
			
			width: var(--width);

			margin-left: calc(var(--width) / -2);
			padding: 0.2em 0;
			
			background-color: #000000bf;
			color: var(--col-main);
			text-shadow: none;

			border: 1px solid var(--col-main);
			border-radius: var(--corner-radius);
			
			visibility: hidden;
		}
		.tooltip:hover .tooltiptext {
			visibility: visible;
		}
		.tooltiptext::after {
			content: "";

			position: absolute;
			top: 100%;
			left: 50%;

			margin-left: -0.5em;
			border-width: 0.5em;
			border-style: solid;
			border-color: var(--col-main) transparent transparent transparent;
		}
		@media (orientation: portrait) {
			.tooltiptext {
				--width: 6em;
			}
		}

		.progressbar {
			display: inline-flex;
			justify-content: space-between;
			overflow: hidden;
			width: 50%;
			height: 0.5em;
			background-color: var(--col-background);
			border: 1px solid var(--col-main);
			border-radius: var(--corner-radius);
		}

		.progressbar-fill {
			width: 0%;
			background-color: var(--col-main);
		}

		textarea {
			font-family: 'Courier New', Courier, monospace;
			font-size: 1em;

			border-radius: var(--corner-radius);
			color: var(--col-alt);
			background-color: var(--col-background);
			width: 100%;
		}
	</style>
</head>

<body>
<main>`;

	const navigation = document.getElementById('navigation').cloneNode(true);
	const bodyList = Array.from(navigation.getElementsByClassName('body'));
	bodyList.forEach(el => {
		el.innerHTML = `<a href='#${el.dataset.id}'>${el.innerText}</a>`
	});
	
	let bodies = '';
	const scan = (body) => {
		bodies += `<br><h1 id='${body.sim.navMark.dataset.id}'>${body.name}</h1>${body.sim.profile.outerHTML}<br><hr>`;
		
		// ---

		if (body instanceof T.Binary) {
			scan(body.primary);
			scan(body.secondary);
		}
		
		for (const child in body.bodies) {
			scan(body.bodies[child]);
		}
	}
	window.apoapsis_system.bodies.forEach(body => { scan(body); });

	const debug = `<details><summary>Generation Info</summary>
<textarea cols="120" rows="40">
${JSON.stringify(window.apoapsis_system.settings, null, '\t')}
</textarea>
</details>
	`;

	const partLast = `</main>
</body>
</html>`;

	const fullDocument = partFirst + navigation.outerHTML + bodies + debug + partLast;

	return fullDocument;
}
