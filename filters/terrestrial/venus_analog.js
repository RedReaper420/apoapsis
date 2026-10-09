
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.atmosphere.pressure.as(T.units.Press.Bar) >= 50) {
            finish();
        }
    }
}
