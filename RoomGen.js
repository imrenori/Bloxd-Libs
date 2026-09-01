/*
╔══════════════════════════════════════════════════════════════╗
║                       BLOXD ROOMGEN                         ║
║                                                              ║
║                    Copyright © 2026                          ║
║                      MangoIsSleepy                           ║
║                                                              ║
║              Procedural Room Generation Lib :3               ║
╚══════════════════════════════════════════════════════════════╝
*/

let RoomGen={
    rooms:[],templates:[],jobs:[],chunks:{},players:{},chestPositions:[],roomNumber:0,nextTemplate:0,initialized:false,
    options:{roomSpacing:0,maxRoomsPerChunk:2,initialRooms:3,scanHeight:64,maxRooms:1000,allowOverlap:false,doorwayBlock:"Lime Wool",defaultFloor:"Stone",defaultChest:"Chest"},

    key:(x,y,z)=>x+","+y+","+z,

    clone:v=>{
        if(Array.isArray(v))return v.map(RoomGen.clone);
        if(v&&typeof v==="object"){
            let o={};
            for(let k in v)o[k]=RoomGen.clone(v[k]);
            return o;
        }
        return v;
    },

    normalizeOptions:options=>{
        let o=RoomGen.clone(RoomGen.options);
        if(options)for(let k in options)o[k]=options[k];
        return o;
    },

    rotatePos:(p,r)=>{
        r=((r%4)+4)%4;
        if(r===0)return[p[0],p[1],p[2]];
        if(r===1)return[-p[2],p[1],p[0]];
        if(r===2)return[-p[0],p[1],-p[2]];
        return[p[2],p[1],-p[0]];
    },

    rotateDoorDirection:(d,r)=>{
        r=((r%4)+4)%4;
        let x=d[0],z=d[2];
        for(let i=0;i<r;i++){
            let nx=-z;
            z=x;
            x=nx;
        }
        return[x,d[1],z];
    },

    opposite:d=>[-d[0],-d[1],-d[2]],

    getRoomSize:data=>[
        data.pos2[0]-data.pos1[0]+1,
        data.pos2[1]-data.pos1[1]+1,
        data.pos2[2]-data.pos1[2]+1
    ],

    readBlocks:(pos1,pos2)=>{
        let minX=Math.min(pos1[0],pos2[0]),maxX=Math.max(pos1[0],pos2[0]);
        let minY=Math.min(pos1[1],pos2[1]),maxY=Math.max(pos1[1],pos2[1]);
        let minZ=Math.min(pos1[2],pos2[2]),maxZ=Math.max(pos1[2],pos2[2]);
        let blocks=[];

        if(typeof api.getBlocksInRect==="function"){
            try{
                let result=api.getBlocksInRect([minX,minY,minZ],[maxX,maxY,maxZ]);
                if(Array.isArray(result)){
                    for(let i=0;i<result.length;i++){
                        let b=result[i];
                        if(!b)continue;
                        if(Array.isArray(b)&&b.length>=4)blocks.push({pos:[b[0],b[1],b[2]],block:b[3]});
                        else if(b.pos&&b.block)blocks.push({pos:[b.pos[0],b.pos[1],b.pos[2]],block:b.block});
                    }
                    if(blocks.length)return blocks;
                }
            }catch(e){}
        }

        for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){
            let block=api.getBlock(x,y,z);
            if(block&&block!=="Air")blocks.push({pos:[x,y,z],block:block});
        }

        return blocks;
    },

    findDoorways:(blocks,pos1)=>{
        let doors=[];
        for(let i=0;i<blocks.length;i++){
            let b=blocks[i];
            if(b.block!=="Lime Wool")continue;
            let p=[b.pos[0]-pos1[0],b.pos[1]-pos1[1],b.pos[2]-pos1[2]];
            let left=api.getBlock(b.pos[0]-1,b.pos[1],b.pos[2]);
            let right=api.getBlock(b.pos[0]+1,b.pos[1],b.pos[2]);
            let front=api.getBlock(b.pos[0],b.pos[1],b.pos[2]-1);
            let back=api.getBlock(b.pos[0],b.pos[1],b.pos[2]+1);
            let direction=[0,0,1];
            if(left==="Lime Wool"||right==="Lime Wool")direction=[0,0,1];
            else if(front==="Lime Wool"||back==="Lime Wool")direction=[1,0,0];
            doors.push({pos:p,direction:direction});
        }
        return doors;
    },

    saveRoomData:(pos1,pos2,chestpos,options)=>{
        let minX=Math.min(pos1[0],pos2[0]),minY=Math.min(pos1[1],pos2[1]),minZ=Math.min(pos1[2],pos2[2]);
        let maxX=Math.max(pos1[0],pos2[0]),maxY=Math.max(pos1[1],pos2[1]),maxZ=Math.max(pos1[2],pos2[2]);
        let a=[minX,minY,minZ],b=[maxX,maxY,maxZ],blocks=RoomGen.readBlocks(a,b),doors=RoomGen.findDoorways(blocks,a),chests=[];

        if(chestpos){
            if(Array.isArray(chestpos[0]))for(let i=0;i<chestpos.length;i++)chests.push([chestpos[i][0]-minX,chestpos[i][1]-minY,chestpos[i][2]-minZ]);
            else chests.push([chestpos[0]-minX,chestpos[1]-minY,chestpos[2]-minZ]);
        }

        let data={pos1:[0,0,0],pos2:[maxX-minX,maxY-minY,maxZ-minZ],blocks:[],doorways:doors,chests:chests,name:options&&options.name?options.name:"Room"};

        for(let i=0;i<blocks.length;i++){
            let p=blocks[i].pos;
            data.blocks.push({pos:[p[0]-minX,p[1]-minY,p[2]-minZ],block:blocks[i].block});
        }

        RoomGen.templates.push(data);
        return data;
    },

    addRoomTemplate:data=>{
        if(!data||!data.blocks)return false;
        RoomGen.templates.push(RoomGen.clone(data));
        return data;
    },

    clearTemplates:()=>RoomGen.templates.length=0,

    getTemplates:()=>RoomGen.templates,

    addChestPosition:pos=>{
        if(!Array.isArray(pos)||pos.length<3)return false;
        RoomGen.chestPositions.push([pos[0],pos[1],pos[2]]);
        return true;
    },

    getChestPositions:()=>RoomGen.chestPositions.map(p=>[p[0],p[1],p[2]]),

    clearChestPositions:()=>RoomGen.chestPositions.length=0,

    transformedDoor:(door,rotation)=>({
        pos:RoomGen.rotatePos(door.pos,rotation),
        direction:RoomGen.rotateDoorDirection(door.direction,rotation)
    }),

    transformedBlock:(block,rotation)=>({
        pos:RoomGen.rotatePos(block.pos,rotation),
        block:block.block
    }),

    transformedChest:(chest,rotation)=>RoomGen.rotatePos(chest,rotation),

    getRotatedSize:(template,rotation)=>{
        let size=RoomGen.getRoomSize(template);
        return rotation%2===0?[size[0],size[1],size[2]]:[size[2],size[1],size[0]];
    },

    getAbsoluteDoor:(room,doorIndex)=>{
        let door=room.template.doorways[doorIndex],p=RoomGen.rotatePos(door.pos,room.rotation);
        return[room.pos[0]+p[0],room.pos[1]+p[1],room.pos[2]+p[2]];
    },

    getAbsoluteDoorDirection:(room,doorIndex)=>RoomGen.rotateDoorDirection(room.template.doorways[doorIndex].direction,room.rotation),

    occupied:(pos1,pos2)=>{
        for(let i=0;i<RoomGen.rooms.length;i++){
            let r=RoomGen.rooms[i],a=r.pos,s=RoomGen.getRotatedSize(r.template,r.rotation),b=[a[0]+s[0]-1,a[1]+s[1]-1,a[2]+s[2]-1];
            if(pos1[0]<=b[0]&&pos2[0]>=a[0]&&pos1[1]<=b[1]&&pos2[1]>=a[1]&&pos1[2]<=b[2]&&pos2[2]>=a[2])return true;
        }
        return false;
    },

    canPlace:(template,pos,rotation)=>{
        let size=RoomGen.getRotatedSize(template,rotation),p2=[pos[0]+size[0]-1,pos[1]+size[1]-1,pos[2]+size[2]-1];
        return RoomGen.options.allowOverlap||!RoomGen.occupied(pos,p2);
    },

    attachPosition:(existingRoom,existingDoorIndex,newTemplate,newDoorIndex,rotation)=>{
        let existingDoor=RoomGen.getAbsoluteDoor(existingRoom,existingDoorIndex);
        let existingDirection=RoomGen.getAbsoluteDoorDirection(existingRoom,existingDoorIndex);
        let newDoor=RoomGen.transformedDoor(newTemplate.doorways[newDoorIndex],rotation);
        let targetDoor=[existingDoor[0]+existingDirection[0],existingDoor[1]+existingDirection[1],existingDoor[2]+existingDirection[2]];
        return[targetDoor[0]-newDoor.pos[0],targetDoor[1]-newDoor.pos[1],targetDoor[2]-newDoor.pos[2]];
    },

    findPlacement:()=>{
        if(!RoomGen.templates.length)return null;

        for(let r=RoomGen.rooms.length-1;r>=0;r--){
            let room=RoomGen.rooms[r];
            for(let di=0;di<room.template.doorways.length;di++){
                if(room.usedDoors[di])continue;

                for(let ti=0;ti<RoomGen.templates.length;ti++){
                    let template=RoomGen.templates[(RoomGen.nextTemplate+ti)%RoomGen.templates.length];
                    if(!template.doorways||!template.doorways.length)continue;

                    for(let rotation=0;rotation<4;rotation++){
                        for(let ndi=0;ndi<template.doorways.length;ndi++){
                            let pos=RoomGen.attachPosition(room,di,template,ndi,rotation);
                            if(RoomGen.canPlace(template,pos,rotation)){
                                room.usedDoors[di]=true;
                                RoomGen.nextTemplate=ti+1;
                                return{template:template,pos:pos,rotation:rotation,parent:room.id,parentDoor:di,door:ndi};
                            }
                        }
                    }
                }
            }
        }

        let base=RoomGen.rooms.length?RoomGen.rooms[RoomGen.rooms.length-1]:null;
        if(!base)return null;

        for(let ti=0;ti<RoomGen.templates.length;ti++){
            let template=RoomGen.templates[(RoomGen.nextTemplate+ti)%RoomGen.templates.length];
            for(let rotation=0;rotation<4;rotation++){
                let s=RoomGen.getRotatedSize(base.template,base.rotation),pos=[base.pos[0]+s[0]+RoomGen.options.roomSpacing+1,base.pos[1],base.pos[2]];
                if(RoomGen.canPlace(template,pos,rotation)){
                    RoomGen.nextTemplate=ti+1;
                    return{template:template,pos:pos,rotation:rotation,parent:base.id,parentDoor:null,door:null};
                }
            }
        }

        return null;
    },

    queueBlock:(x,y,z,block)=>RoomGen.jobs.push({type:"block",x:x,y:y,z:z,block:block}),

    queueRect:(a,b,block)=>RoomGen.jobs.push({type:"rect",a:[a[0],a[1],a[2]],b:[b[0],b[1],b[2]],block:block}),

    queueRoom:(template,pos,rotation,room)=>{
        let blocks=[];

        for(let i=0;i<template.blocks.length;i++){
            let b=RoomGen.transformedBlock(template.blocks[i],rotation);
            blocks.push({x:pos[0]+b.pos[0],y:pos[1]+b.pos[1],z:pos[2]+b.pos[2],block:b.block});
        }

        blocks.sort((a,b)=>a.y-b.y);

        for(let i=0;i<blocks.length;i++)RoomGen.queueBlock(blocks[i].x,blocks[i].y,blocks[i].z,blocks[i].block);

        for(let i=0;i<template.chests.length;i++){
            let p=RoomGen.transformedChest(template.chests[i],rotation);
            let cp=[pos[0]+p[0],pos[1]+p[1],pos[2]+p[2]];
            RoomGen.queueBlock(cp[0],cp[1],cp[2],RoomGen.options.defaultChest);
            room.chests.push(cp);
        }
    },

    createRoom:placement=>{
        if(!placement||RoomGen.rooms.length>=RoomGen.options.maxRooms)return null;

        let id=++RoomGen.roomNumber,room={
            id:id,template:placement.template,pos:[placement.pos[0],placement.pos[1],placement.pos[2]],
            rotation:placement.rotation,parent:placement.parent,parentDoor:placement.parentDoor,door:placement.door,usedDoors:[],chests:[],generated:false
        };

        for(let i=0;i<placement.template.doorways.length;i++)room.usedDoors.push(false);

        if(placement.parentDoor!==null&&placement.parentDoor!==undefined){
            let parent=RoomGen.rooms.find(r=>r.id===placement.parent);
            if(parent)parent.usedDoors[placement.parentDoor]=true;
        }

        RoomGen.rooms.push(room);
        RoomGen.queueRoom(placement.template,placement.pos,placement.rotation,room);
        return room;
    },

    generateNext:(amount=1)=>{
        let made=0;
        while(made<amount){
            let placement=RoomGen.findPlacement();
            if(!placement||!RoomGen.createRoom(placement))break;
            made++;
        }
        return made;
    },

    generateInitial:()=>{
        if(RoomGen.initialized||!RoomGen.templates.length)return;
        RoomGen.initialized=true;

        let first=RoomGen.templates[0],room={
            id:++RoomGen.roomNumber,template:first,pos:[0,0,0],rotation:0,parent:null,parentDoor:null,door:null,usedDoors:[],chests:[],generated:false
        };

        for(let i=0;i<first.doorways.length;i++)room.usedDoors.push(false);
        RoomGen.rooms.push(room);
        RoomGen.queueRoom(first,[0,0,0],0,room);
        RoomGen.generateNext(2);
    },

    finishRoom:room=>{
        if(!room||room.generated)return;
        room.generated=true;

        for(let i=0;i<room.chests.length;i++){
            let p=room.chests[i];
            RoomGen.chestPositions.push([p[0],p[1],p[2]]);

            let roomData={
                roomNumber:room.id,
                position:room.pos,
                rotation:room.rotation,
                template:room.template.name,
                parent:room.parent,
                chestPosition:p
            };

            try{
                api.setBlockData(p[0],p[1],p[2],{
                    customTitle:"Room "+room.id,
                    customDescription:JSON.stringify(roomData),
                    roomNumber:room.id,
                    roomData:roomData
                });
            }catch(e){}

            try{
                api.setStandardChestItemSlot(p,0,"Paper",1,null,{
                    customDisplayName:"Room "+room.id,
                    customDescription:JSON.stringify(roomData)
                });
            }catch(e){}
        }
    },

    processJob:()=>{
        if(!RoomGen.jobs.length)return false;

        let blocks=0,rects=0,processed=0;

        while(RoomGen.jobs.length){
            let job=RoomGen.jobs[0];

            if(job.type==="block"){
                if(blocks>=5)break;
                api.setBlock(job.x,job.y,job.z,job.block);
                blocks++;
                processed++;
                RoomGen.jobs.shift();
                continue;
            }

            if(job.type==="rect"){
                if(rects>=2)break;
                api.setBlockRect(job.a,job.b,job.block);
                rects++;
                processed++;
                RoomGen.jobs.shift();
                continue;
            }

            RoomGen.jobs.shift();
        }

        if(!processed)return false;

        for(let i=0;i<RoomGen.rooms.length;i++){
            let room=RoomGen.rooms[i];
            if(room.generated)continue;

            let pending=false;

            for(let j=0;j<RoomGen.jobs.length;j++){
                if(RoomGen.jobs[j].roomId===room.id){
                    pending=true;
                    break;
                }
            }

            if(!pending)RoomGen.finishRoom(room);
        }

        return true;
    },

    playerEnteredChunk:(playerId,chunkId)=>{
        let key=playerId+":"+chunkId;
        if(RoomGen.chunks[key])return;
        RoomGen.chunks[key]=true;
        RoomGen.generateNext(RoomGen.options.maxRoomsPerChunk);
    },

    updatePlayer:playerId=>{
        let pos=api.getPosition(playerId);
        if(!pos)return;

        let chunkId;

        try{
            chunkId=api.blockCoordToChunkId([
                Math.floor(pos[0]),
                Math.floor(pos[1]),
                Math.floor(pos[2])
            ]);
        }catch(e){return;}

        if(RoomGen.players[playerId]===chunkId)return;
        RoomGen.players[playerId]=chunkId;
        RoomGen.playerEnteredChunk(playerId,chunkId);
    },

    tick:()=>{
        let players=api.getPlayerIds();

        for(let i=0;i<players.length;i++)RoomGen.updatePlayer(players[i]);

        RoomGen.processJob();
    },

    init:options=>{
        RoomGen.options=RoomGen.normalizeOptions(options);
        RoomGen.generateInitial();
        return RoomGen;
    },

    reset:()=>{
        RoomGen.rooms.length=0;
        RoomGen.jobs.length=0;
        RoomGen.chunks={};
        RoomGen.players={};
        RoomGen.chestPositions.length=0;
        RoomGen.roomNumber=0;
        RoomGen.nextTemplate=0;
        RoomGen.initialized=false;
    },

    getRooms:()=>RoomGen.rooms,
    getRoom:id=>RoomGen.rooms.find(r=>r.id===id)||null,

    getRoomAt:pos=>{
        for(let i=0;i<RoomGen.rooms.length;i++){
            let r=RoomGen.rooms[i],s=RoomGen.getRotatedSize(r.template,r.rotation);
            if(pos[0]>=r.pos[0]&&pos[0]<r.pos[0]+s[0]&&pos[1]>=r.pos[1]&&pos[1]<r.pos[1]+s[1]&&pos[2]>=r.pos[2]&&pos[2]<r.pos[2]+s[2])return r;
        }
        return null;
    },

    getRoomCount:()=>RoomGen.rooms.length,
    getQueueLength:()=>RoomGen.jobs.length,
    forceGenerate:(amount=1)=>RoomGen.generateNext(amount),
    setOptions:options=>RoomGen.options=RoomGen.normalizeOptions(options)
};

export function init(options){return RoomGen.init(options)}
export function tick(){return RoomGen.tick()}
export function saveRoomData(pos1,pos2,chestpos,options){return RoomGen.saveRoomData(pos1,pos2,chestpos,options)}
export function addRoomTemplate(data){return RoomGen.addRoomTemplate(data)}
export function clearTemplates(){return RoomGen.clearTemplates()}
export function getTemplates(){return RoomGen.getTemplates()}
export function addChestPosition(pos){return RoomGen.addChestPosition(pos)}
export function getChestPositions(){return RoomGen.getChestPositions()}
export function clearChestPositions(){return RoomGen.clearChestPositions()}
export function generate(amount){return RoomGen.forceGenerate(amount||1)}
export function getRooms(){return RoomGen.getRooms()}
export function getRoom(id){return RoomGen.getRoom(id)}
export function getRoomAt(pos){return RoomGen.getRoomAt(pos)}
export function getRoomCount(){return RoomGen.getRoomCount()}
export function getQueueLength(){return RoomGen.getQueueLength()}
export function reset(){return RoomGen.reset()}
export function setOptions(options){return RoomGen.setOptions(options)}