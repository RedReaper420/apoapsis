
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.classification.includes('asteroid')) {
            finish();
        }
    }
}
