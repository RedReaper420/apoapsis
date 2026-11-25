
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.atmosphere.pressure.as(T.units.Press.bar) >= 50) {
            finish();
        }
    }
}
