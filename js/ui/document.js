
import * as T from "../data/types.js";

export function saveDocument() {
	console.log(window.apoapsis_system)
	if (!window.apoapsis_system)
		return;

	const date = (new Date()).toISOString();

	const data = generateDocument(date);
	const blob = new Blob([data], { type: "text/html" });
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = `System ${date}.html`;
	link.click();
	URL.revokeObjectURL(link.href);
}

function generateDocument(date) {
	const partFirst = `<!DOCTYPE html>
<html lang="en">
<head>
	<title>Star System</title>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
	
	</style>
</head>

<body>
<main>`;

	const navigation = document.getElementById('navigation');
	
	let bodies = '';
	const scan = (body) => {
		bodies += body.sim.profile.outerHTML + '<br><hr><br>';
		
		if (body instanceof T.Binary) {
			scan(body.primary);
			scan(body.secondary);
		}
		
		for (const child in body.bodies) {
			scan(body.bodies[child]);
		}
	}
	window.apoapsis_system.bodies.forEach(body => { scan(body); });

	const partLast = `</main>
</body>
</html>`;

	const fullDocument = partFirst + navigation.outerHTML + bodies + partLast;

	return fullDocument;
}
