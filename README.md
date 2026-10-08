
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.1-yellow.svg)](https://github.com/RedReaper420/apoapsis/releases)

# Apoapsis

<img src="img/logo.webp">

Apoapsis is an interactive web-based star and planetary system generator inspired by Vector-Graphics' [Periapsis](https://github.com/Vector-Graphics/periapsis).

Live demo: https://redreaper420.github.io/apoapsis/

## Features

- **Astrophysics-faithful** seeded procedural generation of main-sequence stars and planets (from tiny moons to brown dwarfs)
- Configurable generation parameters (star properties, planetary migration simulation regimes, etc.)
- Interactive 2D top-down visualization with time warp.
- Detailed body properties inspector.
- Scriptable generation filter.
- Saving & loading of systems and settings in JSON files.
- Saving total system report into a HTML document.

## Getting Started

### Online
Just open the [live demo](https://redreaper420.github.io/apoapsis/).

### Local / Self-hosting
1. Clone or download the repository or one of the releases.
2. Serve the files with any static server:
```bash
# Python local server | http://localhost:8000
python -m http.server 8000
```
3. In the browser, open URL leading to `index.html` at your server.

> [!TIP]
> If you're hosting the app on your own server, you can change the link leading to a "homepage" to your own in the `home_url.txt` file.

## License & Credits

This project is licensed under the [MIT License](LICENSE).  

For third-party libraries, assets, and attributions, see [THIRD_PARTY_LICENCES.md](THIRD_PARTY_LICENCES.md).
