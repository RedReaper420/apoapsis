
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.genData.isMoon && (body.genData.moonType !== T.moonTypes.Binary)) {
            if (body.life >= 3) {
                finish();
            }
        }
    }
}
