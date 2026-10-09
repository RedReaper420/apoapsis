
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.ocean.includes('Methane')) {
            if (body.life >= 2) {
                finish();
            }
        }
    }
}
