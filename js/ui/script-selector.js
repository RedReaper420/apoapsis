
const selector = document.getElementById('script-select');
let selectorData = null;

selector.addEventListener('change', event => {
	handleScriptChange(event.target.value);
});

const scriptTextarea = document.getElementById('predicate');
const preTextarea = document.getElementById('pregen');
const postTextarea = document.getElementById('postgen');

async function handleScriptChange(id) {
	const options = Array.from(document.getElementsByTagName('option'));
	const selected = options.find(opt => { return opt.value === id });

	if (selected && id) {
		// Load and set search script
		const response_predicate = await fetch(`./filters/${id}.js`);
		scriptTextarea.value = await response_predicate.text();

		// Load and set pre-gen script
		if (selected.dataset.pre === 'true') {
			const response_pre = await fetch(`./filters/${id}.pre.js`);
			preTextarea.value = await response_pre.text();
		}
		else {
			preTextarea.value = '';
		}

		// Load and set post-gen script
		if (selected.dataset.post === 'true') {
			const response_post = await fetch(`./filters/${id}.post.js`);
			postTextarea.value = await response_post.text();
		}
		else {
			postTextarea.value = '';
		}
	}
	else {
		// Flush scripts
		scriptTextarea.value = '';
		preTextarea.value = '';
		postTextarea.value = '';
	}
}

async function initSelector() {
	try {
		const response = await fetch(`./filters/_filters.json`);

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
				option.dataset.pre = String(item.pre);
				option.dataset.post = String(item.post);

				// "Thumbnail"
				const thumb = document.createElement('span');
				thumb.classList.add('script-thumb');
				thumb.innerHTML = item.thumb;
				option.appendChild(thumb);

				// Script name
				const name = document.createElement('q');
				name.classList.add('script-name');
				name.innerHTML = item.name;
				option.appendChild(name);

				// Script description
				const desc = document.createElement('i');
				desc.classList.add('script-desc');
				desc.innerHTML = item.desc;
				option.appendChild(desc);

				// Rarity
				const rarity = document.createElement('sub');
				rarity.classList.add('script-desc');
				rarity.innerText = '1/' + item.rarity;
				option.appendChild(rarity);

				optionGroup.appendChild(option);
			});

			optionsContainer.appendChild(optionGroup);
		});
	}
	catch (error) {
		console.error(error);
	}
}

initSelector();
