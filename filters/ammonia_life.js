
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.ocean.includes('Ammonia')) {
            if (body.life >= 2) {
                finish();
            }
        }
    }
}
