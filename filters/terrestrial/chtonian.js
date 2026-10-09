
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.category.includes('chtonian')) {
            finish();
        }
    }
}
