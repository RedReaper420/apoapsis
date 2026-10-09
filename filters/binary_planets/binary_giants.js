
if (body instanceof T.Planet) {
    if (body.genData.isMoon && (body.genData.moonType === T.moonTypes.Binary)) {
        if ((body.type !== T.planetTypes.Terrestrial) && (body.companion.type !== T.planetTypes.Terrestrial)) {
            const mass_p = body.parentBody.primary.mass.as(T.units.Mass.M_Earth);
            const mass_s = body.parentBody.secondary.mass.as(T.units.Mass.M_Earth);
            const massRatio = mass_s / mass_p;
            if (massRatio >= consts.DEF_BINARY_PLANET_MASS_RATIO) {
                finish();
            }
        }
    }
}
