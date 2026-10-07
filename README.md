
# Apoapsis

<img src="img/logo.webp">

Apoapsis is an interactive web-based star and planetary system generator inspired by Vector-Graphics' [Periapsis](https://github.com/Vector-Graphics/periapsis).

Live demo: https://redreaper420.github.io/apoapsis/

## Features

* Astrophysics-faithul seeded procedural generation of main-sequence stars and planets from smallest moons to brown dwarfs.
* Configurable generation settings (i.e. stars properties, planetary migration).
* Interactive 2D top-down system visualization (on Kelperial rails) with time warp.
* Detailed body properties inspector.
* Scriptable generation filter.
* Saving & loading of systems and settings (JSON)

## Hosting & Launch

Just unpack the content of this repository into some directory on your server/hosting. When hosting the app on your server, you might want to edit the "To homepage" link in `home_url.txt`.

The app can also be run locally via any local server, i.e.:

```bash
# Python local server | http://localhost:8000
python -m http.server 8000
```

## License & Credits

This project is licensed under the [MIT License](LICENSE).  
For third-party libraries, assets, and attributions, see [THIRD_PARTY_LICENCES.md](THIRD_PARTY_LICENCES.md).
