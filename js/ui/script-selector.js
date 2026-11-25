
const selector = document.getElementById('script-select');
let selectorData = null;

selector.addEventListener('change', event => {
	handleScriptChange(event.target.value);
});

const scriptTextarea = document.getElementById('predicate');
const preTextarea = document.getElementById('pregen');
const postTextarea = document.getElementById('postgen');

let scriptRequestId = 0;

async function handleScriptChange(id) {
	const requestId = ++scriptRequestId;
	const options = Array.from(document.getElementsByTagName('option'));
	const selected = options.find(opt => { return opt.value === id });

	if (!selected || !id) {
		// Flush scripts
		scriptTextarea.value = '';
		preTextarea.value = '';
		postTextarea.value = '';
		return;
	}

	const load = async (name) => {
		const response = await fetch(`./filters/${name}?t=${Date.now()}`, { cache: 'no-store' });
		if (!response.ok) {
			console.error(`Script loading error: ${response.status}`);
			return '';
		}
		return response.text();
	};

	// Load and set search script
	const predicatePromise = load(`${id}.js`);
	const prePromise = selected.dataset.pre === 'true' ? load(`${id}.pre.js`) : Promise.resolve('');
	const postPromise = selected.dataset.post === 'true' ? load(`${id}.post.js`) : Promise.resolve('');

	const [predicate, pre, post] = await Promise.all([predicatePromise, prePromise, postPromise]);

	// A newer selection may have finished while these requests were in flight.
	if (requestId !== scriptRequestId)
		return;

	scriptTextarea.value = predicate;
	preTextarea.value = pre;
	postTextarea.value = post;
}

async function initSelector() {
	try {
		const response = await fetch(`./filters/_filters.json?t=${Date.now()}`, { cache: 'no-store' });

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
