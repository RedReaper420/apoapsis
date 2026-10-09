
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.life === 5) {
            finish();
        }
    }
}
