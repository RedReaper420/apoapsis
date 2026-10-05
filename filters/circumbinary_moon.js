
if (body instanceof T.Planet) {
    if (body.parentBody instanceof T.BinaryPlanet) {
        if (!body.companion) {
            finish();
        }
    }
}
