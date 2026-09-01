/*
╔══════════════════════════════════════════════════════════════╗
║                     BLOXD PATHFINDER                         ║
║                                                              ║
║                    Copyright © 2026                          ║
║                      MangoIsSleepy                           ║
║                                                              ║
║       Smart Entity A* Pathfinding Library 4 Bloxd            ║
╚══════════════════════════════════════════════════════════════╝
*/

import{MathLib}from"./MathLib"

export let Pathfinder={
    paths:{},
    defaults:{maxNodes:15000,stepHeight:1,allowDiagonal:true,allowJump:true,avoidWater:true,avoidLava:true,speed:4,reach:1,scanPadding:2,verticalCost:1.5,diagonalCost:1.41421356237},

    key:(x,y,z)=>x+","+y+","+z,
    nodeKey:p=>Pathfinder.key(p[0],p[1],p[2]),
    isAir:block=>block===null||block===undefined||block==="Air",

    readArea:(min,max)=>{let blocks={};if(typeof api.getBlocksInRect==="function"){let r=api.getBlocksInRect(min,max);if(Array.isArray(r)){let i=0;for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++)blocks[Pathfinder.key(x,y,z)]=r[i++];return blocks}if(r&&typeof r==="object")return r}for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++)blocks[Pathfinder.key(x,y,z)]=api.getBlock(x,y,z);return blocks},

    getBlock:(blocks,x,y,z)=>blocks[Pathfinder.key(x,y,z)],

    walkable:(blocks,x,y,z,o)=>{let ground=Pathfinder.getBlock(blocks,x,y,z),feet=Pathfinder.getBlock(blocks,x,y+1,z),head=Pathfinder.getBlock(blocks,x,y+2,z);if(ground===undefined||feet===undefined||head===undefined)return false;if(Pathfinder.isAir(ground)||!Pathfinder.isAir(feet)||!Pathfinder.isAir(head))return false;if(o.avoidWater&&ground==="Water")return false;if(o.avoidLava&&ground==="Lava")return false;return true},

    heuristic:(a,b,o)=>{let dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]),dz=Math.abs(a[2]-b[2]),diagonal=Math.min(dx,dz),straight=Math.max(dx,dz)-diagonal;return diagonal*o.diagonalCost+straight+dy*o.verticalCost},

    neighbors:(p,o)=>{let n=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];if(o.allowDiagonal)n.push([1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1]);if(o.allowJump){n.push([0,1,0],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1]);if(o.allowDiagonal)n.push([1,1,1],[1,1,-1],[-1,1,1],[-1,1,-1])}n.push([0,-1,0],[1,-1,0],[-1,-1,0],[0,-1,1],[0,-1,-1]);return n},

    movementCost:(a,b,o)=>{let dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]),dz=Math.abs(b[2]-a[2]),cost=dx&&dz?o.diagonalCost:1;if(dy)cost+=o.verticalCost;return cost},

    reconstruct:(came,current)=>{let path=[current],key=Pathfinder.nodeKey(current);while(came[key]){current=came[key];key=Pathfinder.nodeKey(current);path.push(current)}path.reverse();return path},

    astar:(start,end,blocks,o)=>{let open=[{pos:start,g:0,f:Pathfinder.heuristic(start,end,o)}],came={},scores={},nodes=0;scores[Pathfinder.nodeKey(start)]=0;while(open.length&&nodes<o.maxNodes){nodes++;let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;let current=open.splice(best,1)[0],pos=current.pos;if(pos[0]===end[0]&&pos[1]===end[1]&&pos[2]===end[2])return Pathfinder.reconstruct(came,pos);for(let d of Pathfinder.neighbors(pos,o)){let next=[pos[0]+d[0],pos[1]+d[1],pos[2]+d[2]];if(Math.abs(next[1]-pos[1])>o.stepHeight||!Pathfinder.walkable(blocks,next[0],next[1],next[2],o))continue;if(d[0]&&d[2]&&(!Pathfinder.walkable(blocks,pos[0]+d[0],pos[1],pos[2],o)||!Pathfinder.walkable(blocks,pos[0],pos[1],pos[2]+d[2],o)))continue;let key=Pathfinder.nodeKey(next),g=current.g+Pathfinder.movementCost(pos,next,o);if(scores[key]===undefined||g<scores[key]){scores[key]=g;came[key]=pos;open.push({pos:next,g:g,f:g+Pathfinder.heuristic(next,end,o)})}}}return null},

    find:(entityId,start,end,options)=>{let o=Object.assign({},Pathfinder.defaults,options||{}),minX=Math.floor(Math.min(start[0],end[0]))-o.scanPadding,maxX=Math.floor(Math.max(start[0],end[0]))+o.scanPadding,minY=Math.floor(Math.min(start[1],end[1]))-o.scanPadding,maxY=Math.floor(Math.max(start[1],end[1]))+o.scanPadding+2,minZ=Math.floor(Math.min(start[2],end[2]))-o.scanPadding,maxZ=Math.floor(Math.max(start[2],end[2]))+o.scanPadding,blocks=Pathfinder.readArea([minX,minY,minZ],[maxX,maxY,maxZ]),s=[Math.floor(start[0]),Math.floor(start[1]),Math.floor(start[2])],e=[Math.floor(end[0]),Math.floor(end[1]),Math.floor(end[2])],path=Pathfinder.astar(s,e,blocks,o);if(!path){delete Pathfinder.paths[entityId];return null}Pathfinder.paths[entityId]={entityId:entityId,path:path,index:0,options:o};return path},

    getPath:entityId=>Pathfinder.paths[entityId]?Pathfinder.paths[entityId].path:null,
    getNext:entityId=>{let p=Pathfinder.paths[entityId];return p?p.path[p.index]||null:null},
    isPathing:entityId=>!!Pathfinder.paths[entityId],
    clear:entityId=>{delete Pathfinder.paths[entityId]},

    stop:entityId=>{if(!Pathfinder.paths[entityId])return false;delete Pathfinder.paths[entityId];api.setVelocity(entityId,0,0,0);return true},

    repath:(entityId,end,options)=>{let p=api.getPosition(entityId);return p?Pathfinder.find(entityId,p,end,options):null},

    tick:()=>{for(let entityId in Pathfinder.paths){let d=Pathfinder.paths[entityId];if(d.index>=d.path.length){Pathfinder.stop(entityId);continue}let p=api.getPosition(entityId);if(!p){delete Pathfinder.paths[entityId];continue}let t=d.path[d.index],dx=t[0]-p[0],dy=t[1]-p[1],dz=t[2]-p[2],dist=Math.sqrt(dx*dx+dy*dy+dz*dz);if(dist<=d.options.reach){d.index++;continue}let v=MathLib.normalize([dx,dy,dz]);api.setVelocity(entityId,v[0]*d.options.speed,v[1]*d.options.speed,v[2]*d.options.speed)}}
}