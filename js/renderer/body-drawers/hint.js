
import * as T from "../../data/types.js";

export default function drawHint() {
    const coords = this.position.screen;
    const rend = this.renderer;
    const canvas = rend.canvas;
    const ctx = rend.ctx;

    if ((this.sim.hover === false) && (rend.trackedBody !== this))
        return;
    
    ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    
    const hintX = coords.x + Math.max(this.sim.radius_vis_scaled, this.sim.radius_vis) + 30;
    const hintY = coords.y - 30;
    const width = 160;
    const height = 62;

    ctx.fillRect(hintX, hintY, width, height);
    ctx.strokeRect(hintX, hintY, width, height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(this.name, hintX + 8, hintY + 18);

    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Class: ${this.type}`, hintX + 8, hintY + 34);
    
    const getUnit = (body) => {
        if (body instanceof T.Binary)
            return getUnit(body.primary);

        if (body instanceof T.Star)
            return { unit: T.units.Mass.M_Sun, char: '☉' };
        else {
            if (body.genData.isMoon) {
                if (body.genData.moonType !== T.moonTypes.Binary) {
                    return { unit: T.units.Mass.M_Moon, char: '☾' };
                }
            }
            
            if (body.mass.as(T.units.Mass.M_Earth) < 60)
                return { unit: T.units.Mass.M_Earth, char: '⊕' };
            else
                return { unit: T.units.Mass.M_Jupiter, char: '♃' };
        }
    };
    const unit = getUnit(this);
    const mass = this.mass.as(unit.unit);
    const massString = `${mass.toFixed(mass < 0.01 ? 3 : 2)} M${unit.char}`;
    
    ctx.fillText(`Mass: ${massString}`, hintX + 8, hintY + 48);
}
