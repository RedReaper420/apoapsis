
const isEarthLike = (body) => { 
    return (
        (0.2 <= body.mass.as(T.units.Mass.M_Earth)) && (body.mass.as(T.units.Mass.M_Earth) <= 2) 
        && (body.life >= 3)
    );
}

if (body instanceof T.Planet) {
    if (body.type === T.planetTypes.Terrestrial) {
        if (body.genData.isMoon && (body.genData.moonType === T.moonTypes.Binary)) {
            if (isEarthLike(body) && (isEarthLike(body.companion))) {
                finish();
            }
        }
    }
}
