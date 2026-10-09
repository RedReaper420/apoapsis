
if (body instanceof T.Planet) {
    if (!(body.genData.parentStar instanceof T.BinaryStar)) {
        if (body.genData.parentStar.type.includes('G')) {
            if (body.life >= 4) {
                if (Math.abs(body.mass.as(T.units.Mass.M_Earth) - 1) <= 0.2) {
                    if (Math.abs(body.radius.as(T.units.Dist.R_Earth) - 1) <= 0.2) {
                        finish();
                    }
                }
            }
        }
    }
}
