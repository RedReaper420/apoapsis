
if (body instanceof T.Planet) {
    if (body.type !== T.planetTypes.Terrestrial) {
        if (body.temperature.as(T.units.Temp.K) >= 900) {
            finish();
        }
    }
}
