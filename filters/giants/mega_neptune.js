
if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.IceGiant) {
        if (body.mass.as(T.units.Mass.M_Earth) >= 90) {
            finish();
        }
    }
}
