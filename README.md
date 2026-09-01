# Bloxd-Libs

![Bloxd.io](https://img.shields.io/badge/Bloxd.io-Libraries-ff69b4?style=for-the-badge)

![Free](https://img.shields.io/badge/Price-Free-8A2BE2?style=for-the-badge)

A collection of useful libraries for Bloxd.io, made by MangoIsSleepy.
The goal is to make complicated or repetitive Bloxd scripting easier without having to rewrite the same systems every time.
---
Installation
Bloxd-Libs doesn't need any external installation.
Create a new code file in your Bloxd world.
Copy the library into that file.
Give the file the correct name.
Import it wherever you need it.
For example:
```js
import{MathLib}from"./MathLib"
```
Do not include `.js` in the import.
You can import multiple libraries:
```js
import{MathLib}from"./MathLib"
import{WorldGen}from"./WorldGen"
import{Pathfinder}from"./Pathfinder"
import{Scheduler}from"./Scheduler"
import{RoomGen}from"./RoomGen"
```
---
Libraries
Library	Description
MathLib	Math, vectors, interpolation and noise!!1!1
WorldGen	Procedural terrain generation!!
Pathfinder	da best path finding
Scheduler	Like set interval & set timeout with other features
RoomGen	Procedural room gen
---
MathLib
MathLib is a collection of general math and 3D vector functions.
Import
```js
import{MathLib}from"./MathLib"
```
Vectors
```js
MathLib.add(a,b)
MathLib.sub(a,b)
MathLib.mul(a,n)
MathLib.div(a,n)
MathLib.neg(a)
MathLib.normalize(v)
```
Example:
```js
let a=[10,5,10]
let b=[20,5,20]
let result=MathLib.add(a,b)
```
Distance
```js
MathLib.distance(a,b)
MathLib.distance2(a,b)
MathLib.manhattan(a,b)
```
`distance2()` avoids the square root, which makes it useful when you only need to compare distances.
Other functions
```js
MathLib.dot(a,b)
MathLib.cross(a,b)
MathLib.length(v)
MathLib.length2(v)
MathLib.lerp(a,b,t)
MathLib.lerpVec(a,b,t)
MathLib.clamp(v,min,max)
MathLib.randomRange(min,max)
MathLib.randomInt(min,max)
```
Noise
```js
MathLib.noise2(x,y)
MathLib.noise3(x,y,z)
MathLib.fbm2(x,y)
MathLib.fbm3(x,y,z)
```
These are useful for procedural generation and other systems that need smooth random values.
---
WorldGen
WorldGen generates procedural terrain using noise, caves, ores, water and trees.
Import
```js
import{WorldGen}from"./WorldGen"
```
Generate an area
```js
WorldGen.generate(
    [-100,0,-100],
    [100,64,100],
    {
        seed:12345,
        baseHeight:20,
        scale:42
    }
)
```
The generator works over multiple ticks so it doesn't try to generate the entire area in one operation.
Add this to your existing `tick()`:
```js
WorldGen.tick()
```
Useful functions
```js
WorldGen.generate(pos1,pos2,options)
WorldGen.create(pos1,pos2,options)
WorldGen.step(job,columns)
WorldGen.tick(columns)
WorldGen.clearJobs()
```
The options can control things such as terrain height, sea level, caves, ores, trees and block types.
---
Pathfinder
Pathfinder finds routes through the world for an entity.
The entity ID is required so the pathfinder knows which entity is being moved.
Import
```js
import{Pathfinder}from"./Pathfinder"
```
Basic example
```js
let id=entityId
let start=api.getPosition(id)
let target=[50,5,50]

let path=Pathfinder.find(
    id,
    start,
    target,
    {
        allowDiagonal:true,
        allowJump:true,
        avoidWater:true,
        avoidLava:true
    }
)
```
If a path is found, `path` contains the path nodes.
If no path can be found, it returns `null`.
Add this to your existing `tick()`:
```js
Pathfinder.tick()
```
Pathfinder is intended for entities such as mobs, NPCs and custom enemies.
---
Scheduler
Scheduler handles delayed, repeating and conditional tasks.
Import
```js
import{Scheduler}from"./Scheduler"
```
Delayed task
```js
Scheduler.delay(()=>{
    api.broadcastMessage("Hello!")
},1000)
```
The function runs once after the specified delay.
Repeating task
```js
let id=Scheduler.interval(()=>{
    api.broadcastMessage("Running!")
},1000)
```
Cancel it with:
```js
Scheduler.cancel(id)
```
Conditional task
```js
Scheduler.once(
    ()=>api.getPlayerIds().length>0,
    ()=>{
        api.broadcastMessage("Someone joined!")
    },
    250
)
```
The last number controls how often the condition is checked.
Add this to your existing `tick()`:
```js
Scheduler.tick()
```
---
RoomGen
RoomGen creates procedural rooms and dungeons from rooms you build yourself.
Import
```js
import{RoomGen}from"./RoomGen"
```
1. Build a room
Build a room somewhere in your world.
Use Lime Wool wherever you want a doorway.
You can also place chests where you want RoomGen to keep track of them.
2. Save the room
```js
RoomGen.saveRoomData(
    [-100,0,-100],
    [-90,10,-90],
    [-95,1,-95],
    {name:"Basic Room"}
)
```
You can provide multiple chest positions:
```js
RoomGen.saveRoomData(
    [-80,0,-100],
    [-60,12,-80],
    [
        [-70,1,-90],
        [-65,1,-85]
    ],
    {name:"Treasure Room"}
)
```
RoomGen reads the blocks inside the selected area and stores the room data.
3. Initialize
```js
RoomGen.init({
    maxRoomsPerChunk:2,
    maxRooms:500
})
```
The first three rooms are generated automatically.
When a player enters a new chunk, more rooms can be queued for generation.
4. Tick
Add this to your existing `tick()`:
```js
RoomGen.tick()
```
Room generation is spread across ticks instead of trying to place an entire dungeon at once.
Doorways
Lime Wool is used as the doorway block.
RoomGen attempts to connect doorways to other doorways.
Rooms can also be rotated:
```text
0°
90°
180°
270°
```
This lets the generator fit rooms together in different orientations.
Useful functions
```js
RoomGen.generate(amount)
RoomGen.getRooms()
RoomGen.getRoom(id)
RoomGen.getRoomAt(pos)
RoomGen.getRoomCount()
RoomGen.getTemplates()
RoomGen.getQueueLength()
RoomGen.reset()
```
Chest positions
You can add chest positions manually:
```js
RoomGen.addChestPosition([20,5,30])
```
Get the stored positions with:
```js
let chests=RoomGen.getChestPositions()
```
Positions are stored as normal `[x,y,z]` arrays.
---
*Only import libraries as needed
*Some libraries require other libraries such as the MathLib.
---
Notes
Made for Bloxd.io.
Each library goes in its own code file.
Call libraries that require ticking from your existing `tick()`.
Large generation systems are intentionally spread across ticks.
The source files contain the full implementations.
---
<div align="center">
Bloxd-Libs
Made by MangoIsSleepy
Making Bloxd scripting a little less painful..? hopefully :3
</div>
