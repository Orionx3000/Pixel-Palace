
const {useState,useRef,useEffect,useCallback,useMemo} = React;

// ─── HELPERS ───────────────────────────────────────────────────────────────
const rgbToHex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('');
const hexToRgb=h=>{const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return{r,g,b}};
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

// Perlin noise (simplified 2D)
class Perlin{
  constructor(seed=Math.random()*9999){
    this.grad=[];for(let i=0;i<256;i++)this.grad[i]=i;
    for(let i=255;i>0;i--){const j=Math.floor((seed+i*7919)%(i+1));[this.grad[i],this.grad[j]]=[this.grad[j],this.grad[i]];}
    this.perm=this.grad.concat(this.grad);
  }
  fade(t){return t*t*t*(t*(t*6-15)+10)}
  lerp(a,b,t){return a+t*(b-a)}
  dot(g,x,y){return(g&1?x:-x)+(g&2?y:-y)}
  noise(x,y){
    const X=Math.floor(x)&255,Y=Math.floor(y)&255;
    const xf=x-Math.floor(x),yf=y-Math.floor(y);
    const u=this.fade(xf),v=this.fade(yf);
    const aa=this.perm[this.perm[X]+Y],ab=this.perm[this.perm[X]+Y+1];
    const ba=this.perm[this.perm[X+1]+Y],bb=this.perm[this.perm[X+1]+Y+1];
    return this.lerp(this.lerp(this.dot(this.grad[aa%256],xf,yf),this.dot(this.grad[ba%256],xf-1,yf),u),
                     this.lerp(this.dot(this.grad[ab%256],xf,yf-1),this.dot(this.grad[bb%256],xf-1,yf-1),u),v);
  }
  fbm(x,y,octaves=4,lacunarity=2,gain=.5){
    let v=0,amp=1,freq=1,max=0;
    for(let i=0;i<octaves;i++){v+=amp*this.noise(x*freq,y*freq);max+=amp;amp*=gain;freq*=lacunarity;}
    return v/max;
  }
}

// ─── DEFAULT STATE ─────────────────────────────────────────────────────────
const makeFrame=(w,h)=>{
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  return {id:uid(),duration:100,canvas:c,ctx};
};
const makeLayer=(w,h,name)=>(
  {id:uid(),name,visible:true,opacity:1,frames:[makeFrame(w,h)],currentFrame:0,
   type:'pixel',tilemap:null}
);
const DEFAULT_W=64,DEFAULT_H=64,TILE_SIZE=16;

   // ─── APP ───────────────────────────────────────────────────────────────────
