
if (body instanceof T.Star) {
    if (body.type.startsWith('M')) {
        body.bodies.forEach(planet => {
            if (planet instanceof T.Planet) {
                if (planet.mass.as(T.units.Mass.M_Earth) >= 15) {
                    finish();
                }
            }
            else if (planet instanceof T.BinaryPlanet) {
                if (planet.secondary.mass.as(T.units.Mass.M_Earth) >= 15) {
                    finish();
                }
                else if (planet.primary.mass.as(T.units.Mass.M_Earth) >= 15) {
                    finish();
                }
            }
        });
    }
}
