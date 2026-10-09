
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.core.composition.ice >= 0.1) {
            if (body.ocean.includes('ater') && !body.ocean.includes('frozen')) {
                finish();
            }
        }
    }
}
