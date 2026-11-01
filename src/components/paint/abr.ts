import type { BrushDef } from './brushes';

/** Bounded sampled-tip reader. Computed (vector) legacy brushes are skipped. */
export function parseAbr(buffer: ArrayBuffer, fileName = 'Photoshop Brush'): Partial<BrushDef>[] {
  const bytes = new Uint8Array(buffer), v = new DataView(buffer);
  let p = 0, limit = bytes.length;
  const need = (n: number) => { if (!Number.isSafeInteger(n) || n < 0 || p + n > limit) throw new Error('Truncated ABR'); };
  const u8 = () => { need(1); return v.getUint8(p++); };
  const u16 = () => { need(2); const n = v.getUint16(p); p += 2; return n; };
  const u32 = () => { need(4); const n = v.getUint32(p); p += 4; return n; };
  const i32 = () => { need(4); const n = v.getInt32(p); p += 4; return n; };
  const skip = (n: number) => { need(n); p += n; };
  const text = (n: number) => { need(n); const s = String.fromCharCode(...bytes.subarray(p,p+n)); p += n; return s; };
  const version = u16(), sub = u16(), out: Partial<BrushDef>[] = [];
  const sample = (name: string, spacing: number) => {
    const top = i32(), left = i32(), h = i32() - top, w = i32() - left;
    const depth = u16(), compression = u8();
    if (w < 1 || h < 1 || w*h > 16_000_000 || ![8,16].includes(depth) || compression > 1) throw new Error('Unsupported ABR sample');
    const stride = w * (depth / 8), pixels = new Uint8Array(w*h);
    if (!compression) {
      need(stride*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) pixels[y*w+x] = bytes[p + y*stride + x*(depth/8)]!;
      p += stride*h;
    } else {
      const lengths = new Uint16Array(h);
      for(let y=0;y<h;y++) lengths[y]=u16();
      const row = new Uint8Array(stride);
      for(let y=0;y<h;y++) {
        const end = p+lengths[y]!; need(lengths[y]!); let x=0;
        while(p<end) {
          const n=u8();
          if(n<128) { const count=n+1; if(p+count>end || x+count>stride) throw new Error('Invalid ABR RLE'); row.set(bytes.subarray(p,p+count),x);p+=count;x+=count; }
          else if(n>128) { const count=257-n; if(p>=end || x+count>stride) throw new Error('Invalid ABR RLE');row.fill(u8(),x,x+count);x+=count; }
        }
        if(x!==stride) throw new Error('Incomplete ABR row');
        for(let x=0;x<w;x++) pixels[y*w+x]=row[x*(depth/8)]!;
      }
    }
    out.push({name,category:'Imported',tipImage:maskPng(w,h,pixels),hardness:1,spacing:Math.max(.01,spacing/100),maxSize:Math.min(400,Math.max(w,h)),sizePressure:.6});
  };
  if(version===1 || version===2) {
    for(let i=0;i<sub;i++) {
      const type=u16(), length=u32(), end=p+length; need(length); const outer=limit;limit=end;
      if(type===2) {
        skip(4); const spacing=u16();let name=`${fileName.replace(/\.[^.]+$/,'')} ${i+1}`;
        if(version===2) {const n=u32();need(n*2);let s='';for(let j=0;j<n;j++) s+=String.fromCharCode(u16());name=s.replace(/\0+$/,'') || name;}
        skip(9);sample(name,spacing);
      }
      p=end;limit=outer;
    }
  } else if(version>=6 && (sub===1 || sub===2)) {
    while(p<limit) {
      if(text(4)!=='8BIM') throw new Error('Invalid ABR section');
      const tag=text(4), length=u32(), end=p+length;need(length);
      if(tag==='samp') {
        const outer=limit;limit=end;
        while(p<end) {
          const length=u32(), start=p;need(length);const recordEnd=start+length;
          limit=recordEnd;skip(sub===1?47:301);
          sample(`${fileName.replace(/\.[^.]+$/,'')} ${out.length+1}`,25);
          limit=end;p=start+Math.ceil(length/4)*4;
          if(p>end) throw new Error('Invalid ABR alignment');
        }
        limit=outer;
      }
      p=end;
    }
  } else throw new Error('Unsupported ABR version');
  if(!out.length) throw new Error('No sampled tips in ABR');
  return out;
}

/** Portable PNG encoding: grayscale paint amount becomes black with alpha. */
function maskPng(w: number,h: number,mask: Uint8Array): string {
  const be=(n:number)=>new Uint8Array([n>>>24,n>>>16,n>>>8,n]);
  const join=(parts:Uint8Array[])=>{const a=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){a.set(p,o);o+=p.length;}return a;};
  const chunk=(type:string,data:Uint8Array)=>{const a=join([new TextEncoder().encode(type),data]);let crc=0xffffffff;for(const b of a){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return join([be(data.length),a,be((crc^0xffffffff)>>>0)]);};
  const raw=new Uint8Array(h*(1+w*2));for(let y=0;y<h;y++)for(let x=0;x<w;x++)raw[y*(1+w*2)+1+x*2+1]=mask[y*w+x]!;
  const blocks:Uint8Array[]=[new Uint8Array([0x78,0x01])];
  for(let p=0;p<raw.length;p+=65535){const n=Math.min(65535,raw.length-p);blocks.push(new Uint8Array([p+n===raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255]),raw.subarray(p,p+n));}
  let a=1,b=0;for(const x of raw){a=(a+x)%65521;b=(b+a)%65521;}blocks.push(be((b*65536+a)>>>0));
  const ihdr=join([be(w),be(h),new Uint8Array([8,4,0,0,0])]);
  const png=join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',join(blocks)),chunk('IEND',new Uint8Array())]);
  let binary='';for(let i=0;i<png.length;i+=0x8000)binary+=String.fromCharCode(...png.subarray(i,i+0x8000));
  return 'data:image/png;base64,'+btoa(binary);
}
