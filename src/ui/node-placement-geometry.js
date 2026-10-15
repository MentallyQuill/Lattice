/** Choose a vacant node origin using prepared visual extents, including decorations. */
export function findVacantNodePoint({preferred,footprint,occupied,gap=24}) {
 const vacant=point=>occupied.every(bounds=>
  point.x+footprint.x+footprint.w+gap<=bounds.x||point.x+footprint.x>=bounds.x+bounds.w+gap||
  point.y+footprint.y+footprint.h+gap<=bounds.y||point.y+footprint.y>=bounds.y+bounds.h+gap);
 if(vacant(preferred))return {...preferred};
 for(let row=0;row<6;row++)for(let column=0;column<6;column++){
  const point={x:preferred.x+column*(footprint.w+gap),y:preferred.y+row*(footprint.h+gap)};
  if(vacant(point))return point;
 }
 // Beyond every existing right edge is vacant even for a densely occupied grid.
 return {x:Math.max(...occupied.map(bounds=>bounds.x+bounds.w))+gap-footprint.x,y:preferred.y};
}

/** Reserve bounded metadata until the new node has a measured live decoration row. */
export function nodePlacementFootprint(size,scale=1,compact=false) {
 const measured=size.visualBounds??{x:0,y:0,w:size.width,h:size.height};
 // Match the canvas' minimum-screen-size badge and the stack's 31px model,
 // 5px row gap, and 12px card clearance before a live row exists.
 const indicatorScale=Math.max(1,.625/scale),upper=48+24*indicatorScale;
 const left=Math.min(0,measured.x/scale),top=Math.min(-upper,measured.y/scale);
 const right=Math.max(size.width/scale,(measured.x+measured.w)/scale,24*indicatorScale);
 const bottom=Math.max(size.height/scale+(compact?86:48),(measured.y+measured.h)/scale);
 return {x:left,y:top,w:right-left,h:bottom-top};
}
