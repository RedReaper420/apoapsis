
if (body instanceof T.Planet) {
    if ((body.type === T.planetTypes.Terrestrial)) {
        if (!body.genData.isMoon) {
            if (body.genData.parentStar instanceof T.BinaryStar) {
                if (body.temperature.as(T.units.Temp.C) >= 0) {
                    finish();
                }
            }
        }
    }
}
