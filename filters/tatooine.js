
if (body instanceof T.Planet) {
    if ((body.type === T.planetTypes.Terrestrial)) {
        if (body.parentBody instanceof T.BinaryStar) {
            if (body.temperature.as(T.units.Temp.C) >= 0) {
                finish();
            }
        }
    }
}
