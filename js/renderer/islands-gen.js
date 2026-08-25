
import * as utils from "../utils/utils.js";

// --- Simplex Noise ---
const FastNoise = (() => {
	const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
	const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

	const p = new Uint8Array(256);
	for (let i = 0; i < 256; i++)
		p[i] = Math.floor(Math.random() * 256);
	
	const perm = new Uint8Array(512);
	const permMod12 = new Uint8Array(512);
	for (let i = 0; i < 512; i++) {
		perm[i] = p[i & 255];
		permMod12[i] = (perm[i] % 12);
	}

	const grad3 = new Float32Array([
		1,1, -1,1, 1,-1, -1,-1,
		1,0, -1,0, 1,0, -1,0,
		0,1, 0,-1, 0,1, 0,-1
	]);

	return {
		noise2D(xin, yin) {
			let n0, n1, n2;
			let s = (xin + yin) * F2;
			let i = Math.floor(xin + s);
			let j = Math.floor(yin + s);
			let t = (i + j) * G2;
			let X0 = i - t;
			let Y0 = j - t;
			let x0 = xin - X0;
			let y0 = yin - Y0;
			let i1, j1;
			if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
			let x1 = x0 - i1 + G2;
			let y1 = y0 - j1 + G2;
			let x2 = x0 - 1.0 + 2.0 * G2;
			let y2 = y0 - 1.0 + 2.0 * G2;
			let ii = i & 255;
			let jj = j & 255;
			let gi0 = permMod12[ii + perm[jj]];
			let gi1 = permMod12[ii + i1 + perm[jj + j1]];
			let gi2 = permMod12[ii + 1 + perm[jj + 1]];
			let t0 = 0.5 - x0 * x0 - y0 * y0;
			if (t0 < 0) n0 = 0.0;
			else { t0 *= t0; n0 = t0 * t0 * (grad3[gi0*2] * x0 + grad3[gi0*2+1] * y0); }
			let t1 = 0.5 - x1 * x1 - y1 * y1;
			if (t1 < 0) n1 = 0.0;
			else { t1 *= t1; n1 = t1 * t1 * (grad3[gi1*2] * x1 + grad3[gi1*2+1] * y1); }
			let t2 = 0.5 - x2 * x2 - y2 * y2;
			if (t2 < 0) n2 = 0.0;
			else { t2 *= t2; n2 = t2 * t2 * (grad3[gi2*2] * x2 + grad3[gi2*2+1] * y2); }
			return 70.0 * (n0 + n1 + n2); // [-1, 1]
		}
	};
})();

function hexToRgb(hex) {
	hex = hex.replace('#', '');
	hex = hex.length === 6 ? hex + 'ff' : hex;
	const hex_int = parseInt(hex, 16);

	return [ (hex_int >> 24) & 255, (hex_int >> 16) & 255, (hex_int >> 8) & 255, hex_int & 255 ];
}

export default function generateIslandMap(oceanColor, landColor, oceanCover, landscape = 0.005, size = 128) {
	const width = size;
	const height = size;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	const imgData = ctx.createImageData(width, height);
	const data = imgData.data;

	const rgbOcean = hexToRgb(oceanColor);
	const rgbLand = hexToRgb(landColor);
	
	const heights = new Float32Array(width * height);
	const scale = landscape;

	let index = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Fractal Noise / FBM
			let n = FastNoise.noise2D(x * scale, y * scale) * 1.0 +
					FastNoise.noise2D(x * scale * 2, y * scale * 2) * 0.5 +
					FastNoise.noise2D(x * scale * 4, y * scale * 4) * 0.25;
			
			const dx = (x / width) - 0.5;
			const dy = (y / height) - 0.5;
			const distanceFromCenter = Math.sqrt(dx * dx + dy * dy) * 2; // [0, ~1.41]
			
			n = n - Math.pow(distanceFromCenter, 1.5);

			heights[index++] = n;
		}
	}
	
	const sortedHeights = new Float32Array(heights).sort();
	const oceanThresholdIndex = Math.floor(oceanCover * sortedHeights.length);
	const threshold = sortedHeights[Math.min(oceanThresholdIndex, sortedHeights.length - 1)];
	
	let pixelIndex = 0;
	for (let i = 0; i < heights.length; i++) {
		const isOcean = heights[i] <= threshold;
		const color = isOcean ? rgbOcean : rgbLand;

		const rand = 0.975 + (1.025 - 0.975) * Math.random(); // Noise effect
		data[pixelIndex]     = utils.clamp(Math.floor(color[0] * rand), 0, 255); // R
		data[pixelIndex + 1] = utils.clamp(Math.floor(color[1] * rand), 0, 255); // G
		data[pixelIndex + 2] = utils.clamp(Math.floor(color[2] * rand), 0, 255); // B
		data[pixelIndex + 3] = color[3]; // Alpha

		pixelIndex += 4;
	}

	ctx.putImageData(imgData, 0, 0);

	return canvas;
}
