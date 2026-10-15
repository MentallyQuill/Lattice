export interface VisualRectangle {x:number;y:number;w:number;h:number}
export function findVacantNodePoint(options:{preferred:{x:number;y:number};footprint:VisualRectangle;occupied:VisualRectangle[];gap?:number}):{x:number;y:number};
export function nodePlacementFootprint(size:{width:number;height:number;visualBounds?:VisualRectangle},scale?:number,compact?:boolean):VisualRectangle;
