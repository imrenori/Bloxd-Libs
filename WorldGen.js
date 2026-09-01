/*
╔══════════════════════════════════════════════════════════════╗
║                       BLOXD WORLDGEN                         ║
║                                                              ║
║                    Copyright © 2026                          ║
║                      MangoIsSleepy                           ║
║                                                              ║
║          Procedural World Generation lib 4 bloxd             ║
╚══════════════════════════════════════════════════════════════╝
*/

import{MathLib}from"./MathLib"

export let WorldGen={
    jobs:[],
    seed:1,
    defaults:{seed:12345,minY:0,maxY:64,baseHeight:20,seaLevel:18,scale:42,largeStrength:30,smallStrength:14,mountainStrength:28,caveScale:14,caveThreshold:.72,surface:"Grass Block",filler:"Dirt",stone:"Stone",water:"Water",treeChance:.965,treeMinHeight:4,treeMaxHeight:7,oreLevels:{coal:45,iron:30,gold:18,diamond:8}},

    hash:(x,y,z)=>{let n=Math.sin(x*127.1+y*311.7+z*74.7+WorldGen.seed*19.19)*43758.5453123;return n-Math.floor(n)},

    noise2:(x,z)=>{let x0=Math.floor(x),z0=Math.floor(z),xf=x-x0,zf=z-z0,a=WorldGen.hash(x0,0,z0),b=WorldGen.hash(x0+1,0,z0),c=WorldGen.hash(x0,0,z0+1),d=WorldGen.hash(x0+1,0,z0+1),u=MathLib.smootherstep(0,1,xf),v=MathLib.smootherstep(0,1,zf);return MathLib.lerp(MathLib.lerp(a,b,u),MathLib.lerp(c,d,u),v)},

    fbm:(x,z)=>{let v=0,a=1,f=1,total=0;for(let i=0;i<5;i++){v+=WorldGen.noise2(x*f,z*f)*a;total+=a;a*=.5;f*=2}return v/total},

    terrainHeight:(x,z,o)=>{let large=WorldGen.fbm(x/(o.scale*2),z/(o.scale*2)),small=WorldGen.fbm(x/o.scale,z/o.scale),mountain=Math.pow(WorldGen.fbm(x/(o.scale*.55),z/(o.scale*.55)),3);return Math.floor(o.baseHeight+(large-.5)*o.largeStrength+(small-.5)*o.smallStrength+mountain*o.mountainStrength)},

    cave:(x,y,z,o)=>MathLib.fbm3(x/o.caveScale,y/o.caveScale,z/o.caveScale,4,2,.5)>o.caveThreshold,

    ore:(x,y,z,o)=>{let n=WorldGen.hash(x*3,y*7,z*11);if(y<=o.oreLevels.diamond&&n>.985)return"Diamond Ore";if(y<=o.oreLevels.gold&&n>.965)return"Gold Ore";if(y<=o.oreLevels.iron&&n>.93)return"Iron Ore";if(y<=o.oreLevels.coal&&n>.88)return"Coal Ore";return null},

    setRectSafe:(a,b,block)=>{let minX=Math.min(a[0],b[0]),maxX=Math.max(a[0],b[0]),minY=Math.min(a[1],b[1]),maxY=Math.max(a[1],b[1]),minZ=Math.min(a[2],b[2]),maxZ=Math.max(a[2],b[2]),size=18;for(let x=minX;x<=maxX;x+=size)for(let y=minY;y<=maxY;y+=size)for(let z=minZ;z<=maxZ;z+=size)api.setBlockRect([x,y,z],[Math.min(x+size-1,maxX),Math.min(y+size-1,maxY),Math.min(z+size-1,maxZ)],block)},

    tree:(x,y,z,o)=>{if(WorldGen.hash(x,31,z)>o.treeChance)return;let h=o.treeMinHeight+Math.floor(WorldGen.hash(x,37,z)*(o.treeMaxHeight-o.treeMinHeight+1));WorldGen.setRectSafe([x,y+1,z],[x,y+h,z],"Maple Log");let top=y+h;for(let ox=-2;ox<=2;ox++)for(let oz=-2;oz<=2;oz++)for(let oy=-2;oy<=1;oy++){let d=Math.abs(ox)+Math.abs(oz)+Math.abs(oy);if(d<=4&&!(ox===0&&oz===0&&oy<0))api.setBlock(x+ox,top+oy,z+oz,"Maple Leaves")}},

    options:options=>{let o=Object.assign({},WorldGen.defaults,options||{});o.oreLevels=Object.assign({},WorldGen.defaults.oreLevels,options&&options.oreLevels||{});return o},

    create:(pos1,pos2,options)=>{let o=WorldGen.options(options);WorldGen.seed=o.seed;let minX=Math.min(pos1[0],pos2[0]),maxX=Math.max(pos1[0],pos2[0]),minZ=Math.min(pos1[2],pos2[2]),maxZ=Math.max(pos1[2],pos2[2]);WorldGen.setRectSafe([minX,o.minY,minZ],[maxX,Math.min(o.seaLevel-1,o.maxY),maxZ],o.stone);let job={minX:minX,maxX:maxX,minZ:minZ,maxZ:maxZ,x:minX,z:minZ,opt:o};WorldGen.jobs.push(job);return job},

    step:(job,columns=8)=>{if(!job)return true;let done=0;while(done<columns){if(job.x>job.maxX){job.x=job.minX;job.z++}if(job.z>job.maxZ)return true;let x=job.x,z=job.z,o=job.opt,h=Math.max(o.minY+2,Math.min(o.maxY,WorldGen.terrainHeight(x,z,o)));if(h<o.seaLevel){WorldGen.setRectSafe([x,o.minY,z],[x,h,z],o.stone);api.setBlock(x,h,z,o.surface);if(o.seaLevel>h)WorldGen.setRectSafe([x,h+1,z],[x,o.seaLevel,z],o.water)}else{WorldGen.setRectSafe([x,o.minY,z],[x,h-4,z],o.stone);WorldGen.setRectSafe([x,h-3,z],[x,h-1,z],o.filler);api.setBlock(x,h,z,o.surface);for(let y=Math.max(o.minY,h-24);y<h-3;y++)if(WorldGen.cave(x,y,z,o))api.setBlock(x,y,z,"Air");else{let ore=WorldGen.ore(x,y,z,o);if(ore)api.setBlock(x,y,z,ore)}if(WorldGen.cave(x,h-2,z,o)){api.setBlock(x,h-1,z,"Air");api.setBlock(x,h,z,"Air")}else WorldGen.tree(x,h,z,o)}job.x++;done++}return false},

    tick:(columns=8)=>{if(!WorldGen.jobs.length)return;if(WorldGen.step(WorldGen.jobs[0],columns))WorldGen.jobs.shift()},

    generate:(pos1,pos2,options)=>WorldGen.create(pos1,pos2,options),
    clearJobs:()=>{WorldGen.jobs.length=0},
    getJobCount:()=>WorldGen.jobs.length,
    setSeed:value=>{WorldGen.seed=value},
    getSeed:()=>WorldGen.seed,
    getDefaults:()=>WorldGen.options()
}