/*
╔══════════════════════════════════════════════════════════════╗
║                    BLOXD MATHLIB LINEAR                      ║
║                                                                ║
║                     Copyright © 2026                          ║
║                         _Xenon_                                ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝
*/
import{MathLib}from"./MathLib"
export let MathLibLinear={
    identity3:()=>[1,0,0,0,1,0,0,0,1],
    multiplyMat3:(a,b)=>{let o=new Array(9);for(let r=0;r<3;r++)for(let c=0;c<3;c++){let s=0;for(let k=0;k<3;k++)s+=a[r*3+k]*b[k*3+c];o[r*3+c]=s}return o},
    transposeMat3:m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]],
    determinantMat3:m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]),
    invertMat3:m=>{let a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<MathLib.EPS)return null;let inv=1/det;return[(e*i-f*h)*inv,(c*h-b*i)*inv,(b*f-c*e)*inv,(f*g-d*i)*inv,(a*i-c*g)*inv,(c*d-a*f)*inv,(d*h-e*g)*inv,(b*g-a*h)*inv,(a*e-b*d)*inv]},
    transformVec3:(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]],
    scaleMat3:(sx,sy,sz)=>[sx,0,0,0,sy,0,0,0,sz],
    axisAngleToMat3:(axis,angle)=>{let a=MathLib.normalize(axis),x=a[0],y=a[1],z=a[2],c=Math.cos(angle),s=Math.sin(angle),t=1-c;return[t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c]},
    quatToMat3:q=>{let x=q[0],y=q[1],z=q[2],w=q[3],x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;return[1-(yy+zz),xy-wz,xz+wy,xy+wz,1-(xx+zz),yz-wx,xz-wy,yz+wx,1-(xx+yy)]},
    solve3:(m,b)=>{let det=MathLibLinear.determinantMat3(m);if(Math.abs(det)<MathLib.EPS)return null;let mx=[b[0],m[1],m[2],b[1],m[4],m[5],b[2],m[7],m[8]],my=[m[0],b[0],m[2],m[3],b[1],m[5],m[6],b[2],m[8]],mz=[m[0],m[1],b[0],m[3],m[4],b[1],m[6],m[7],b[2]];return[MathLibLinear.determinantMat3(mx)/det,MathLibLinear.determinantMat3(my)/det,MathLibLinear.determinantMat3(mz)/det]},
    orthonormalBasis:forward=>{let f=MathLib.normalize(forward),ref=Math.abs(f[1])>0.999?[1,0,0]:[0,1,0],right=MathLib.normalize(MathLib.cross(ref,f)),up=MathLib.cross(f,right);return{forward:f,right:right,up:up}},
    identity4:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    multiplyMat4:(a,b)=>{let o=new Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=a[r*4+k]*b[k*4+c];o[r*4+c]=s}return o},
    transposeMat4:m=>[m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]],
    determinantMat4:m=>{let b00=m[0]*m[5]-m[1]*m[4],b01=m[0]*m[6]-m[2]*m[4],b02=m[0]*m[7]-m[3]*m[4],b03=m[1]*m[6]-m[2]*m[5],b04=m[1]*m[7]-m[3]*m[5],b05=m[2]*m[7]-m[3]*m[6],b06=m[8]*m[13]-m[9]*m[12],b07=m[8]*m[14]-m[10]*m[12],b08=m[8]*m[15]-m[11]*m[12],b09=m[9]*m[14]-m[10]*m[13],b10=m[9]*m[15]-m[11]*m[13],b11=m[10]*m[15]-m[11]*m[14];return b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06},
    invertMat4:m=>{let m00=m[0],m01=m[1],m02=m[2],m03=m[3],m10=m[4],m11=m[5],m12=m[6],m13=m[7],m20=m[8],m21=m[9],m22=m[10],m23=m[11],m30=m[12],m31=m[13],m32=m[14],m33=m[15],b00=m00*m11-m01*m10,b01=m00*m12-m02*m10,b02=m00*m13-m03*m10,b03=m01*m12-m02*m11,b04=m01*m13-m03*m11,b05=m02*m13-m03*m12,b06=m20*m31-m21*m30,b07=m20*m32-m22*m30,b08=m20*m33-m23*m30,b09=m21*m32-m22*m31,b10=m21*m33-m23*m31,b11=m22*m33-m23*m32,det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(Math.abs(det)<MathLib.EPS)return null;let id=1/det;return[(m11*b11-m12*b10+m13*b09)*id,(m02*b10-m01*b11-m03*b09)*id,(m31*b05-m32*b04+m33*b03)*id,(m22*b04-m21*b05-m23*b03)*id,(m12*b08-m10*b11-m13*b07)*id,(m00*b11-m02*b08+m03*b07)*id,(m32*b02-m30*b05-m33*b01)*id,(m20*b05-m22*b02+m23*b01)*id,(m10*b10-m11*b08+m13*b06)*id,(m01*b08-m00*b10-m03*b06)*id,(m30*b04-m31*b02+m33*b00)*id,(m21*b02-m20*b04-m23*b00)*id,(m11*b07-m10*b09-m12*b06)*id,(m00*b09-m01*b07+m02*b06)*id,(m31*b01-m30*b03-m32*b00)*id,(m20*b03-m21*b01+m22*b00)*id]},
    transformPoint:(m,p)=>{let x=m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],y=m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],z=m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11],w=m[12]*p[0]+m[13]*p[1]+m[14]*p[2]+m[15];return Math.abs(w-1)>MathLib.EPS&&Math.abs(w)>MathLib.EPS?[x/w,y/w,z/w]:[x,y,z]},
    transformDirection:(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[4]*v[0]+m[5]*v[1]+m[6]*v[2],m[8]*v[0]+m[9]*v[1]+m[10]*v[2]],
    translationMat4:v=>[1,0,0,v[0],0,1,0,v[1],0,0,1,v[2],0,0,0,1],
    scaleMat4:v=>[v[0],0,0,0,0,v[1],0,0,0,0,v[2],0,0,0,0,1],
    mat3ToMat4:m=>[m[0],m[1],m[2],0,m[3],m[4],m[5],0,m[6],m[7],m[8],0,0,0,0,1],
    axisAngleToMat4:(axis,angle)=>MathLibLinear.mat3ToMat4(MathLibLinear.axisAngleToMat3(axis,angle)),
    quatToMat4:q=>MathLibLinear.mat3ToMat4(MathLibLinear.quatToMat3(q)),
    composeTRS:(pos,quat,scale)=>{let r=MathLibLinear.quatToMat3(quat),rs=[r[0]*scale[0],r[1]*scale[1],r[2]*scale[2],r[3]*scale[0],r[4]*scale[1],r[5]*scale[2],r[6]*scale[0],r[7]*scale[1],r[8]*scale[2]],m=MathLibLinear.mat3ToMat4(rs);m[3]=pos[0];m[7]=pos[1];m[11]=pos[2];return m},
    decomposeTRS:m=>{let col0=[m[0],m[4],m[8]],col1=[m[1],m[5],m[9]],col2=[m[2],m[6],m[10]],sx=MathLib.length(col0),sy=MathLib.length(col1),sz=MathLib.length(col2),ex=sx<MathLib.EPS?1:sx,ey=sy<MathLib.EPS?1:sy,ez=sz<MathLib.EPS?1:sz,r=[col0[0]/ex,col1[0]/ey,col2[0]/ez,col0[1]/ex,col1[1]/ey,col2[1]/ez,col0[2]/ex,col1[2]/ey,col2[2]/ez];return{position:[m[3],m[7],m[11]],quaternion:MathLibLinear.mat3ToQuat(r),scale:[sx,sy,sz]}},
    lookAtMat4:(eye,target,up)=>{let f=MathLib.normalize(MathLib.sub(target,eye)),r=MathLib.normalize(MathLib.cross(f,up)),u=MathLib.cross(r,f),m3=[r[0],u[0],f[0],r[1],u[1],f[1],r[2],u[2],f[2]],m=MathLibLinear.mat3ToMat4(m3);m[3]=eye[0];m[7]=eye[1];m[11]=eye[2];return m},
    getTranslation:m=>[m[3],m[7],m[11]],
    getBasisX:m=>[m[0],m[4],m[8]],
    getBasisY:m=>[m[1],m[5],m[9]],
    getBasisZ:m=>[m[2],m[6],m[10]],
    identityQuat:()=>[0,0,0,1],
    axisAngleToQuat:(axis,angle)=>{let a=MathLib.normalize(axis),h=angle/2,s=Math.sin(h);return[a[0]*s,a[1]*s,a[2]*s,Math.cos(h)]},
    quatToAxisAngle:q=>{let n=MathLibLinear.normalizeQuat(q),angle=2*Math.acos(MathLib.clamp(n[3],-1,1)),s=Math.sqrt(1-n[3]*n[3]);return s<MathLib.EPS?{axis:[1,0,0],angle:angle}:{axis:[n[0]/s,n[1]/s,n[2]/s],angle:angle}},
    eulerToQuat:(x,y,z)=>{let cx=Math.cos(x/2),sx=Math.sin(x/2),cy=Math.cos(y/2),sy=Math.sin(y/2),cz=Math.cos(z/2),sz=Math.sin(z/2);return[sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]},
    quatToEuler:q=>{let m=MathLibLinear.quatToMat3(q),m13=m[2],m23=m[5],m33=m[8],m12=m[1],m11=m[0],m32=m[7],m22=m[4],y=Math.asin(MathLib.clamp(m13,-1,1));if(Math.abs(m13)<0.9999999)return[Math.atan2(-m23,m33),y,Math.atan2(-m12,m11)];return[Math.atan2(m32,m22),y,0]},
    mat3ToQuat:m=>{let t=m[0]+m[4]+m[8],x,y,z,w,s;if(t>0){s=0.5/Math.sqrt(t+1);w=0.25/s;x=(m[7]-m[5])*s;y=(m[2]-m[6])*s;z=(m[3]-m[1])*s}else if(m[0]>m[4]&&m[0]>m[8]){s=2*Math.sqrt(1+m[0]-m[4]-m[8]);w=(m[7]-m[5])/s;x=0.25*s;y=(m[1]+m[3])/s;z=(m[2]+m[6])/s}else if(m[4]>m[8]){s=2*Math.sqrt(1+m[4]-m[0]-m[8]);w=(m[2]-m[6])/s;x=(m[1]+m[3])/s;y=0.25*s;z=(m[5]+m[7])/s}else{s=2*Math.sqrt(1+m[8]-m[0]-m[4]);w=(m[3]-m[1])/s;x=(m[2]+m[6])/s;y=(m[5]+m[7])/s;z=0.25*s}return[x,y,z,w]},
    fromToQuat:(from,to)=>{let f=MathLib.normalize(from),t=MathLib.normalize(to),d=MathLib.dot(f,t);if(d>=1-MathLib.EPS)return MathLibLinear.identityQuat();if(d<=-1+MathLib.EPS){let ax=MathLib.cross([1,0,0],f);if(MathLib.length(ax)<MathLib.EPS)ax=MathLib.cross([0,1,0],f);return MathLibLinear.axisAngleToQuat(MathLib.normalize(ax),Math.PI)}let ax2=MathLib.cross(f,t),s=Math.sqrt((1+d)*2),inv=1/s;return[ax2[0]*inv,ax2[1]*inv,ax2[2]*inv,s*0.5]},
    multiplyQuat:(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]],
    conjugateQuat:q=>[-q[0],-q[1],-q[2],q[3]],
    lengthQuat:q=>Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]),
    normalizeQuat:q=>{let l=MathLibLinear.lengthQuat(q);return l<MathLib.EPS?MathLibLinear.identityQuat():[q[0]/l,q[1]/l,q[2]/l,q[3]/l]},
    inverseQuat:q=>{let ls=q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3];if(ls<MathLib.EPS)return MathLibLinear.identityQuat();let c=MathLibLinear.conjugateQuat(q);return[c[0]/ls,c[1]/ls,c[2]/ls,c[3]/ls]},
    dotQuat:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],
    lerpQuat:(a,b,t)=>MathLibLinear.normalizeQuat([MathLib.lerp(a[0],b[0],t),MathLib.lerp(a[1],b[1],t),MathLib.lerp(a[2],b[2],t),MathLib.lerp(a[3],b[3],t)]),
    slerpQuat:(a,b,t)=>{let bx=b[0],by=b[1],bz=b[2],bw=b[3],cosHalf=MathLibLinear.dotQuat(a,b);if(cosHalf<0){bx=-bx;by=-by;bz=-bz;bw=-bw;cosHalf=-cosHalf}if(cosHalf>1-MathLib.EPS)return MathLibLinear.lerpQuat(a,[bx,by,bz,bw],t);let halfTheta=Math.acos(MathLib.clamp(cosHalf,-1,1)),sinHalf=Math.sqrt(1-cosHalf*cosHalf);if(sinHalf<MathLib.EPS)return[(a[0]+bx)*0.5,(a[1]+by)*0.5,(a[2]+bz)*0.5,(a[3]+bw)*0.5];let ra=Math.sin((1-t)*halfTheta)/sinHalf,rb=Math.sin(t*halfTheta)/sinHalf;return[a[0]*ra+bx*rb,a[1]*ra+by*rb,a[2]*ra+bz*rb,a[3]*ra+bw*rb]},
    rotateVecByQuat:(q,v)=>{let qv=[q[0],q[1],q[2]],t=MathLib.mul(MathLib.cross(qv,v),2),c=MathLib.cross(qv,t);return MathLib.add(MathLib.add(v,MathLib.mul(t,q[3])),c)},
    angleBetweenQuat:(a,b)=>{let rel=MathLibLinear.multiplyQuat(MathLibLinear.inverseQuat(a),b);return 2*Math.acos(MathLib.clamp(Math.abs(rel[3]),0,1))}
}
