const selector = document.getElementById('script-select');
let selectorData = null;

const scriptTextarea = document.getElementById('predicate');

selector.addEventListener('change', event => {
	handleScriptChange(event.target.value);
});

async function handleScriptChange(id) {
	const options = Array.from(document.getElementsByTagName('option'));
	const selected = options.find(opt => { return opt.value === id });

	if (selected && id) {
		const response = await fetch(`../../filters/${id}.js`);
		scriptTextarea.value = await response.text();
	}
	else {
		scriptTextarea.value = '';
	}
}

async function initSelector() {
	try {
		const response = await fetch(`../../filters/_filters.json`);

		if (!response.ok) {
			console.error(`JSON loading error: ${response.status}`);
			return;
		}

		const optionsContainer = document.getElementById('select-options');

		selectorData = await response.json();
		selectorData.forEach(group => {
			const optionGroup = document.createElement('optgroup');
			optionGroup.label = group.thumb + group.groupName;

			group.scripts.forEach(item => {
				const option = document.createElement('option');

				// Metadata
				option.value = `${item.script}`;

				const thumb = document.createElement('span');
				thumb.classList.add('script-thumb');
				thumb.innerHTML = item.thumb;
				option.appendChild(thumb);

				const name = document.createElement('q');
				name.classList.add('script-name');
				name.innerHTML = item.name;
				option.appendChild(name);

				const desc = document.createElement('i');
				desc.classList.add('script-desc');
				desc.innerHTML = item.desc;
				option.appendChild(desc);

				optionGroup.appendChild(option);
			});

			optionsContainer.appendChild(optionGroup);
		});
		selectorData.forEach(item => {
			
		});
	}
	catch (error) {
		console.error(error);
	}
}

initSelector();