function App(){
  const [w,setW]=useState(DEFAULT_W);
  const [h,setH]=useState(DEFAULT_H);
  const [layers,setLayers]=useState([makeLayer(DEFAULT_W,DEFAULT_H,'Layer 1')]);
  const [shapePreset,setShapePreset]=useState(null);
  const [activeLayerIdx,setActiveLayerIdx]=useState(0);
  const [tool,setTool]=useState('pencil');
  const [color,setColor]=useState('#ffffff');

  // Tool Params State
  const [fillShape, setFillShape] = useState(true);
  const [lineThickness, setLineThickness] = useState(1);
  const [natVertices, setNatVertices] = useState(5);
  const [natIrregularity, setNatIrregularity] = useState(0.5);
  const [gradColors, setGradColors] = useState(3);
  const [effectType, setEffectType] = useState('grayscale');
  const overlayRef = useRef(null);
  const [gradMask, setGradMask] = useState(null);

  const [gradEnd,setGradEnd]=useState('#29adff');
  const [brushSize,setBrushSize]=useState(1);
  const [pixelateSize,setPixelateSize]=useState(4);
  const [hueShift,setHueShift]=useState(30);
  const [zoom,setZoom]=useState(400);
  const [palette,setPalette]=useState(['#000000','#ffffff','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c']);
  const [swapA,setSwapA]=useState(null);
  const [swapB,setSwapB]=useState(null);
  const [showExport,setShowExport]=useState(false);
  const [showProject,setShowProject]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [showEffects,setShowEffects]=useState(false);
  const [showExtract,setShowExtract]=useState(false);
  const [cellW,setCellW]=useState(16);
  const [cellH,setCellH]=useState(16);
  const [extractDims,setExtractDims]=useState('');
  const extractImgRef=useRef(null);
   const [showTiles,setShowTiles]=useState(false);
   const [mode,setMode]=useState('pixel'); // 'pixel' | 'tile'
   const [drawing,setDrawing]=useState(false);
   const [uiTick,setUiTick]=useState(0);
   const [drawOrigin,setDrawOrigin]=useState(null);
   const [isPlaying,setPlaying]=useState(false);
   const [fps,setFps]=useState(8);
   const [loop,setLoop]=useState(true);
   const [currentGlobalFrame,setCurrentGlobalFrame]=useState(0);
   const [toast,setToast]=useState(null);
   const toastTimer=useRef(null);

   // ─── AI GENERATE BAR ────────────────────────────────────────────────
   const [showGenerate,setShowGenerate]=useState(true);
   const [genPrompt,setGenPrompt]=useState('');
   const [genMode,setGenMode]=useState('pixel'); // 'pixel' | 'isometric' | 'pattern' | 'variation'
   const [genLoading,setGenLoading]=useState(false);
   const [genError,setGenError]=useState(null);
   const [genWidth,setGenWidth]=useState(64);
   const [genHeight,setGenHeight]=useState(64);
   const [genColors,setGenColors]=useState(16);
   const [genSeed,setGenSeed]=useState('');
   const [genModel,setGenModel]=useState('sd-turbo');
   const [genStrength,setGenStrength]=useState(0.4);
   const [genResult,setGenResult]=useState(null);
   const [sidecarUrl,setSidecarUrl]=useState('http://127.0.0.1:7862');
   const [sidecarStatus,setSidecarStatus]=useState('disconnected');

   // Greeble/Perlin brush settings
   const [greebleStrength,setGreebleStrength]=useState(0.3);
   const [greebleComplexity,setGreebleComplexity]=useState(3);
   const [greebleAmount,setGreebleAmount]=useState(0.6);

   // Tile editing
   const [tileSpritesheet,setTileSpritesheet]=useState(null);
   const [tileSize,setTileSize]=useState(TILE_SIZE);
   const [selectedTile,setSelectedTile]=useState(-1);
   const [tilesetCols,setTilesetCols]=useState(1);

   // Shape presets for natural elements
   const shapePresets=[
     'vine','tree','bush','grass','flower','rock','branch','leaf'
   ];

   // Shape preset generators
   const generateVine=(x,y,size,angle,nodes)=>{
     const points=[];
     const startX=x,startY=y;
     let curX=startX,curY=startY;
     for(let n=0;n<nodes;n++){
       const r=size*(1-n/nodes);
       const nodeAngle=angle+(Math.random()-0.5)*0.4;
       const nextX=curX+r*Math.cos(nodeAngle);
       const nextY=curY+r*Math.sin(nodeAngle);
       points.push([curX,curY,nextX,nextY]);
       curX=nextX;curY=nextY;
     }
     return points;
   };

   const generateTree=(x,y,size,hue)=>{
     const trunkPoints=[];
     const baseW=size*0.3,baseH=size*1.5;
     trunkPoints.push([x-baseW/2,y],[x+baseW/2,y],[x+(baseW/2+size*0.15),y-baseH],[x+baseW/2,y-baseH]);
     return trunkPoints;
   };

   const generateGrass=(x,y,size,count)=>{
     const blades=[];
     for(let c=0;c<count;c++){
       const offsetX=(Math.random()-0.5)*size*0.8;
       const bladeW=size*0.05+Math.random()*size*0.15;
       const bladeH=size*0.5+Math.random()*size*0.8;
       blades.push([x+offsetX,y-bladeH],[x+offsetX+bladeW*0.2,y],[x+offsetX+bladeW,y-bladeH*0.7]);
     }
     return blades;
   };

   const generateBush=(x,y,size,hue)=>{
     const spheres=[];
     for(let i=0;i<4;i++){
       const radius=size*(0.7-Math.random()*0.5);
       spheres.push([x+(Math.random()-0.5)*size*0.6,y+(Math.random()-0.5)*size*0.6,radius]);
     }
     return spheres;
   };

   const generateFlowers=(x,y,size,petals)=>{
     const flowers=[];
     for(let i=0;i<petals;i++){
       const angle=(Math.PI*2/petals)*i+Math.random()*0.1;
       const length=size*1.5;
       const width=size*0.4+Math.random()*size*0.2;
       flowers.push([x+length*Math.cos(angle),y+length*Math.sin(angle),angle,width]);
     }
     return flowers;
   };

  // Refs
  const canvasRef=useRef(null);
  const displayRef=useRef(null);
  const playRef=useRef(null);
  const layersRef=useRef(layers); layersRef.current=layers;
  const wRef=useRef(w); wRef.current=w;
  const hRef=useRef(h); hRef.current=h;
  const activeLayerRef=useRef(activeLayerIdx); activeLayerRef.current=activeLayerIdx;
  const currentGlobalFrameRef=useRef(currentGlobalFrame); currentGlobalFrameRef.current=currentGlobalFrame;
  const modeRef=useRef(mode); modeRef.current=mode;
  const toolRef=useRef(tool); toolRef.current=tool;
  const colorRef=useRef(color); colorRef.current=color;
  const brushSizeRef=useRef(brushSize); brushSizeRef.current=brushSize;
  const selectedTileRef=useRef(selectedTile); selectedTileRef.current=selectedTile;
  const tileSpritesheetRef=useRef(tileSpritesheet); tileSpritesheetRef.current=tileSpritesheet;

  const show=(msg)=>{setToast(msg);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),2500);};

  // ─── LAYER OPERATIONS ────────────────────────────────────────────────────
  const activeLayer=layers[activeLayerIdx]||layers[0];
  const activeFrame=activeLayer?.frames?.[activeLayer.currentFrame];
  const layerCanvas=activeFrame?.canvas;
   const layerCtx=activeFrame?.ctx;

   const drawGreeble=(p)=>{
     if(!layerCtx||mode!=='pixel')return;
     const perlin=new Perlin(Date.now()/1000);
     const bw=Math.max(1,brushSize|0);
     const half=Math.floor(bw/2);
     layerCtx.save();
     layerCtx.globalCompositeOperation='source-over';

     for(let dx=-half;dx<=half;dx++)for(let dy=-half;dy<=half;dy++){
       const distance=Math.hypot(dx,dy);
       if(distance>half)continue;
       const nx=(p.x+dx)/w,ny=(p.y+dy)/h;
       const noise=perlin.fbm(nx*8,ny*8,greebleComplexity,greebleAmount,greebleStrength);
       if(noise>0.3){
         const adjustColor=distance<=half*0.3?{r:0,g:128,b:0}:{r:255,g:200,b:0};
         layerCtx.fillStyle=`rgb(${adjustColor.r},${adjustColor.g},${adjustColor.b})`;
         layerCtx.fillRect(p.x+dx,p.y+dy,1,1);
       }
     }
     layerCtx.restore();commitStroke();
   };

   const drawNaturalShape=(type,x,y,size)=>{
     if(!layerCtx||mode!=='pixel')return;
     layerCtx.save();layerCtx.globalCompositeOperation='source-over';
     switch(type){
       case'vine':{
         const vinePoints=generateVine(x,y,size,0,3);
         layerCtx.strokeStyle='#2d5016';layerCtx.lineWidth=Math.max(1,brushSize|0);
         layerCtx.beginPath();layerCtx.moveTo(vinePoints[0][0],vinePoints[0][1]);
         for(const[p1x,p1y,p2x,p2y]of vinePoints){
           const cx=(p1x+p2x)/2,cy=(p1y+p2y)/2;
           layerCtx.quadraticCurveTo(p1x,p1y,p2x,p2y);
         }
         layerCtx.stroke();
         break;
       }
       case'tree':
         const trunkPath=generateTree(x,y,size);
         layerCtx.fillStyle='#8b4513';
         for(const[ax,ay,bx,by]of trunkPath)layerCtx.beginPath(),layerCtx.moveTo(ax,ay),layerCtx.lineTo(bx,by),layerCtx.stroke();break;
       case'bush':
         const bushPoints=generateBush(x,y,size);
         layerCtx.fillStyle='#228b22';
         for(const[cx,cy,radius]of bushPoints)layerCtx.beginPath(),layerCtx.arc(cx,cy,radius,0,Math.PI*2),layerCtx.fill();break;
       case'grass':
         const grassBlades=generateGrass(x,y,size,Math.floor(size));
         layerCtx.fillStyle='#7cb342';
         for(const[ax,ay,bx,by,cx,cy]of grassBlades)layerCtx.beginPath(),layerCtx.moveTo(ax,ay),layerCtx.lineTo(bx,by),layerCtx.lineTo(cx,cy),layerCtx.closePath(),layerCtx.fill();break;
       case'flower':
         const flowerPoints=generateFlowers(x,y,size,6);
         layerCtx.fillStyle='#ff69b4';
         for(const[fx,fy,angle,width]of flowerPoints){layerCtx.save();layerCtx.translate(fx,fy);layerCtx.rotate(angle);
           layerCtx.beginPath();layerCtx.ellipse(0,0,width/2,size*0.8,0,0,Math.PI*2);layerCtx.fill();layerCtx.restore();}
         break;
       default:return;
     }
     layerCtx.restore();commitStroke();
   };

   const addLayer=()=>{
    const name='Layer '+(layers.length+1);
    setLayers([...layers,makeLayer(w,h,name)]);
    setActiveLayerIdx(layers.length);
  };
  const deleteLayer=(idx)=>{
    if(layers.length<=1){show('Need at least 1 layer');return;}
    const next=layers.filter((_,i)=>i!==idx);
    setLayers(next);
    setActiveLayerIdx(Math.min(idx,next.length-1));
  };
  const duplicateLayer=(idx)=>{
    const src=layers[idx];
    const newFrames=src.frames.map(f=>{
      const nc=document.createElement('canvas');nc.width=f.canvas.width;nc.height=f.canvas.height;
      nc.getContext('2d').drawImage(f.canvas,0,0);
      return{id:uid(),duration:f.duration,canvas:nc,ctx:nc.getContext('2d')};
    });
    const dup={...src,id:uid(),name:src.name+' copy',frames:newFrames};
    const next=[...layers];next.splice(idx+1,0,dup);
    setLayers(next);setActiveLayerIdx(idx+1);
  };
  const toggleLayerVis=(idx)=>setLayers(layers.map((l,i)=>i===idx?{...l,visible:!l.visible}:l));
  const setLayerOpacity=(idx,op)=>setLayers(layers.map((l,i)=>i===idx?{...l,opacity:clamp(op,0,1)}:l));

  // ─── FRAME OPERATIONS ────────────────────────────────────────────────────
  const currentFrames=activeLayer?.frames||[];
  const addFrame=()=>{
    const nc=document.createElement('canvas');nc.width=w;nc.height=h;
    const ctx=nc.getContext('2d');
    ctx.drawImage(layerCanvas,0,0);
    const newFrames=[...currentFrames,{id:uid(),duration:100,canvas:nc,ctx}];
    setLayers(layers.map((l,i)=>i===activeLayerIdx?{...l,frames:newFrames,currentFrame:newFrames.length-1}:l));
  };
  const dupFrame=()=>{
    const nc=document.createElement('canvas');nc.width=w;nc.height=h;
    nc.getContext('2d').drawImage(layerCanvas,0,0);
    const idx=activeLayer.currentFrame;
    const newFrames=[...currentFrames];
    newFrames.splice(idx+1,0,{id:uid(),duration:100,canvas:nc,ctx:nc.getContext('2d')});
    setLayers(layers.map((l,i)=>i===activeLayerIdx?{...l,frames:newFrames,currentFrame:idx+1}:l));
  };
  const delFrame=()=>{
    if(currentFrames.length<=1){show('Need at least 1 frame');return;}
    const idx=activeLayer.currentFrame;
    const newFrames=currentFrames.filter((_,i)=>i!==idx);
    setLayers(layers.map((l,i)=>i===activeLayerIdx?{...l,frames:newFrames,currentFrame:Math.min(idx,newFrames.length-1)}:l));
  };
  const setFrame=(idx)=>setLayers(layers.map((l,i)=>i===activeLayerIdx?{...l,currentFrame:idx}:l));

  // ─── DRAWING ─────────────────────────────────────────────────────────────
  const getPos=(e)=>{
    const c=displayRef.current;if(!c)return null;
    const rect=c.getBoundingClientRect();
    const cx=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
    const cy=(e.touches?e.touches[0].clientY:e.clientY)-rect.top;
    const scale=zoom/100;
    const px=Math.floor(cx/scale),py=Math.floor(cy/scale);
    if(px<0||px>=w||py<0||py>=h)return null;
    return{x:px,y:py};
  };

  const commitStroke=()=>{/* triggers re-render */setLayers(l=>[...l]);};

  const drawPixel=(p)=>{
    if(!layerCtx||mode==='tile')return;
    layerCtx.fillStyle=color;
    const bw=Math.max(1,brushSize|0);
    if(bw<=1)layerCtx.fillRect(p.x,p.y,1,1);
    else{
      const half=Math.floor(bw/2);
      if(bw<=3)layerCtx.fillRect(p.x-half,p.y-half,bw,bw);
      else for(let dx=-half;dx<=half;dx++)for(let dy=-half;dy<=half;dy++)
        if(dx*dx+dy*dy<=half*half)layerCtx.fillRect(p.x+dx,p.y+dy,1,1);
    }
    commitStroke();
  };
  const erasePixel=(p)=>{
    if(!layerCtx||mode==='tile')return;
    const bw=Math.max(1,brushSize|0);
    const half=Math.floor(bw/2);
    for(let dx=-half;dx<=half;dx++)for(let dy=-half;dy<=half;dy++)
      if(dx*dx+dy*dy<=half*half)layerCtx.clearRect(p.x+dx,p.y+dy,1,1);
    commitStroke();
  };

  // Eyedropper
  const pickColor=(p)=>{
    if(!layerCtx)return;
    const px=layerCtx.getImageData(p.x,p.y,1,1).data;
    if(px[3]>0)setColor(rgbToHex(px[0],px[1],px[2]));
  };

  // Flood fill
  const floodFill=(startX,startY)=>{
    if(!layerCtx)return;
    const img=layerCtx.getImageData(0,0,w,h),d=img.data;
    const idx=(startY*w+startX)*4;
    const sr=d[idx],sg=d[idx+1],sb=d[idx+2],sa=d[idx+3];
    const cr=parseInt(color.slice(1,3),16),cg=parseInt(color.slice(3,5),16),cb=parseInt(color.slice(5,7),16);
    if(sr===cr&&sg===cg&&sb===cb&&sa===255)return;
    const visited=new Uint8Array(w*h);
    const stack=[[startX,startY]];
    while(stack.length){
      const [x,y]=stack.pop();
      if(x<0||x>=w||y<0||y>=h)continue;
      if(visited[y*w+x])continue;
      const i=(y*w+x)*4;
      if(d[i]!==sr||d[i+1]!==sg||d[i+2]!==sb||d[i+3]!==sa)continue;
      visited[y*w+x]=1;
      d[i]=cr;d[i+1]=cg;d[i+2]=cb;d[i+3]=255;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    layerCtx.putImageData(img,0,0);
    commitStroke();
  };

  const floodErase=(startX,startY)=>{
    if(!layerCtx)return;
    const img=layerCtx.getImageData(0,0,w,h),d=img.data;
    const idx=(startY*w+startX)*4;
    const sr=d[idx],sg=d[idx+1],sb=d[idx+2],sa=d[idx+3];
    const stack=[[startX,startY]];
    const visited=new Uint8Array(w*h);
    while(stack.length){
      const [x,y]=stack.pop();
      if(x<0||x>=w||y<0||y>=h)continue;
      if(visited[y*w+x])continue;
      const i=(y*w+x)*4;
      if(d[i]!==sr||d[i+1]!==sg||d[i+2]!==sb||d[i+3]!==sa)continue;
      visited[y*w+x]=1;
      d[i+3]=0;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    layerCtx.putImageData(img,0,0);
    commitStroke();
  };

  const swapColors=()=>{
    if(!swapA||!swapB||swapA===swapB){show('Pick two colors first');return;}
    const ar=parseInt(swapA.slice(1,3),16),ag=parseInt(swapA.slice(3,5),16),ab=parseInt(swapA.slice(5,7),16);
    const br=parseInt(swapB.slice(1,3),16),bg=parseInt(swapB.slice(3,5),16),bb=parseInt(swapB.slice(5,7),16);
    layers.forEach(l=>l.frames.forEach(f=>{
      const c=f.canvas,ctx=c.getContext('2d');
      const img=ctx.getImageData(0,0,w,h),d=img.data;
      for(let p=0;p<d.length;p+=4){
        if(d[p]===ar&&d[p+1]===ag&&d[p+2]===ab&&d[p+3]===255){d[p]=br;d[p+1]=bg;d[p+2]=bb;d[p+3]=255;}
        else if(d[p]===br&&d[p+1]===bg&&d[p+2]===bb&&d[p+3]===255){d[p]=ar;d[p+1]=ag;d[p+2]=ab;d[p+3]=255;}
      }
      ctx.putImageData(img,0,0);
    }));
    commitStroke();setShowEffects(false);
  };

  // Shape drawing helpers
  const drawLine=(x1,y1,x2,y2)=>{
    if(!layerCtx)return;
    layerCtx.fillStyle=color;
    const bw=Math.max(1,brushSize|0);
    const dx=Math.abs(x2-x1),dy=Math.abs(y2-y1);
    const steps=Math.max(dx,dy);
    for(let i=0;i<=steps;i++){
      const t=i/steps;
      const x=Math.round(lerp(x1,x2,t)),y=Math.round(lerp(y1,y2,t));
      const half=Math.floor(bw/2);
      for(let ox=-half;ox<=half;ox++)for(let oy=-half;oy<=half;oy++)
        if(ox*ox+oy*oy<=half*half)layerCtx.fillRect(x+ox,y+oy,1,1);
    }
  };
  const drawRectFill=(x1,y1,x2,y2)=>{
    if(!layerCtx)return;
    layerCtx.fillStyle=color;
    const lx=Math.min(x1,x2),rx=Math.max(x1,x2),ty=Math.min(y1,y2),by=Math.max(y1,y2);
    layerCtx.fillRect(lx,ty,rx-lx+1,by-ty+1);
  };
  const drawRectOutline=(x1,y1,x2,y2)=>{
    if(!layerCtx)return;
    layerCtx.fillStyle=color;
    const lx=Math.min(x1,x2),rx=Math.max(x1,x2),ty=Math.min(y1,y2),by=Math.max(y1,y2);
    const bw=Math.max(1,brushSize|0);
    for(let x=lx;x<=rx;x++)for(let i=0;i<bw;i++){
      if(ty+i<by)layerCtx.fillRect(x,ty+i,1,1);
      if(by-i>ty)layerCtx.fillRect(x,by-i,1,1);
    }
    for(let y=ty;y<=by;y++)for(let i=0;i<bw;i++){
      if(lx+i<rx)layerCtx.fillRect(lx+i,y,1,1);
      if(rx-i>lx)layerCtx.fillRect(rx-i,y,1,1);
    }
  };
  const drawCircleFill=(x1,y1,x2,y2)=>{
    if(!layerCtx)return;
    const cx=(x1+x2)/2,cy=(y1+y2)/2,rx=Math.abs(x2-x1)/2,ry=Math.abs(y2-y1)/2;
    if(rx<.5||ry<.5)return;
    layerCtx.fillStyle=color;
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)
      for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++)
        if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)layerCtx.fillRect(x,y,1,1);
  };
  const drawCircleOutline=(x1,y1,x2,y2)=>{
    if(!layerCtx)return;
    const cx=(x1+x2)/2,cy=(y1+y2)/2,rx=Math.abs(x2-x1)/2,ry=Math.abs(y2-y1)/2;
    if(rx<.5||ry<.5)return;
    layerCtx.fillStyle=color;
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)
      for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){
        const v=((x-cx)/rx)**2+((y-cy)/ry)**2;
        if(v>=.8&&v<=1)layerCtx.fillRect(x,y,1,1);
      }
  };

  // TILE MODE
  const placeTile=(px,py)=>{
    if(!layerCtx||mode!=='tile'||selectedTile<0||!tileSpritesheet)return;
    const ts=tileSize;
    const tx=Math.floor(px/ts),ty=Math.floor(py/ts);
    const sx=(selectedTile%tilesetCols)*ts,sy=Math.floor(selectedTile/tilesetCols)*ts;
    layerCtx.drawImage(tileSpritesheet,sx,sy,ts,ts,tx*ts,ty*ts,ts,ts);
    commitStroke();
  };

   // ─── HANDLERS ────────────────────────────────────────────────────────────
   
   const getOverlayCtx = () => {
      const cv = overlayRef.current;
      if (!cv) return null;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      return { ctx, dw: cv.width, dh: cv.height };
   };

   const drawLivePreview = (p) => {
      const overlay = getOverlayCtx();
      if (!overlay) return;
      const { ctx, dw, dh } = overlay;
      ctx.clearRect(0,0,dw,dh);
      
      const scale = zoom/100;
      const ox = drawOrigin.x * scale;
      const oy = drawOrigin.y * scale;
      const px = p.x * scale;
      const py = p.y * scale;

      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineThickness * scale;

      if (tool === 'line') {
         ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
      } else if (tool === 'rect') {
         if (fillShape) ctx.fillRect(ox, oy, px-ox, py-oy);
         else ctx.strokeRect(ox, oy, px-ox, py-oy);
      } else if (tool === 'circle') {
         const cx = (ox+px)/2, cy = (oy+py)/2;
         const rx = Math.abs(px-ox)/2, ry = Math.abs(py-oy)/2;
         ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
         if (fillShape) ctx.fill(); else ctx.stroke();
      }
   };

   const handleDown=(e)=>{
     if(e.touches)e.preventDefault();
     const p=getPos(e);if(!p)return;
     if(tool==='eyedropper'){pickColor(p);return;}
     if(mode==='tile'){placeTile(p.x,p.y);return;}
     if(tool==='erasefill'){floodErase(p.x,p.y);return;}
    if(['fill'].includes(tool)){floodFill(p.x,p.y);return;}
     
      if(tool === 'gradient') {
         // Generate flood mask
         const img=layerCtx.getImageData(0,0,w,h),d=img.data;
         const startX = Math.floor(p.x), startY = Math.floor(p.y);
         const idx=(startY*w+startX)*4;
         const sr=d[idx],sg=d[idx+1],sb=d[idx+2],sa=d[idx+3];
         const visited=new Uint8Array(w*h);
         const stack=[[startX,startY]];
         while(stack.length){
           const [x,y]=stack.pop();
           if(x<0||x>=w||y<0||y>=h)continue;
           if(visited[y*w+x])continue;
           const i=(y*w+x)*4;
           if(Math.abs(d[i]-sr)>5||Math.abs(d[i+1]-sg)>5||Math.abs(d[i+2]-sb)>5||Math.abs(d[i+3]-sa)>5)continue; // tolerance
           visited[y*w+x]=1;
           stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
         }
         window.__tempGradMask = visited; // immediate sync reference
         setGradMask(visited);
         setDrawOrigin(p);setDrawing(true);
         return;
      }

     if(['line','rect','circle'].includes(tool)){
       setDrawOrigin(p);setDrawing(true);
       return;
     }
     setDrawing(true);
     if(tool==='pencil')drawPixel(p);
     else if(tool==='eraser')erasePixel(p);
     else if(tool==='greeble')drawGreeble(p);
     else if(tool==='natural')setDrawOrigin(p);setDrawing(true);setUiTick(t=>t+1);
   };
   const handleMove=(e)=>{
     if(e.touches)e.preventDefault();
     const p=getPos(e);if(!p)return;
     if(!drawing&&mode!=='tile')return;setUiTick(t=>t+1);
     if(tool==='pencil')drawPixel(p);
     else if(tool==='eraser')erasePixel(p);
     else if(tool==='greeble')drawGreeble(p);
     
      
      if (tool === 'gradient' && drawOrigin) {
         drawBoundedGradient(drawOrigin.x, drawOrigin.y, p.x, p.y, true);
         return;
      }

      if(['line','rect','circle'].includes(tool) && drawOrigin) {
         drawLivePreview(p);
         return;
      }
      if (tool === 'effect_brush') {
         // Apply local effect
         if(layerCtx) {
            const size = lineThickness;
            const img = layerCtx.getImageData(p.x, p.y, size, size);
            const d = img.data;
            for(let i=0; i<d.length; i+=4) {
               if(d[i+3]===0) continue; // skip transparent
               if(effectType === 'grayscale') {
                  const g = .299*d[i] + .587*d[i+1] + .114*d[i+2];
                  d[i]=g; d[i+1]=g; d[i+2]=g;
               } else if(effectType === 'invert') {
                  d[i]=255-d[i]; d[i+1]=255-d[i+1]; d[i+2]=255-d[i+2];
               } else if(effectType === 'sepia') {
                  const tr = 0.393*d[i] + 0.769*d[i+1] + 0.189*d[i+2];
                  const tg = 0.349*d[i] + 0.686*d[i+1] + 0.168*d[i+2];
                  const tb = 0.272*d[i] + 0.534*d[i+1] + 0.131*d[i+2];
                  d[i]=Math.min(255,tr); d[i+1]=Math.min(255,tg); d[i+2]=Math.min(255,tb);
               }
            }
            layerCtx.putImageData(img, p.x, p.y);
            setUiTick(t=>t+1);
         }
         return;
      }

   };
   const handleUp=(e)=>{
     if(e&&e.touches)e.preventDefault();
     if(!drawing){setDrawing(false);setUiTick(t=>t+1);return;}
     // Apply shape
     const ori=drawOrigin;
     if(ori){
       const p=getPos(e);
       if(p){
         if(tool==='line')drawLine(ori.x,ori.y,p.x,p.y);
         else if(tool==='rect') { if(fillShape) drawRectFill(ori.x,ori.y,p.x,p.y); else drawRectOutline(ori.x,ori.y,p.x,p.y); }
         
         else if(tool==='circle') { if(fillShape) drawCircleFill(ori.x,ori.y,p.x,p.y); else drawCircleOutline(ori.x,ori.y,p.x,p.y); }
          
          else if(tool==='gradient') drawBoundedGradient(ori.x,ori.y,p.x,p.y,false);
         else if(tool==='natural'){const size=Math.min(Math.hypot(ori.x-p.x,ori.y-p.y),Math.max(w,h)*0.3);drawNaturalShape(shapePreset||getToolPreset(tool),ori.x,ori.y,size);}
       }
     }
     
      const overlay = getOverlayCtx();
      if (overlay) overlay.ctx.clearRect(0,0,overlay.dw,overlay.dh);

      setDrawing(false);setDrawOrigin(null);
     if(mode!=='tile')commitStroke();
   };

   const getToolPreset=(toolName)=>{
    const presets=[
      'vine','tree','bush','grass','flower'
    ];
    return presets[Math.floor(Math.random()*presets.length)];
  };

  // ─── AI GENERATION ─────────────────────────────────────────────────────
  const checkSidecar=async()=>{
    try{
      const res=await fetch(sidecarUrl+'/health',{signal:AbortSignal.timeout(3000)});
      const data=await res.json();
      setSidecarStatus('connected');
      return data;
    }catch(e){
      setSidecarStatus('disconnected');
      return null;
    }
  };

  useEffect(()=>{
    checkSidecar();
    const iv=setInterval(checkSidecar,10000);
    return()=>clearInterval(iv);
  },[]);

  const generateArt=async()=>{
    if(!genPrompt.trim()||genLoading)return;
    setGenLoading(true);setGenError(null);setGenResult(null);
    try{
      const size=genWidth;
      let prompt=genPrompt.trim();
      if(genMode==='isometric')prompt='isometric '+prompt+', top-down 3/4 view, game sprite';
      if(genMode==='pattern')prompt=prompt+', seamless tileable pattern, tile';
      const res=await fetch(sidecarUrl+'/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt,size,palette:'pico8',count:1,steps:30}),
      });
      if(!res.ok){
        const err=await res.json().catch(()=>({error:'Unknown error'}));
        throw new Error(err.error||`Server error ${res.status}`);
      }
      const result=await res.json();
      if(result.error)throw new Error(result.error);

      // Post-process: snap to grid + quantize to palette
      const img=new Image();
      img.onload=()=>{
        const tmp=document.createElement('canvas');tmp.width=genWidth;tmp.height=genHeight;
        const tctx=tmp.getContext('2d');tctx.imageSmoothingEnabled=false;
        tctx.drawImage(img,0,0,genWidth,genHeight);

        // Quantize to palette
        const imgData=tctx.getImageData(0,0,genWidth,genHeight);
        const pal=palette.slice(0,genColors).map(c=>{
          const h=c.replace('#','');
          return[parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];
        });
        const d=imgData.data;
        for(let i=0;i<d.length;i+=4){
          let bestC=0,bestD=Infinity;
          for(let p=0;p<pal.length;p++){
            const dist=Math.abs(d[i]-pal[p][0])+Math.abs(d[i+1]-pal[p][1])+Math.abs(d[i+2]-pal[p][2]);
            if(dist<bestD){bestD=dist;bestC=p;}
          }
          d[i]=pal[bestC][0];d[i+1]=pal[bestC][1];d[i+2]=pal[bestC][2];d[i+3]=d[i+3]>128?255:0;
        }
        tctx.putImageData(imgData,0,0);
        setGenResult({image:tmp.toDataURL(),width:genWidth,height:genHeight});
      };
      img.src=result.image;
    }catch(e){
      setGenError(e.message||'Generation failed');
    }finally{
      setGenLoading(false);
    }
  };

  const applyGenerated=()=>{
    if(!genResult||!genResult.image)return;
    const img=new Image();
    img.onload=()=>{
      layerCtx.clearRect(0,0,w,h);
      layerCtx.imageSmoothingEnabled=false;
      layerCtx.drawImage(img,0,0,w,h);
      commitStroke();
      setGenResult(null);
      show('AI art applied to active layer');
    };
    img.src=genResult.image;
  };

  const applyGeneratedNewLayer=()=>{
    if(!genResult||!genResult.image)return;
    const img=new Image();
    img.onload=()=>{
      const nc=document.createElement('canvas');nc.width=w;nc.height=h;
      const nx=nc.getContext('2d');nx.imageSmoothingEnabled=false;
      nx.drawImage(img,0,0,w,h);
      const newFrames=[{id:uid(),duration:100,canvas:nc,ctx:nx}];
      const newLayer={id:uid(),name:'AI: '+genPrompt.slice(0,16),visible:true,opacity:1,frames:newFrames,currentFrame:0,type:'pixel',tilemap:null};
      setLayers(prev=>[...prev,newLayer]);
      setActiveLayerIdx(layers.length);
      show('AI art added as new layer');
    };
    img.src=genResult.image;
  };

  const applyGeneratedAsTile=()=>{
    if(!genResult||!genResult.image)return;
    const img=new Image();
    img.onload=()=>{
      // Tile the generated image across the canvas
      for(let ty=0;ty<h;ty+=genResult.height){
        for(let tx=0;tx<w;tx+=genResult.width){
          layerCtx.drawImage(img,tx,ty);
        }
      }
      commitStroke();
      setGenResult(null);
      show('AI pattern tiled across canvas');
    };
    img.src=genResult.image;
  };

  // Keyboard shortcuts
  useEffect(()=>{
    const h=e=>{
      if(e.key==='z'&&(e.ctrlKey||e.metaKey)){/* undo placeholder */}
    };
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[]);

  // ─── SHARED DOC (size/palette sync) ─────────────────────────────────────
  const [szW,setSzW]=useState(w);
  const [szH,setSzH]=useState(h);
  useEffect(()=>{setSzW(w);setSzH(h);},[w,h]);
  const resizeCanvas=(nw,nh)=>{
    nw=Math.max(1,Math.min(2048,nw|0));nh=Math.max(1,Math.min(2048,nh|0));
    if(nw===wRef.current&&nh===hRef.current)return;
    const next=layersRef.current.map(l=>({...l,frames:l.frames.map(f=>{
      const nc=document.createElement('canvas');nc.width=nw;nc.height=nh;
      const nx=nc.getContext('2d');nx.imageSmoothingEnabled=false;nx.drawImage(f.canvas,0,0);
      return {...f,canvas:nc,ctx:nx};
    })}));
    setLayers(next);setW(nw);setH(nh);
  };
  const applySize=(nw,nh)=>{ resizeCanvas(nw,nh); try{parent.postMessage({type:'DOC_UPDATE',from:'editor',patch:{w:nw,h:nh}},'*');}catch(e){} };
  window.__ppSetDoc=(patch)=>{
    if(!patch)return;
    if(patch.w||patch.h) resizeCanvas(patch.w||wRef.current, patch.h||hRef.current);
    if(patch.palette) setPalette(patch.palette);
    setSzW(patch.w||wRef.current); setSzH(patch.h||hRef.current);
  };
  // ─── RENDER CANVAS ───────────────────────────────────────────────────────
  useEffect(()=>{
    const display=displayRef.current;
    const c=canvasRef.current;
    if(!display)return;
    const dpr=1;
    const dw=w*zoom/100* dpr,dh=h*zoom/100* dpr;
    display.width=dw;display.height=dh;
    display.style.width=(w*zoom/100)+'px';display.style.height=(h*zoom/100)+'px';
    const ctx=display.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,dw,dh);
    
    // Sync overlay canvas scale
    if(overlayRef.current) {
       overlayRef.current.width = dw;
       overlayRef.current.height = dh;
       overlayRef.current.style.width = display.style.width;
       overlayRef.current.style.height = display.style.height;
    }

    // Checkered bg
    const cs=8*zoom/100;ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,dw,dh);
    ctx.fillStyle='#222';for(let y=0;y<dh;y+=cs)for(let x=0;x<dw;x+=cs)
      if((Math.floor(x/cs)+Math.floor(y/cs))%2)ctx.fillRect(x,y,cs,cs);
    // Draw layers
    const scale=zoom/100;
    for(const layer of layers){
      if(!layer.visible)continue;
      const frame=layer.frames[layer.currentFrame];
      if(!frame)continue;
      ctx.globalAlpha=layer.opacity;
      ctx.drawImage(frame.canvas,0,0,dw,dh);
    }
    ctx.globalAlpha=1;
    // Tile grid
    if(mode==='tile'&&tileSize>0){
      ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=1;
      const ts=tileSize*scale;
      for(let x=0;x<=w;x+=tileSize)ctx.beginPath(),ctx.moveTo(x*scale,0),ctx.lineTo(x*scale,dh),ctx.stroke();
      for(let y=0;y<=h;y+=tileSize)ctx.beginPath(),ctx.moveTo(0,y*scale),ctx.lineTo(dw,y*scale),ctx.stroke();
    }
    // Cursor highlight
    const cursor=c===document.activeElement;
  },[w,h,zoom,layers,mode,tileSize,uiTick]);

  // ─── PLAYBACK ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!isPlaying){playRef.current&&clearInterval(playRef.current);return;}
    let frame=0;
    const totalFrames=Math.max(...layers.map(l=>l.frames.length));
    playRef.current=setInterval(()=>{
      for(let i=0;i<layers.length;i++){
        const l=layersRef.current[i];
        if(l.frames.length>frame)setLayers(prev=>prev.map((ly,li)=>li===i?{...ly,currentFrame:frame}:ly));
      }
      frame++;
      if(frame>=totalFrames){
        if(loop)frame=0;else{clearInterval(playRef.current);setPlaying(false);}
      }
    },1000/fps);
    return()=>{playRef.current&&clearInterval(playRef.current);};
  },[isPlaying,fps,loop]);

  // ─── EFFECTS ─────────────────────────────────────────────────────────────
  const rgb2hsv=(r,g,b)=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;if(h<0)h+=1;}const s=mx?d/mx:0;return [h,s,mx];};
  const hsv2rgb=(h,s,v)=>{const i=Math.floor(h*6),f=h*6-i;const p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);let r,g,b;switch(i%6){case 0:r=v,g=t,b=p;break;case 1:r=q,g=v,b=p;break;case 2:r=p,g=v,b=t;break;case 3:r=p,g=q,b=v;break;case 4:r=t,g=p,b=v;break;default:r=v,g=p,b=q;}return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];};
  const hexToRgb=(hex)=>{const h=(hex||'#000000').replace('#','');return [parseInt(h.substr(0,2),16)||0,parseInt(h.substr(2,2),16)||0,parseInt(h.substr(4,2),16)||0];};
  
  const drawBoundedGradient=(x0,y0,x1,y1, preview=false)=>{
    const mask = preview ? gradMask : (gradMask || window.__tempGradMask);
    if(!mask || !layerCtx) return;
    
    // Generate Palette stops based on gradColors state
    const c0 = hexToRgb(color);
    const c1 = hexToRgb(gradEnd);
    
    const dx=x1-x0, dy=y1-y0; const len=Math.hypot(dx,dy)||1;
    
    const targetCtx = preview ? getOverlayCtx().ctx : layerCtx;
    const img = targetCtx.getImageData(0,0,w,h);
    const d = img.data;
    
    // If preview, clear overlay first
    if(preview) targetCtx.clearRect(0,0,w,h);
    
    for(let y=0;y<h;y++) {
      for(let x=0;x<w;x++) {
        if(!mask[y*w+x]) continue; // Skip unflooded pixels
        
        let t=((x-x0)*dx+(y-y0)*dy)/(len*len);
        t=t<0?0:t>1?1:t;
        
        // Quantize based on gradColors
        if (gradColors > 2) {
           t = Math.floor(t * gradColors) / (gradColors - 1);
        }
        
        const i=(y*w+x)*4;
        d[i] = Math.round(c0[0]+(c1[0]-c0[0])*t);
        d[i+1] = Math.round(c0[1]+(c1[1]-c0[1])*t);
        d[i+2] = Math.round(c0[2]+(c1[2]-c0[2])*t);
        d[i+3] = 255;
      }
    }
    targetCtx.putImageData(img,0,0);
    if (!preview) commitStroke();
  };

  const drawGradient_OLD=(x0,y0,x1,y1)=>{
    if(!layerCtx)return;
    const c0=hexToRgb(color), c1=hexToRgb(gradEnd);
    const dx=x1-x0, dy=y1-y0; const len=Math.hypot(dx,dy)||1;
    const img=layerCtx.getImageData(0,0,w,h), d=img.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let t=((x-x0)*dx+(y-y0)*dy)/(len*len);
      t=t<0?0:t>1?1:t;
      const i=(y*w+x)*4;
      d[i]=Math.round(c0[0]+(c1[0]-c0[0])*t);
      d[i+1]=Math.round(c0[1]+(c1[1]-c0[1])*t);
      d[i+2]=Math.round(c0[2]+(c1[2]-c0[2])*t);
      d[i+3]=255;
    }
    layerCtx.putImageData(img,0,0); commitStroke();
  };
  const applyEffect=(effectName)=>{
    if(!layerCtx){window.__ppLastEffect='no_ctx';return;}
    const img=layerCtx.getImageData(0,0,w,h),d=img.data;
    const perlin=new Perlin();

    switch(effectName){
      case'fade_left':for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,f=x/(w-1||1);d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}break;
      case'fade_right':for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,f=1-x/(w-1||1);d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}break;
      case'fade_up':for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,f=1-y/(h-1||1);d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}break;
      case'fade_down':for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,f=y/(h-1||1);d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}break;
      case'fade_radial':for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,f=1-dist(x,y,w/2,h/2)/(Math.hypot(w/2,h/2)||1);d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}break;
      case'invert':for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}break;
      case'grayscale':for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];d[i]=g;d[i+1]=g;d[i+2]=g;}break;
      case'posterize':
        const levels=4;
        for(let i=0;i<d.length;i+=4){d[i]=Math.round(d[i]*levels/255)*Math.floor(255/levels);d[i+1]=Math.round(d[i+1]*levels/255)*Math.floor(255/levels);d[i+2]=Math.round(d[i+2]*levels/255)*Math.floor(255/levels);}
        break;
      case'outline':
        const outlineImg=layerCtx.getImageData(0,0,w,h),od=outlineImg.data;
        for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
          const i=(y*w+x)*4;
          const a=d[i+3];
          const na=d[((y-1)*w+x)*4+3],sa=d[((y+1)*w+x)*4+3],wa=d[(y*w+x-1)*4+3],ea=d[(y*w+x+1)*4+3];
          if(a>128&&(na<128||sa<128||wa<128||ea<128)){od[i]=0;od[i+1]=0;od[i+2]=0;od[i+3]=255;}
          else{od[i+3]=0;}
        }
        layerCtx.putImageData(outlineImg,0,0);commitStroke();return;
      case'shadow':
        const offX=2,offY=2;
        const shadImg=layerCtx.getImageData(0,0,w,h),sd=shadImg.data;
        layerCtx.clearRect(0,0,w,h);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4;
          if(sd[i+3]>128&&x+offX<w&&y+offY<h){const ni=((y+offY)*w+x+offX)*4;d[ni]=0;d[ni+1]=0;d[ni+2]=0;d[ni+3]=128;}
        }
        for(let i=0;i<d.length;i+=4)if(sd[i+3]>128){d[i]=sd[i];d[i+1]=sd[i+1];d[i+2]=sd[i+2];d[i+3]=255;}
        break;
      case'noise_cloud':
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4,n=perlin.fbm(x/w*4,y/h*4,3)*.5+.5;
          if(d[i+3]>0){const f=n;d[i]=d[i]*f|0;d[i+1]=d[i+1]*f|0;d[i+2]=d[i+2]*f|0;}
        }
        break;
        case'pixelate':{ const bs=Math.max(1,pixelateSize|0); const nw=Math.ceil(w/bs),nh=Math.ceil(h/bs); const small=document.createElement('canvas');small.width=nw;small.height=nh;const sx=small.getContext('2d');sx.imageSmoothingEnabled=false;sx.drawImage(layerCtx.canvas,0,0,nw,nh);layerCtx.clearRect(0,0,w,h);layerCtx.imageSmoothingEnabled=false;layerCtx.drawImage(small,0,0,w,h);window.__ppLastEffect='pix_ok';window.__ppPixSize=bs;setUiTick(t=>t+1);commitStroke();show('Pixelated');return; }
        case'hue':{ const img0=layerCtx.getImageData(0,0,w,h),dd=img0.data; for(let i=0;i<dd.length;i+=4){ if(dd[i+3]===0)continue; let hsv=rgb2hsv(dd[i],dd[i+1],dd[i+2]); hsv[0]=(hsv[0]+hueShift/360)%1; if(hsv[0]<0)hsv[0]+=1; const c=hsv2rgb(hsv[0],hsv[1],hsv[2]); dd[i]=c[0];dd[i+1]=c[1];dd[i+2]=c[2]; } layerCtx.putImageData(img0,0,0); window.__ppLastEffect='hue_ok';setUiTick(t=>t+1);commitStroke();show('Hue shifted');return; }
        case'saturate':{ const img0=layerCtx.getImageData(0,0,w,h),dd=img0.data; for(let i=0;i<dd.length;i+=4){ if(dd[i+3]===0)continue; let hsv=rgb2hsv(dd[i],dd[i+1],dd[i+2]); hsv[1]=Math.max(0,Math.min(1,hsv[1]*1.6)); const c=hsv2rgb(hsv[0],hsv[1],hsv[2]); dd[i]=c[0];dd[i+1]=c[1];dd[i+2]=c[2]; } layerCtx.putImageData(img0,0,0); commitStroke();show('Saturated');return; }
       default:show('Unknown effect');return;
    }
    layerCtx.putImageData(img,0,0);
    commitStroke();
    show('Applied: '+effectName);
  };

  const sliceSprites=(img,cw,ch)=>{
    cw=Math.max(1,cw|0);ch=Math.max(1,ch|0);
    const cols=Math.floor(img.width/cw), rows=Math.floor(img.height/ch);
    if(!cols||!rows){show('Image smaller than cell');return;}
    const frames=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const nc=document.createElement('canvas');nc.width=cw;nc.height=ch;
      const nx=nc.getContext('2d');nx.imageSmoothingEnabled=false;
      nx.drawImage(img,c*cw,r*ch,cw,ch,0,0,cw,ch);
      frames.push({id:uid(),duration:100,canvas:nc,ctx:nx});
    }
    resizeCanvas(cw,ch);
    const newLayer={id:uid(),name:'Sprites',visible:true,opacity:1,frames,currentFrame:0,type:'pixel',tilemap:null};
    setLayers(l=>[...l,newLayer]);
     setActiveLayerIdx(layers.length);
    try{parent.postMessage({type:'DOC_UPDATE',from:'editor',patch:{w:cw,h:ch}},'*');}catch(e){}
    setShowExtract(false);show('Sliced '+frames.length+' frames ('+cols+'×'+rows+')');
  };
  // ─── GODOT EXPORT ────────────────────────────────────────────────────────
  const exportGodot=()=>{
    const data={resource_version:2,tile_size:tileSize,format:2};
    // Collect all visible layer pixel data as base64 PNG spritesheet
    const tiles=[];const tileNames=[];
    let idx=0;
    for(const layer of layers){
      if(!layer.visible)continue;
      for(let fi=0;fi<layer.frames.length;fi++){
        const f=layer.frames[fi];
        const png=f.canvas.toDataURL();
        tiles.push(png);
        tileNames.push(layer.name+'_f'+fi);
      }
    }
    // Generate Godot TileSet resource
    let gd='[gd_resource type="TileSet" format=3]\n\n[resource]\n';
    gd+='tile_size = Vector2i('+tileSize+', '+tileSize+')\n';
    gd+='sources = [\n';
    for(let i=0;i<tiles.length;i++){
      gd+='{\n"name": "'+tileNames[i]+'",\n';
      gd+='"texture": {\n"type": "CompressedTexture2D",\n';
      gd+='"path": "res://'+tileNames[i].replace(/[^a-zA-Z0-9_]/g,'_')+'.png"\n},\n';
      gd+='},\n';
    }
    gd+=']\n';
    // Also export map data
    let map='# Pixel Palace Godot TileMap export\n';
    map+='# Place tiles in a TileMap node using this data:\n\n';
    for(const layer of layers){
      if(!layer.visible)continue;
      map+='# Layer: '+layer.name+'\n';
      map+='# Frames: '+layer.frames.length+'\n\n';
    }
    // Download
    const blob=new Blob([gd],{type:'text/plain'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='pixel_palace_tileset.tres';
    a.click();URL.revokeObjectURL(a.href);
    // Download tile PNGs
    for(let i=0;i<tiles.length;i++){
      const a2=document.createElement('a');
      a2.href=tiles[i];a2.download=tileNames[i].replace(/[^a-zA-Z0-9_]/g,'_')+'.png';
      a2.click();
    }
    show('Godot export complete');
  };

  // ─── IMPORT ──────────────────────────────────────────────────────────────
  const importImage=(file,callback)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        const nc=document.createElement('canvas');nc.width=w;nc.height=h;
        const ctx=nc.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const dataURL=nc.toDataURL();
        callback(dataURL,nc,ctx);
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleFileImport=(file)=>{
    importImage(file,(dataURL,nc,ctx)=>{
      // Place imported image on active layer frame
      layerCtx.clearRect(0,0,w,h);
      layerCtx.drawImage(nc,0,0);
      commitStroke();
      show('Image imported');
    });
  };

  const handleLineArtImport=(file)=>{
    importImage(file,(dataURL,nc,ctx)=>{
      const img=ctx.getImageData(0,0,w,h),d=img.data;
      const threshold=128;
      for(let i=0;i<d.length;i+=4){
        const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        if(g>threshold){d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=0;}
        else{d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=255;}
      }
      layerCtx.clearRect(0,0,w,h);
      layerCtx.putImageData(img,0,0);
      commitStroke();
      show('Line art extracted');
    });
  };

  const handleVectorImport=(file)=>{
    importImage(file,(dataURL,nc,ctx)=>{
      const img=ctx.getImageData(0,0,w,h),d=img.data;
      const numColors=8;
      // Simple color quantization + edge detection for vector-like look
      const levels=Math.floor(255/numColors);
      for(let i=0;i<d.length;i+=4){
        if(d[i+3]<128){d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=0;continue;}
        d[i]=Math.round(d[i]/levels)*levels;
        d[i+1]=Math.round(d[i+1]/levels)*levels;
        d[i+2]=Math.round(d[i+2]/levels)*levels;
        d[i+3]=255;
      }
      layerCtx.clearRect(0,0,w,h);
      layerCtx.putImageData(img,0,0);
      commitStroke();
      show('Vector-style import done');
    });
  };

  // ─── TILESET ──────────────────────────────────────────────────────────────
  const loadTileset=(file)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        setTileSpritesheet(img);
        const cols=Math.floor(img.width/tileSize);
        setTilesetCols(cols);
        setSelectedTile(0);
        show('Tileset loaded: '+cols+' tiles');
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ─── PROJECT ──────────────────────────────────────────────────────────────
  const saveProject=()=>{
    // Serialize all layers to a compact JSON
    const data={version:1,w,h,tileSize,layers:[]};
    for(const layer of layers){
      const lData={id:layer.id,name:layer.name,visible:layer.visible,opacity:layer.opacity,
        type:layer.type,frames:[]};
      for(const f of layer.frames){
        lData.frames.push({duration:f.duration,pixels:f.canvas.toDataURL()});
      }
      data.layers.push(lData);
    }
    const json=JSON.stringify(data);
    const blob=new Blob([json],{type:'application/octet-stream'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='pixel_palace_project.pproj';
    a.click();URL.revokeObjectURL(a.href);
    show('Project saved');
  };

  const loadProject=(file)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=JSON.parse(e.target.result);
        if(!data.layers||!data.layers.length)throw new Error('Invalid project');
        setW(data.w||DEFAULT_W);setH(data.h||DEFAULT_H);
        if(data.tileSize)setTileSize(data.tileSize);
        const loadedLayers=data.layers.map(ld=>{
          const frames=ld.frames.map(fd=>{
            const nc=document.createElement('canvas');nc.width=data.w||w;nc.height=data.h||h;
            const ctx=nc.getContext('2d');
            const img=new Image();
            img.onload=()=>{ctx.drawImage(img,0,0);commitStroke();};
            img.src=fd.pixels;
            return{id:fd.id||uid(),duration:fd.duration||100,canvas:nc,ctx};
          });
          return{id:ld.id||uid(),name:ld.name||'Layer',visible:ld.visible!==false,opacity:ld.opacity||1,
            type:ld.type||'pixel',frames,currentFrame:0};
        });
        setLayers(loadedLayers);setActiveLayerIdx(0);
        show('Project loaded');
      }catch(err){show('Failed to load project');}
    };
    reader.readAsText(file);
  };

  window.__ppDrawGradient=drawGradient; window.__ppApplyEffect=applyEffect; window.__ppLayerPixel=(x,y)=>{try{const d=layerCtx.getImageData(x,y,1,1).data;return[d[0],d[1],d[2],d[3]];}catch(e){return[-1,-1,-1,-1];}}; window.__ppDisplayPixel=(x,y)=>{try{const d=displayRef.current.getContext('2d').getImageData(x,y,1,1).data;return[d[0],d[1],d[2],d[3]];}catch(e){return[-1,-1,-1,-1];}}; window.__ppForceDisplay=()=>setUiTick(t=>t+1);
  // ─── RENDER ──────────────────────────────────────────────────────────────
  const scale=zoom/100;
  const totalAnimFrames=Math.max(...layers.map(l=>l.frames.length));

  return (
    <div className="h-full flex flex-col" style={{background:'#111'}}>
      {/* ─── TOOLBAR ─── */}
      <div className="flex items-center gap-1 p-1.5 border-b border-neutral-800 overflow-x-auto scrollbar-thin bg-neutral-900 flex-shrink-0">
        <button onClick={()=>setMode('pixel')} className={"tool-btn text-[10px] "+(mode==='pixel'?'active':'')} title="Pixel mode">PX</button>
        <button onClick={()=>setMode('tile')} className={"tool-btn text-[10px] "+(mode==='tile'?'active':'')} title="Tile mode">⊞</button>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
        <button onClick={()=>setTool('pencil')} className={"tool-btn "+(tool==='pencil'?'active':'')} title="Pencil">✎</button>
        <button onClick={()=>setTool('eraser')} className={"tool-btn "+(tool==='eraser'?'active':'')} title="Eraser">⌫</button>
        <button onClick={()=>setTool('eyedropper')} className={"tool-btn "+(tool==='eyedropper'?'active':'')} title="Eyedropper">💉</button>
        <button onClick={()=>setTool('fill')} className={"tool-btn "+(tool==='fill'?'active':'')} title="Flood fill">▣</button>         <button onClick={()=>setTool('erasefill')} className={"tool-btn "+(tool==='erasefill'?'active':'')} title="Transparency fill (flood to transparent)">⊘</button>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
        <button onClick={()=>setTool('line')} className={"tool-btn "+(tool==='line'?'active':'')} title="Line">╱</button>
        <button onClick={()=>setTool('rect')} className={"tool-btn "+(tool==='rect'?'active':'')} title="Filled rect">▮</button>
        <button onClick={()=>setTool('rect_outline')} className={"tool-btn "+(tool==='rect_outline'?'active':'')} title="Outline rect">▭</button>
        <button onClick={()=>setTool('circle')} className={"tool-btn "+(tool==='circle'?'active':'')} title="Filled circle">●</button>
         <button onClick={()=>setTool('circle_outline')} className={"tool-btn "+(tool==='circle_outline'?'active':'')} title="Outline circle">○</button>
         <button onClick={()=>setTool('greeble')} className={"tool-btn "+(tool==='greeble'?'active':'')} title="Greeble brush">🌿</button>
          <button onClick={()=>setTool('natural')} className={"tool-btn "+(tool==='natural'?'active':'')} title="Natural shape">🌿</button>
          <button onClick={()=>setTool('gradient')} className={"tool-btn "+(tool==='gradient'?'active':'')} title="Gradient fill (drag to set direction)">🌈</button>
         <div className="w-px h-6 bg-neutral-700 mx-1"/>
         <select value={brushSize} onChange={e=>setBrushSize(+e.target.value)} className="godown w-16 text-xs">
          {[1,2,3,5,7,9,13,17].map(s=><option key={s} value={s}>{s}px</option>)}
        </select>
         <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="ml-1"/>
         <input type="color" value={gradEnd} onChange={e=>setGradEnd(e.target.value)} title="Gradient end color" className="ml-1"/>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
        <button onClick={()=>setZoom(Math.max(100,zoom-50))} className="tool-btn text-xs">−</button>
        <span className="text-xs text-neutral-400 w-14 text-center">{zoom}%</span>
        <button onClick={()=>setZoom(Math.min(1600,zoom+50))} className="tool-btn text-xs">+</button>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
        <div className="flex items-center gap-1 text-[10px] text-neutral-400 mr-1 bg-neutral-900 rounded-lg px-2 py-1 border border-neutral-700">
          <span>Size</span>
          <input type="number" min={1} max={2048} value={szW} onChange={e=>setSzW(Math.max(1,Math.min(2048,+e.target.value||64)))} className="godown w-14 text-xs bg-neutral-800 rounded px-1 py-0.5"/>
          <span>×</span>
          <input type="number" min={1} max={2048} value={szH} onChange={e=>setSzH(Math.max(1,Math.min(2048,+e.target.value||64)))} className="godown w-14 text-xs bg-neutral-800 rounded px-1 py-0.5"/>
          <button onClick={()=>applySize(szW,szH)} className="tool-btn text-[10px]" title="Apply size (resizes the canvas)">⤓</button>
        </div>
        <button onClick={addLayer} className="tool-btn text-xs" title="Add layer">⊕</button>
        <button onClick={()=>setShowEffects(true)} className="tool-btn text-xs" title="Effects">✦</button>
        <button onClick={()=>setShowTiles(!showTiles)} className={"tool-btn text-xs "+(showTiles?'active':'')} title="Tileset">⊞</button>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
         <button onClick={()=>setShowImport(!showImport)} className="tool-btn text-[10px]" title="Import">📥</button>
        <button onClick={()=>setShowExtract(true)} className="tool-btn text-[10px]" title="Sprite extractor">✂</button>
        <button onClick={()=>setShowExport(true)} className="tool-btn text-[10px]" title="Export">📤</button>
        <button onClick={()=>setShowProject(true)} className="tool-btn text-[10px]" title="Project">💾</button>
        <div className="w-px h-6 bg-neutral-700 mx-1"/>
        <button onClick={()=>setShowGenerate(!showGenerate)} className={"tool-btn text-[10px] "+(showGenerate?'active':'')} title="AI Generate" style={sidecarStatus==='connected'?{borderColor:'#22c55e'}:{}}>
          {genLoading?'⟳':'✦'} AI
        </button>
      </div>

      {/* ─── AI GENERATE BAR ─── */}
      {showGenerate&&(
        <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-2 flex-shrink-0" style={{background:'linear-gradient(180deg,#1a1a1a,#111)'}}>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status indicator */}
            <div className="flex items-center gap-1 mr-2">
              <div className="w-2 h-2 rounded-full" style={{background:sidecarStatus==='connected'?'#22c55e':'#ef4444'}}/>
              <span className="text-[9px] text-neutral-500">{sidecarStatus==='connected'?'AI Ready':'No AI'}</span>
            </div>

            {/* Mode selector */}
            <select value={genMode} onChange={e=>setGenMode(e.target.value)} className="godown text-[10px] w-24 bg-neutral-800">
              <option value="pixel">Pixel Art</option>
              <option value="isometric">Isometric</option>
              <option value="pattern">Pattern</option>
              <option value="variation">Variation</option>
            </select>

            {/* Prompt input */}
            <input
              type="text"
              value={genPrompt}
              onChange={e=>setGenPrompt(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')generateArt();}}
              placeholder={genMode==='variation'?"Describe variation... (e.g. 'make it winter')":"Describe what to generate... (e.g. 'ice cream shop', 'a tree', 'bottle')"}
              className="flex-1 min-w-[200px] text-[11px] bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              disabled={genLoading}
            />

            {/* Size controls (hidden for variation mode) */}
            {genMode!=='variation'&&(
              <div className="flex items-center gap-1 text-[9px] text-neutral-500">
                <input type="number" min={8} max={512} value={genWidth} onChange={e=>setGenWidth(+e.target.value||64)} className="godown w-12 text-[10px] bg-neutral-800"/>
                <span>×</span>
                <input type="number" min={8} max={512} value={genHeight} onChange={e=>setGenHeight(+e.target.value||64)} className="godown w-12 text-[10px] bg-neutral-800"/>
              </div>
            )}

            {/* Colors */}
            <div className="flex items-center gap-1 text-[9px] text-neutral-500">
              <span>Colors</span>
              <input type="number" min={2} max={64} value={genColors} onChange={e=>setGenColors(+e.target.value||16)} className="godown w-10 text-[10px] bg-neutral-800"/>
            </div>

            {/* Seed (optional) */}
            <input type="number" value={genSeed} onChange={e=>setGenSeed(e.target.value)} placeholder="Seed" className="godown w-16 text-[10px] bg-neutral-800" title="Optional seed for reproducible results"/>

            {/* Generate button */}
            <button
              onClick={generateArt}
              disabled={genLoading||!genPrompt.trim()||sidecarStatus!=='connected'}
              className="px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all"
              style={{
                background: genLoading?'#374151':(!genPrompt.trim()||sidecarStatus!=='connected')?'#1f2937':'linear-gradient(135deg,#2563eb,#7c3aed)',
                color: genLoading||!genPrompt.trim()||sidecarStatus!=='connected'?'#6b7280':'white',
                cursor: genLoading||!genPrompt.trim()||sidecarStatus!=='connected'?'not-allowed':'pointer',
              }}
            >
              {genLoading?'⟳ Generating...':'✦ Generate'}
            </button>

            {/* Sidecar URL input */}
            <input
              type="text"
              value={sidecarUrl}
              onChange={e=>setSidecarUrl(e.target.value)}
              onBlur={()=>checkSidecar()}
              className="godown w-40 text-[9px] bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-neutral-400"
              title="AI Sidecar server URL"
            />
          </div>

          {/* Error display */}
          {genError&&(
            <div className="mt-1 text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1 border border-red-800">
              {genError}
            </div>
          )}

          {/* Result preview & apply buttons */}
          {genResult&&(
            <div className="mt-2 flex items-center gap-3">
              <div className="relative">
                <img
                  src={genResult.image}
                  alt="Generated"
                  className="rounded border border-neutral-700"
                  style={{width:Math.min(128,genResult.width*2),height:'auto',imageRendering:'pixelated'}}
                />
                <span className="absolute bottom-0 right-0 text-[8px] bg-black/60 text-white px-1 rounded-tl">{genResult.width}×{genResult.height}</span>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={applyGenerated} className="text-[10px] px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white">
                  Apply to Layer
                </button>
                <button onClick={applyGeneratedNewLayer} className="text-[10px] px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-white">
                  Add as New Layer
                </button>
                {genMode==='pattern'&&(
                  <button onClick={applyGeneratedAsTile} className="text-[10px] px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded text-white">
                    Tile Across Canvas
                  </button>
                )}
                <button onClick={()=>setGenResult(null)} className="text-[10px] px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300">
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MAIN AREA ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center p-2 overflow-auto" style={{background:'#0a0a0a'}}>
          <canvas ref={displayRef} style={{borderRadius:8,border:'1px solid #333',maxWidth:'100%',maxHeight:'100%',objectFit:'contain',cursor:mode==='tile'?'crosshair':'crosshair'}}
            onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp}
            onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
            onContextMenu={e=>e.preventDefault()}/>

          <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,pointerEvents:'none',borderRadius:8,maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>

          {/* Timeline */}
          <div className="w-full max-w-3xl mt-2 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Timeline</span>
              <div className="flex gap-1">
                <button onClick={addFrame} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">+</button>
                <button onClick={dupFrame} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">⧉</button>
                <button onClick={delFrame} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">−</button>
                <button onClick={()=>setPlaying(!isPlaying)} className={"text-[10px] px-2 py-0.5 rounded "+(isPlaying?'bg-green-700 text-white':'bg-neutral-800 text-neutral-300')}>
                  {isPlaying?'⏹':'▶'}
                </button>
              </div>
              <span className="text-[10px] text-neutral-500">FPS:</span>
              <input type="range" min={1} max={60} value={fps} onChange={e=>setFps(+e.target.value)} className="w-16"/>
              <span className="text-[10px] text-neutral-400">{fps}</span>
              <label className="flex items-center gap-1 text-[10px] text-neutral-500 ml-2">
                <input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>Loop
              </label>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
              {currentFrames.map((f,i)=>(
                <div key={f.id}
                  className={"timeline-frame "+(i===activeLayer.currentFrame?'active':'')}
                  onClick={()=>setFrame(i)}>
                  <canvas ref={el=>{if(el){el.width=56;el.height=56;const c=el.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(f.canvas,0,0,56,56);}}}
                    style={{width:56,height:56,borderRadius:4}}/>
                  <span className="absolute bottom-0.5 right-1 text-[8px] text-neutral-500">{f.duration}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL: LAYERS + PALETTE ─── */}
        <div className="w-56 border-l border-neutral-800 flex flex-col overflow-hidden flex-shrink-0" style={{background:'#161616'}}>
          {/* Layers */}
          <div className="p-2 border-b border-neutral-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Layers</span>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin">
              {layers.map((l,i)=>(
                <div key={l.id} className={"layer-row "+(i===activeLayerIdx?'active':'')}
                  onClick={()=>setActiveLayerIdx(i)}>
                  <button onClick={e=>{e.stopPropagation();toggleLayerVis(i);}} className="text-xs w-5 text-center" style={{opacity:l.visible?1:.3}}>
                    {l.visible?'👁':'—'}
                  </button>
                  <span className="text-xs flex-1 truncate">{l.name}</span>
                  <input type="range" min={0} max={100} value={l.opacity*100}
                    onChange={e=>setLayerOpacity(i,+e.target.value/100)}
                    onClick={e=>e.stopPropagation()} className="w-12"
                    style={{height:2}}/>
                  <button onClick={e=>{e.stopPropagation();duplicateLayer(i);}} className="text-[10px] text-neutral-500 hover:text-white w-4">⧉</button>
                  <button onClick={e=>{e.stopPropagation();deleteLayer(i);}} className="text-[10px] text-neutral-500 hover:text-red-400 w-4">✕</button>
                </div>
              ))}
            </div>
          </div>
          {/* Palettes */}
          <div className="flex-1 p-2 overflow-y-auto scrollbar-thin">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Palette</span>
            <div className="flex flex-wrap gap-1 mb-2">
              {palette.map((c,i)=>(
                <div key={i} className={"palette-swatch "+(color===c?'active':'')}
                  style={{background:c}} onClick={()=>setColor(c)}/>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Presets</span>
            <div className="flex flex-wrap gap-1">
              {[
                ['#000000','#ffffff','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c'],
                ['#0f380f','#306230','#8bac0f','#9bbc0f'],
                ['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8',
                 '#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'],
                ['#000000','#fcfcfc','#f8f8f8','#bcbcbc','#7c7c7c','#a4e4fc','#3cbcfc','#0078f8',
                 '#0000fc','#b8a8f8','#6844fc','#4428bc','#f8b8f8','#d874cc','#943ca4','#50287c'],
                ['#272822','#383830','#49483e','#75715e','#a59f85','#f8f8f2','#f92672','#66d9ef',
                 '#a6e22e','#fd971f','#e6db74','#ae81ff'],
              ].map((p,i)=>(
                <button key={i} onClick={()=>setPalette(p)} className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400">
                  P{i+1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── TILESET PANEL ─── */}
      {showTiles&&(
        <div className="absolute bottom-16 left-2 z-50 bg-neutral-900 border border-neutral-700 rounded-xl p-2 max-w-xs max-h-64 overflow-auto scrollbar-thin shadow-2xl">
          <div className="text-[10px] text-neutral-500 mb-1">Tileset</div>
          <label className="block text-[10px] px-2 py-1 bg-neutral-800 rounded mb-1 cursor-pointer hover:bg-neutral-700">
            Load tileset image...
            <input type="file" accept="image/*" className="hidden" onChange={e=>{if(e.target.files[0])loadTileset(e.target.files[0]);}}/>
          </label>
          <div className="flex flex-wrap gap-1">
            {tileSpritesheet&&Array.from({length:tilesetCols*Math.floor((tileSpritesheet?.height||0)/tileSize)},(_,i)=>(
              <div key={i} className={"tile-preview "+(selectedTile===i?'active':'')}
                onClick={()=>setSelectedTile(i)}
                style={{backgroundImage:`url(${tileSpritesheet?.src||''})`,backgroundPosition:`-${(i%tilesetCols)*tileSize}px -${Math.floor(i/tilesetCols)*tileSize}px`,backgroundSize:`${tileSpritesheet?.width||0}px ${tileSpritesheet?.height||0}px`}}/>
            ))}
          </div>
        </div>
      )}

      {/* ─── EFFECTS MODAL ─── */}
      {showEffects&&(
        <div className="modal-overlay" onClick={()=>setShowEffects(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">✦ Effects</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Fade Left','fade_left'],['Fade Right','fade_right'],['Fade Up','fade_up'],
                ['Fade Down','fade_down'],['Radial Fade','fade_radial'],['Invert','invert'],
                ['Grayscale','grayscale'],['Posterize','posterize'],['Outline','outline'],
                 ['Drop Shadow','shadow'],['Noise Cloud','noise_cloud'],['Pixelate','pixelate'],['Hue Shift','hue'],['Saturate','saturate'],
              ].map(([label,key])=>(
                <button key={key} onClick={()=>{applyEffect(key);setShowEffects(false);}}
                  className="text-[11px] px-2 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700">
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-neutral-700 pt-3">
              <div className="text-[11px] text-neutral-400 mb-2">Brush — Greeble / Perlin (use the Greeble tool)</div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] text-neutral-300">Strength {greebleStrength.toFixed(2)}<input type="range" min="0" max="1" step="0.05" value={greebleStrength} onChange={e=>setGreebleStrength(+e.target.value)} className="w-full"/></label>
                <label className="text-[11px] text-neutral-300">Complexity {greebleComplexity}<input type="range" min="1" max="8" step="1" value={greebleComplexity} onChange={e=>setGreebleComplexity(+e.target.value)} className="w-full"/></label>
                 <label className="text-[11px] text-neutral-300">Amount {greebleAmount.toFixed(2)}<input type="range" min="0" max="1" step="0.05" value={greebleAmount} onChange={e=>setGreebleAmount(+e.target.value)} className="w-full"/></label>
               </div>
            </div>
            <div className="mt-4 border-t border-neutral-700 pt-3">
              <div className="text-[11px] text-neutral-400 mb-2">Palette swap — pick two colors, then swap them across every layer &amp; frame (positional recolor)</div>
              <div className="flex items-center gap-2">
                <input type="color" value={swapA||'#000000'} onChange={e=>setSwapA(e.target.value)} className="w-10 h-8 bg-transparent border border-neutral-700 rounded"/>
                <input type="color" value={swapB||'#ffffff'} onChange={e=>setSwapB(e.target.value)} className="w-10 h-8 bg-transparent border border-neutral-700 rounded"/>
                <button onClick={swapColors} className="text-[11px] px-3 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg border border-cyan-500">Swap colors</button>
              </div>
            </div>
            <div className="mt-4 border-t border-neutral-700 pt-3">
              <div className="text-[11px] text-neutral-400 mb-2">Adjust — Pixelate &amp; Hue (apply to active layer)</div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] text-neutral-300">Pixelate block {pixelateSize}<input type="range" min="1" max="32" step="1" value={pixelateSize} onChange={e=>setPixelateSize(+e.target.value)} className="w-full"/></label>
                <label className="text-[11px] text-neutral-300">Hue shift {hueShift}°<input type="range" min="0" max="360" step="5" value={hueShift} onChange={e=>setHueShift(+e.target.value)} className="w-full"/></label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── IMPORT MODAL ─── */}
      {showImport&&(
        <div className="modal-overlay" onClick={()=>setShowImport(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">📥 Import</h3>
            <div className="space-y-2">
              <label className="block text-xs px-3 py-2 bg-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-700 border border-neutral-700">
                Import Image (PNG/JPG)
                <input type="file" accept="image/*" className="hidden" onChange={e=>{if(e.target.files[0]){handleFileImport(e.target.files[0]);setShowImport(false);}}}/>
              </label>
              <label className="block text-xs px-3 py-2 bg-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-700 border border-neutral-700">
                Line Art Extract (photo of drawing → clean lines)
                <input type="file" accept="image/*" className="hidden" onChange={e=>{if(e.target.files[0]){handleLineArtImport(e.target.files[0]);setShowImport(false);}}}/>
              </label>
              <label className="block text-xs px-3 py-2 bg-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-700 border border-neutral-700">
                Vectorize (quantize + trace)
                <input type="file" accept="image/*" className="hidden" onChange={e=>{if(e.target.files[0]){handleVectorImport(e.target.files[0]);setShowImport(false);}}}/>
              </label>
              <p className="text-[10px] text-neutral-500 mt-1">Imports resize to current canvas dimensions.</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── EXTRACT MODAL ─── */}
      {showExtract&&(
        <div className="modal-overlay" onClick={()=>setShowExtract(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">✂ Sprite Extractor</h3>
            <div className="space-y-2">
              <label className="block text-xs px-3 py-2 bg-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-700 border border-neutral-700">
                Load sprite sheet (PNG/JPG)
                <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files[0];if(!f)return;const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{extractImgRef.current=im;setExtractDims(im.width+'×'+im.height);};im.src=fr.result;};fr.readAsDataURL(f);}}/>
              </label>
              <div className="flex gap-2 items-center text-xs">
                <span>Cell W</span><input type="number" min={1} max={512} value={cellW} onChange={e=>setCellW(+e.target.value||16)} className="godown w-16"/>
                <span>Cell H</span><input type="number" min={1} max={512} value={cellH} onChange={e=>setCellH(+e.target.value||16)} className="godown w-16"/>
              </div>
              <div className="text-[10px] text-neutral-500">Image: {extractDims||'none'}</div>
              <button onClick={()=>{ if(extractImgRef.current) sliceSprites(extractImgRef.current,cellW,cellH); else show('Load an image first'); }} className="text-[11px] px-3 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg border border-cyan-500">Slice into frames</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EXPORT MODAL ─── */}
      {showExport&&(
        <div className="modal-overlay" onClick={()=>setShowExport(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">📤 Export</h3>
            <div className="space-y-2">
              <button onClick={()=>{
                // Export as spritesheet PNG
                const totalF=Math.max(...layers.map(l=>l.frames.length));
                const cols=Math.ceil(Math.sqrt(totalF));
                const rows=Math.ceil(totalF/cols);
                const ec=document.createElement('canvas');
                ec.width=w*cols;ec.height=h*rows;
                const ectx=ec.getContext('2d');
                ectx.imageSmoothingEnabled=false;
                for(let fi=0;fi<totalF;fi++){
                  const cx=fi%cols,cy=Math.floor(fi/cols);
                  for(const layer of layers){
                    if(!layer.visible)continue;
                    const f=layer.frames[fi]||layer.frames[layer.frames.length-1];
                    if(f)ectx.drawImage(f.canvas,cx*w,cy*h);
                  }
                }
                const a=document.createElement('a');
                a.href=ec.toDataURL('image/png');a.download='spritesheet.png';
                a.click();setShowExport(false);show('Spritesheet exported');
              }} className="w-full text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 text-left">
                Spritesheet PNG
              </button>
              <button onClick={()=>{
                // Export current frame
                const ec=document.createElement('canvas');ec.width=w;ec.height=h;
                const ectx=ec.getContext('2d');ectx.imageSmoothingEnabled=false;
                for(const layer of layers){
                  if(!layer.visible)continue;
                  const f=layer.frames[layer.currentFrame];
                  if(f)ectx.drawImage(f.canvas,0,0);
                }
                const a=document.createElement('a');
                a.href=ec.toDataURL('image/png');a.download='frame_'+activeLayer.currentFrame+'.png';
                a.click();setShowExport(false);show('Frame exported');
              }} className="w-full text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 text-left">
                Current Frame PNG
              </button>
              <button onClick={()=>{
                exportGodot();setShowExport(false);
              }} className="w-full text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 text-left">
                Godot TileSet Export
              </button>
              <p className="text-[10px] text-neutral-500">Canvas: {w}×{h} | Tiles: {tileSize}px | Layers: {layers.length} | Frames: {totalAnimFrames}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── PROJECT MODAL ─── */}
      {showProject&&(
        <div className="modal-overlay" onClick={()=>setShowProject(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">💾 Project</h3>
            <div className="space-y-2">
              <button onClick={()=>{saveProject();setShowProject(false);}} className="w-full text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 text-left">
                Save Project (.pproj)
              </button>
              <label className="block text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 cursor-pointer">
                Load Project (.pproj)
                <input type="file" accept=".pproj,application/octet-stream" className="hidden" onChange={e=>{if(e.target.files[0]){loadProject(e.target.files[0]);setShowProject(false);}}}/>
              </label>
              <div className="border-t border-neutral-700 pt-2 mt-2">
                <span className="text-[10px] text-neutral-500 block mb-1">Canvas Size</span>
                <div className="flex gap-2 items-center">
                  <input type="number" min={8} max={2048} value={w} onChange={e=>setW(+e.target.value||64)} className="godown w-20 text-xs"/>
                  <span className="text-neutral-500">×</span>
                  <input type="number" min={8} max={2048} value={h} onChange={e=>setH(+e.target.value||64)} className="godown w-20 text-xs"/>
                  <button onClick={()=>{
                    // Resize all layers
                    setLayers(layers.map(l=>({...l,frames:l.frames.map(f=>{
                      const nc=document.createElement('canvas');nc.width=w;nc.height=h;
                      nc.getContext('2d').drawImage(f.canvas,0,0);return{...f,canvas:nc,ctx:nc.getContext('2d')};
                    })})));
                    show('Canvas resized');
                  }} className="text-[10px] px-2 py-1 bg-blue-700 rounded hover:bg-blue-600">Resize</button>
                </div>
              </div>
              <div className="border-t border-neutral-700 pt-2 mt-2">
                <span className="text-[10px] text-neutral-500 block mb-1">Tile Size</span>
                <select value={tileSize} onChange={e=>setTileSize(+e.target.value)} className="godown text-xs">
                  {[8,16,24,32,48,64].map(s=><option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST ─── */}
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}

const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
