
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
       if (body.life >= 3) {
            if ((body.genData.isMoon) && (body.genData.moonType !== T.moonTypes.Binary)) {
                finish();
            }
            else if (body.parentBody instanceof T.BinaryPlanet) {
                if (body.companion === body.parentBody.primary) {
                    const primary_mass = body.companion.mass.as(T.units.Mass.M_Earth);
                    const secondary_mass = body.mass.as(T.units.Mass.M_Earth);
                    const ratio = secondary_mass / primary_mass;

                    if (ratio < consts.DEF_BINARY_PLANET_MASS_RATIO) {
                        finish();
                    }
                }
            }
        }
    }
}
