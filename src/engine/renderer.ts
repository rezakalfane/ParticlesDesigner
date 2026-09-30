import { DEFAULT_GEOMETRY, geometryGLSL, type CustomGeometry } from "./customGeometry";
import { cyclicDelta } from "./interpolation";
import { BAKED_FORMATION_START, BAKED_SHAPES } from "./bakedShapes";
/** Built-in shapes 0..29, the live custom formula (30), then baked formulas (31+). */
export const PARTICLE_FORMATION_COUNT = BAKED_FORMATION_START + BAKED_SHAPES.length;
/** Baked Designer formulas are compiled into the one shader, so switching to them never recompiles. */
const BAKED_GEOMETRY_GLSL = `vec3 bakedPosition(float id, float t, int shape) {
  float a=hash(id), b=hash(id+921.0), c=hash(id+2719.0);
${BAKED_SHAPES.map((shape, i) => `  if(shape==${BAKED_FORMATION_START + i}) return ${geometryGLSL(shape.geometry)};`).join("\n")}
  return vec3(0.0);
}`;
/** Values 0..1 retain the original 1k..100k mapping; Designer can opt into 200k. */
export function particleCount(density: number, limit = 100_000): number {
  const value = Number.isFinite(density) ? Math.max(0, Math.min(2, density)) : 0.44;
  return Math.min(
    limit,
    Math.round(1000 + Math.min(1, value) * 99000 + Math.max(0, value - 1) * 100000),
  );
}

/** Scaled-down looks never drop below this many particles (unless authored lower). */
const MIN_SCALED_COUNT = 4000;
/** Standalone, clock-injected GPU surface. No audio, RAF, registry or session ownership. */
export interface ParticleDrive {
  formation: number;
  /** Optional lab-only direct shape blend; omitted preserves scalar journey semantics. */
  formationWeights?: number[];
  customMix?: number;
  spread: number;
  /** Scatter around the authored formation, independent of overall expansion. */
  dispersion?: number;
  turbulence: number;
  turbulenceScale?: number;
  turbulenceDensity?: number;
  glow: number;
  trail: number;
  ribbonLength: number;
  /** Designer-only head multiplier; legacy drives retain their original size. */
  headSize?: number;
  /** Independent ribbon width multiplier; omitted retains the original fine strands. */
  trailWidth?: number;
  shock: number;
  density: number;
  thickness: number;
  halo: number;
  softness: number;
  focus: number;
  motionTime: number;
  collapse: number;
  explosion: number;
  attraction: number;
  separation: number;
  attractorAngle: number;
  hue: number;
  colorVariety?: number;
  /** Optional Designer-authored RGB palette, flattened, one to six colors. */
  palette?: readonly number[];
  low: number;
  mid: number;
  high: number;
  ripple: number;
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
}

const vertex = `#version 300 es
precision highp float;
uniform float u_time, u_aspect, u_height;
uniform vec4 u_shape;
uniform vec4 u_audio;
uniform vec4 u_view;
uniform vec3 u_palette[6];
uniform int u_paletteCount;
uniform float u_hue, u_opacity, u_thickness, u_colorVariety, u_headSize, u_trailWidth;
uniform vec3 u_lens; // halo, depth softness, focus
uniform float u_motionTime, u_previousMotionTime;
uniform bool u_ribbon;
uniform float u_customMix;
uniform vec4 u_turbulenceField;
uniform float u_weights[${PARTICLE_FORMATION_COUNT}], u_previousWeights[${PARTICLE_FORMATION_COUNT}];
uniform vec2 u_dispersion;
uniform vec4 u_previousShape, u_previousAudio;
uniform vec2 u_previous; // time, tail opacity
uniform vec2 u_cycle, u_previousCycle;
uniform vec3 u_attractors, u_previousAttractors;
uniform vec2 u_waves[16]; // launch time, strength
uniform int u_waveCount;
out vec3 v_color;
out float v_light;
out float v_edge;
out float v_spriteScale;
out float v_blur;
float hash(float n) {
  uint x=uint(n)+1u;
  x=((x>>16u)^x)*0x45d9f3bu;
  x=((x>>16u)^x)*0x45d9f3bu;
  x=(x>>16u)^x;
  return float(x)/4294967295.0;
}
float terrainNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float seed=(cell.x+128.0)+(cell.y+128.0)*257.0;
  return mix(mix(hash(seed),hash(seed+1.0),f.x),mix(hash(seed+257.0),hash(seed+258.0),f.x),f.y);
}
float terrainHeight(vec2 ground, float t) {
  float broad=terrainNoise(ground*0.65+vec2(13.2,5.7));
  float warp=terrainNoise(ground*1.1+vec2(7.4,19.3));
  float ridge=1.0-abs(terrainNoise(ground*1.05+vec2(warp*0.7,3.2))*2.0-1.0);
  float mountain=pow(ridge,3.0)*(0.35+broad*1.05);
  float crest=ground.x*3.1+ground.y*0.65+warp*3.5;
  // Harmonics make asymmetric windward and leeward slopes.
  float dunes=0.20*sin(crest)+0.075*sin(crest*2.0+0.7);
  float ripples=0.025*sin(crest*9.0+ground.y*2.0-t*0.12);
  return mountain+dunes+0.12*terrainNoise(ground*3.8)-0.65+ripples;
}
// Smooth crescent ridges with small wind ripples; grains move across this fixed surface.
float sandHeight(vec2 g) {
  // Broken crescent crests, not parallel sine waves: broad warping creates
  // saddles and valleys while varying height gives real foreground relief.
  float warp=terrainNoise(g*0.65+vec2(12.4,7.1));
  float crest=g.x*2.7+1.5*sin(g.y*1.05)+warp*2.4;
  float ridge=pow(max(0.0,0.5+0.5*cos(crest)),1.5);
  float height=0.65+1.05*terrainNoise(g*0.75+vec2(23.0,4.0));
  float lee=0.16*sin(crest*2.0+0.6)*ridge;
  float ripples=0.013*sin(crest*22.0+g.y*5.0)*(0.4+0.6*ridge);
  return ridge*height+lee+0.20*terrainNoise(g*0.45+vec2(5.0,8.0))-0.65+ripples;
}

mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float shapeDivide(float a,float b) { return a/(abs(b)<0.0001 ? (b<0.0 ? -0.0001 : 0.0001) : b); }
${BAKED_GEOMETRY_GLSL}
vec3 formationPosition(float id, float t, vec4 u_shape) {
  float a=hash(id), b=hash(id+921.0), c=hash(id+2719.0), tau=6.2831853;
  float angle=a*tau, tube=b*tau;
  if(u_shape.x>=30.0) return CUSTOM_GEOMETRY_EXPRESSION;
  if(u_shape.x>=29.0) {
    // Periodic domain: grains wrap at the far edges, not through the dune interior.
    float speed=0.055+hash(id+871.0)*0.055;
    vec2 g=vec2(fract(a+t*speed/6.0)*6.0-3.0,(b-0.5)*5.0);
    float lift=c>0.90 ? pow(sin(fract(t*0.32+hash(id+882.0))*3.14159265),2.0)*0.16 : 0.0;
    return vec3(g.x,sandHeight(g)+lift,g.y);
  }
  if(u_shape.x>=28.0) {
    // Shared strand seeds make dense points read as continuous, hair-fine threads.
    float strand=floor(hash(id+5101.0)*220.0), family=mod(strand,4.0);
    float seed=hash(strand+9101.0), along=a*2.0-1.0;
    float phase=family*1.35+t*0.20;
    float x=along*3.05+0.55*sin(along*7.0+phase+seed*1.4);
    float y=0.62*sin(along*5.8+phase+seed*0.55)+0.30*sin(along*10.0-phase*0.6);
    y+=(family-1.5)*0.25+(seed-0.5)*(0.40+0.65*cos(along*3.0)*cos(along*3.0));
    float z=0.40*cos(along*5.0+phase)+(seed-0.5)*0.6;
    return vec3(x,y,z);
  }
  if(u_shape.x>=26.0) {
    if(u_shape.x<27.0) {
      float z=2.0*b-1.0;
      vec3 normal=vec3(sqrt(1.0-z*z)*cos(angle),z,sqrt(1.0-z*z)*sin(angle));
      float ripple=sin(normal.x*4.5+t*0.52)*sin(normal.y*3.5-t*0.37)*cos(normal.z*3.8+t*0.28);
      float radius=1.0+0.22*ripple+0.13*sin(normal.y*5.0+t*0.4);
      vec3 liquid=normal*radius;
      liquid.xz*=rot(normal.y*0.65+0.20*sin(t*0.3));
      liquid.y*=0.82;
      if(c>0.94) {
        float drop=floor(a*9.0), phase=drop*tau/9.0+t*0.12;
        vec3 centre=vec3(cos(phase)*1.42,0.70*sin(phase*2.0+t*0.18),sin(phase)*1.42);
        return centre+normal*(0.06+hash(drop+121.0)*0.06);
      }
      return liquid;
    }
    float height=b;
    if(c>0.93) {
      height=fract(b+t*0.13);
      float radius=0.18+0.6*hash(id+639.0);
      return vec3(cos(angle+t*0.2)*radius+0.2*sin(height*5.0-t),-1.0+height*3.8,sin(angle+t*0.2)*radius*0.6);
    }
    float plume=floor(a*7.0), along=fract(a*7.0);
    float theta=plume*tau/7.0+along*1.2+height*2.6-t*0.16;
    float taper=pow(1.0-height,0.78);
    float radius=(0.12+0.62*pow(c/0.93,0.65))*taper;
    radius*=0.78+0.22*sin(height*13.0-t*1.2+plume);
    vec3 flame=vec3(cos(theta)*radius,-1.15+height*(2.7+0.35*sin(plume*2.3)),sin(theta)*radius*0.65);
    flame.x+=height*0.30*sin(height*6.0-t*0.8)+height*height*0.20*sin(height*11.0-t*1.1+plume);
    flame.z+=height*0.13*cos(height*7.0-t*0.7+plume);
    return flame;
  }
  if(u_shape.x>=25.0) {
    float breath=0.92+0.08*sin(t*0.32);
    if(c<0.56) {
      // Six continuous folded ribbons: stable identities, no particle respawn.
      float arm=floor(a*6.0), along=fract(a*6.0), across=b*2.0-1.0;
      float theta=arm*tau/6.0+along*4.4+t*0.18;
      float radius=(0.24+pow(along,0.78)*1.85)*breath;
      float width=sin(along*3.14159265)*(0.12+0.12*sin(t*0.22+arm)*sin(t*0.22+arm));
      vec3 ribbon=vec3(cos(theta)*radius,0.55*sin(along*7.0+t*0.28+arm*1.0472)*along,sin(theta)*radius);
      ribbon+=vec3(cos(theta)*across*width,sin(across*3.14159265+along*9.0+t*0.4)*width,sin(theta)*across*width);
      ribbon.y+=across*across*0.15*sin(along*3.14159265);
      return ribbon;
    }
    if(c<0.77) {
      float hoop=floor(a*3.0), theta=fract(a*3.0)*tau+t*(0.10+hoop*0.045);
      float radius=1.40+(b-0.5)*0.025+0.055*sin(theta*9.0+t*0.25);
      vec3 orbit=vec3(cos(theta)*radius,sin(theta)*radius,0.0);
      orbit.yz*=rot(0.55+hoop*1.0472+0.20*sin(t*0.18));
      orbit.xz*=rot(t*0.08+hoop*0.45);
      return orbit;
    }
    float z=2.0*b-1.0;
    vec3 normal=vec3(sqrt(1.0-z*z)*cos(angle),z,sqrt(1.0-z*z)*sin(angle));
    if(c<0.88) return normal*(0.23+0.035*sin(angle*7.0+t)*sin(z*9.0-t*0.4))*breath;
    vec3 dust=normal*(2.05+hash(id+771.0)*0.60);
    dust.xz*=rot(t*0.05+z*0.6);
    return dust;
  }
  if(u_shape.x>=21.0) {
    if(u_shape.x<22.0) {
      if(c>0.90) {
        float z=2.0*b-1.0;
        return vec3(sqrt(1.0-z*z)*cos(angle),z,sqrt(1.0-z*z)*sin(angle))*0.22+vec3(0.0,0.15,0.0);
      }
      float layer=floor(c*3.3333), petal=floor(a*10.0), along=fract(a*10.0);
      float across=b*2.0-1.0;
      float opening=0.92+0.08*sin(t*0.28+layer*0.6);
      float radius=(0.08+sin(along*1.42)*1.65)*(1.0-layer*0.18)*opening;
      float theta=petal*tau/10.0+layer*0.31+across*sin(along*3.14159265)*0.34;
      float height=-0.40+layer*0.20+along*along*(0.55+layer*0.2)+across*across*sin(along*3.14159265)*0.32;
      return vec3(cos(theta)*radius,height,sin(theta)*radius);
    }
    if(u_shape.x<23.0) {
      if(c<0.76) {
        float radius=0.30+pow(b,0.75)*0.66;
        float filament=angle+0.028*sin(b*17.0+t*0.35+floor(a*260.0));
        return vec3(cos(filament)*radius,sin(filament)*radius,(c-0.38)*0.10);
      }
      float radius=1.0+(b-0.5)*0.06;
      return vec3(cos(angle)*1.80,sin(angle)*(0.72+0.08*sin(t*0.25)),-0.06)*radius;
    }
    if(u_shape.x<24.0) {
      float ring=floor(c*12.0), z=1.0-ring*0.35;
      float theta=angle+t*0.12*(mod(ring,2.0)*2.0-1.0)+ring*0.16;
      float radius=0.95+0.035*cos(theta*6.0+ring)+(b-0.5)*0.035;
      return vec3(cos(theta)*radius,sin(theta)*radius,z);
    }
    float ray=floor(a*180.0), theta=angle+0.04*b*sin(b*6.0+t*0.4+ray);
    float reach=0.35+0.7*pow(0.5+0.5*sin(ray*2.39996),3.0);
    float radius=0.86+pow(b,2.7)*reach*(0.9+0.1*sin(t*0.35+ray));
    return vec3(cos(theta)*radius,sin(theta)*radius,(c-0.5)*0.10);
  }
  if(u_shape.x>=17.0) {
    float z=2.0*b-1.0;
    vec3 normal=vec3(sqrt(1.0-z*z)*cos(angle),z,sqrt(1.0-z*z)*sin(angle));
    if(u_shape.x<18.0) {
      if(c<0.83) return normal*(c>0.77 ? 1.025 : 1.0);
      float phase=t*0.13+0.55;
      return vec3(cos(phase)*1.65,0.22,sin(phase)*1.65)+normal*0.265;
    }
    if(u_shape.x<19.0) return normal*1.15;
    if(u_shape.x<20.0) {
      if(c<0.55) return normal*vec3(0.82,0.74,0.82);
      float radius=1.02+b*0.94;
      // Cassini division and a finer outer gap, without rejection sampling.
      if(radius>1.49) radius+=0.065;
      if(radius>1.85) radius+=0.022;
      return vec3(cos(angle)*radius,(hash(id+97.0)-0.5)*0.008,sin(angle)*radius);
    }
    float whirl=angle+t*(0.24+0.6*(1.0-b));
    if(c<0.78) {
      float radius=0.56+pow(b,0.8)*1.50;
      return vec3(cos(whirl)*radius,(c-0.39)*0.024,sin(whirl)*radius);
    }
    // A luminous lensed arc rises behind the dark central silhouette.
    float radius=0.56+pow(b,1.8)*0.24;
    return vec3(cos(whirl)*radius,sin(whirl)*radius,0.025*sin(angle*3.0));
  }
  if(u_shape.x>=16.0) {
    // Stable particle membership: eight orbiting bodies, a sun and orbit dust.
    float planet=floor(hash(id+6101.0)*8.0);
    float orbit=0.64+planet*0.27;
    float phase=planet*2.399963+t*0.48/pow(orbit+0.3,1.5);
    float z=2.0*b-1.0;
    vec3 normal=vec3(sqrt(1.0-z*z)*cos(angle),z,sqrt(1.0-z*z)*sin(angle));
    if(c<0.24) {
      float radius=0.30+0.018*sin(angle*9.0+t*1.2)*sin(z*12.0-t);
      return normal*radius*mix(0.82,1.0,hash(id+73.0));
    }
    vec3 centre=vec3(cos(phase)*orbit,0.015*sin(phase+planet),sin(phase)*orbit);
    if(c<0.82) {
      float sizes[8]=float[8](0.044,0.067,0.074,0.055,0.15,0.125,0.09,0.087);
      // Saturn's tilted, broad dust rings stay attached to the moving planet.
      if(planet==5.0 && hash(id+8191.0)>0.62) {
        float radius=mix(0.17,0.25,b);
        vec3 ring=vec3(cos(angle)*radius,(hash(id+97.0)-0.5)*0.006,sin(angle)*radius);
        ring.xy*=rot(0.38);
        return centre+ring;
      }
      return centre+normal*sizes[int(planet)];
    }
    float radius=orbit+(b-0.5)*0.006;
    return vec3(cos(angle)*radius,(hash(id+97.0)-0.5)*0.004,sin(angle)*radius);
  }
  float r=1.25+0.30*cos(tube)+0.09*sin(angle*7.0+t*0.4);
  vec3 vortex=vec3(cos(angle)*r, sin(tube)*0.30, sin(angle)*r);
  vortex.xz*=rot(t*0.13+(c-0.5)*0.3);
  vortex.y+=0.23*sin(angle*3.0+t*0.35);
  float latitude=acos(2.0*b-1.0);
  float shell=0.96+0.12*sin(angle*6.0+latitude*4.0+t*0.5)+(c-0.5)*0.08;
  vec3 sphere=vec3(sin(latitude)*cos(angle),cos(latitude),sin(latitude)*sin(angle))*shell;
  vec3 tidal=vec3((a-0.5)*3.4,0.0,(b-0.5)*2.6);
  tidal.y=0.32*sin(tidal.x*3.0+t*0.6)+0.22*cos(tidal.z*4.0-t*0.45)+(c-0.5)*0.06;
  vec3 p=mix(vortex,sphere,clamp(u_shape.x,0.0,1.0));
  p=mix(p,tidal,clamp(u_shape.x-1.0,0.0,1.0));
  float helixAngle=b*18.8495559+t*0.22+(a>0.5 ? 3.14159265 : 0.0);
  vec3 helix=vec3(cos(helixAngle)*0.65,(b-0.5)*2.8,sin(helixAngle)*0.65);
  helix+=vec3(cos(angle),sin(tube),sin(angle))*(c-0.5)*0.12;
  p=mix(p,helix,clamp(u_shape.x-2.0,0.0,1.0));
  // Lab formations are appended: existing 0..3 shapes retain their identity.
  // Uniform branches keep the extra trigonometry off the original shapes.
  if(u_shape.x>3.0) {
    float radius=0.12+1.55*sqrt(b);
    float arm=floor(a*3.0)*tau/3.0;
    float spiral=arm+radius*2.8+t*0.12+(fract(a*3.0)-0.5)*0.90;
    vec3 galaxy=vec3(cos(spiral)*radius,(c-0.5)*0.28,sin(spiral)*radius);
    galaxy.y+=0.10*sin(spiral*2.0+t*0.25)*b;
    p=mix(p,galaxy,clamp(u_shape.x-3.0,0.0,1.0));
  }
  if(u_shape.x>4.0) {
    float q=angle+t*0.10;
    vec3 knot=vec3(sin(q)+2.0*sin(2.0*q),cos(q)-2.0*cos(2.0*q),-sin(3.0*q))*0.48;
    vec3 tangent=normalize(vec3(cos(q)+4.0*cos(2.0*q),-sin(q)+4.0*sin(2.0*q),-3.0*cos(3.0*q)));
    vec3 normal=normalize(cross(tangent,vec3(0.0,0.0,1.0)));
    vec3 binormal=cross(tangent,normal);
    knot+=(normal*cos(tube)+binormal*sin(tube))*(0.07+0.08*c);
    p=mix(p,knot,clamp(u_shape.x-4.0,0.0,1.0));
  }
  if(u_shape.x>5.0) {
    float q=angle+t*0.12, width=(b-0.5)*0.85;
    vec3 ribbon=vec3((1.10+width*cos(q*0.5))*cos(q),width*sin(q*0.5),(1.10+width*cos(q*0.5))*sin(q));
    ribbon.y+=(c-0.5)*0.04;
    p=mix(p,ribbon,clamp(u_shape.x-5.0,0.0,1.0));
  }
  if(u_shape.x>6.0) {
    float petal=0.85+0.55*cos(angle*5.0+t*0.18);
    float radius=sqrt(b)*petal;
    vec3 bloom=vec3(cos(angle)*radius,0.45*sin(b*3.14159265)-0.25*b+0.18*cos(angle*5.0)*b,sin(angle)*radius);
    bloom.y+=(c-0.5)*0.07;
    p=mix(p,bloom,clamp(u_shape.x-6.0,0.0,1.0));
  }
  if(u_shape.x>7.0) {
    // Six great-circle hoops, with a small tubular cross-section.
    float hoop=floor(b*6.0), tilt=hoop*3.14159265/6.0;
    vec3 cage=vec3(cos(angle),sin(angle)*cos(tilt),sin(angle)*sin(tilt))*1.25;
    cage+=vec3(cos(tube),sin(tube),sin(angle))*(c-0.5)*0.09;
    cage.xz*=rot(t*0.10);
    p=mix(p,cage,clamp(u_shape.x-7.0,0.0,1.0));
  }
  if(u_shape.x>8.0) {
    float q=a*tau*2.5, growth=0.12+1.10*a;
    float tubeRadius=0.08+0.35*a;
    vec3 shell=vec3((growth+tubeRadius*cos(tube))*cos(q),(a-0.5)*1.5+tubeRadius*sin(tube),(growth+tubeRadius*cos(tube))*sin(q));
    p=mix(p,shell,clamp(u_shape.x-8.0,0.0,1.0));
  }
  if(u_shape.x>9.0) {
    float curtain=floor(c*3.0)-1.0;
    float x=(a-0.5)*3.1;
    vec3 aurora=vec3(x,(b-0.5)*1.65+0.22*sin(x*2.0+t*0.3),curtain*0.48+0.30*sin(x*2.8+t*0.4+b*1.6));
    p=mix(p,aurora,clamp(u_shape.x-9.0,0.0,1.0));
  }
  if(u_shape.x>10.0) {
    float lineA=(floor(b*5.0)-2.0)*0.52;
    float lineB=(floor(c*5.0)-2.0)*0.52;
    float axis=floor(a*3.0), along=(fract(a*3.0)-0.5)*2.08;
    vec3 lattice=axis<1.0 ? vec3(along,lineA,lineB) : axis<2.0 ? vec3(lineA,along,lineB) : vec3(lineA,lineB,along);
    lattice+=vec3(hash(id+89.0)-0.5,hash(id+193.0)-0.5,hash(id+307.0)-0.5)*0.04;
    p=mix(p,lattice,clamp(u_shape.x-10.0,0.0,1.0));
  }
  if(u_shape.x>11.0) {
    float ray=floor(a*32.0), z=1.0-2.0*(ray+0.5)/32.0;
    float q=ray*2.39996323, radial=sqrt(1.0-z*z);
    vec3 direction=vec3(radial*cos(q),z,radial*sin(q));
    float distance=0.12+1.45*pow(b,0.65);
    vec3 star=direction*distance;
    star+=vec3(hash(id+601.0)-0.5,hash(id+809.0)-0.5,c-0.5)*0.09*(1.0-b);
    p=mix(p,star,clamp(u_shape.x-11.0,0.0,1.0));
  }
  if(u_shape.x>12.0) {
    // Vertical rays share a folded lower edge: coherent curtains, not a cloud.
    float ray=floor(a*480.0)/479.0;
    float sheet=floor(c*3.0);
    float x=(ray-0.5)*3.8;
    float fold=0.32*sin(x*2.2+t*0.18+sheet*0.9)+0.12*sin(x*6.4-t*0.12+sheet);
    float hem=-0.68+0.17*sin(x*1.8+t*0.16+sheet*0.6);
    float height=b*(1.35+0.35*sin(x*1.3+sheet+t*0.09));
    vec3 aurora=vec3(x+0.09*height*sin(x*2.4+t*0.13),hem+height,(sheet-1.0)*0.52+fold);
    aurora.z+=(fract(c*3.0)-0.5)*0.035;
    p=mix(p,aurora,clamp(u_shape.x-12.0,0.0,1.0));
  }
  if(u_shape.x>13.0) {
    float pulse=1.0+0.07*sin(t*0.7);
    vec3 jelly;
    if(c<0.58) {
      float radius=sqrt(b)*0.88;
      jelly=vec3(cos(angle)*radius*pulse,0.35+0.58*sqrt(max(0.0,1.0-b)),sin(angle)*radius*pulse);
      jelly.y+=0.035*cos(angle*12.0)*(b*b);
    } else if(c<0.80) {
      // Four broad oral arms: folded membranes with ruffled, diffuse edges.
      float arm=floor(a*4.0), phase=arm*tau/4.0;
      float across=fract(a*4.0)*2.0-1.0;
      float bend=phase+0.55*sin(b*4.2+t*0.38+phase);
      float reach=0.12+b*0.12+0.055*sin(b*7.0+t*0.45+phase)*b;
      float width=(0.04+0.075*sin(b*3.14159265))*across;
      float frill=sin(b*62.0+across*5.0+t*0.28)*0.045*abs(across);
      jelly=vec3(cos(bend)*reach-sin(bend)*width,0.35-b*(2.85+0.35*hash(arm+73.0))+frill,sin(bend)*reach+cos(bend)*width);
      jelly+=vec3(hash(id+941.0)-0.5,hash(id+1481.0)-0.5,hash(id+2039.0)-0.5)*(0.008+0.03*b*b);
    } else {
      // Fine tentacles keep their roots, then fan out with different lengths.
      float strandId=floor(a*36.0), strand=strandId*tau/36.0;
      float seed=hash(strandId+317.0);
      float radius=0.66*(1.0-0.52*b)+b*b*(seed-0.25)*0.16;
      float sway=b*(0.06+0.11*b);
      jelly=vec3(cos(strand)*radius+sway*sin(b*7.0+t*0.55+strand),0.35-b*(2.50+1.0*seed),sin(strand)*radius+sway*cos(b*6.0+t*0.45+strand));
      jelly+=vec3(hash(id+409.0)-0.5,hash(id+613.0)-0.5,hash(id+829.0)-0.5)*(0.008+0.035*b*b);
    }
    p=mix(p,jelly,clamp(u_shape.x-13.0,0.0,1.0));
  }
  if(u_shape.x>14.0) {
    vec3 dunes=vec3((a-0.5)*4.8,0.0,(b-0.5)*4.2);
    dunes.y=terrainHeight(dunes.xz,t)+(c-0.5)*0.025;
    p=mix(p,dunes,clamp(u_shape.x-14.0,0.0,1.0));
  }
  return p;
}
vec3 position(float id, float clock, float t, vec4 u_shape, vec4 u_audio, vec2 cycle, vec3 attractors, bool previous) {
  float a=hash(id), b=hash(id+921.0), c=hash(id+2719.0);
  vec3 p=vec3(0.0);
  float weightSum=0.0;
  for(int i=0;i<${BAKED_FORMATION_START};i++) {
    float weight=previous ? u_previousWeights[i] : u_weights[i];
    if(weight>0.0001) {
      p+=formationPosition(id,t,vec4(float(i),u_shape.yzw))*weight;
      weightSum+=weight;
    }
  }
  // Baked formulas stay out of the built-in shape function (keeps its register budget).
  for(int i=${BAKED_FORMATION_START};i<${PARTICLE_FORMATION_COUNT};i++) {
    float weight=previous ? u_previousWeights[i] : u_weights[i];
    if(weight>0.0001) {
      p+=bakedPosition(id,t,i)*weight;
      weightSum+=weight;
    }
  }
  if(weightSum>0.0) p/=weightSum;
  else p=u_shape.x>=${BAKED_FORMATION_START}.0 ? bakedPosition(id,t,int(u_shape.x+0.5)) : formationPosition(id,t,u_shape);
  float aurora=weightSum>0.0 ? (previous ? u_previousWeights[13] : u_weights[13])/weightSum : max(0.0,1.0-abs(u_shape.x-13.0));
  float landscape=weightSum>0.0 ? (previous ? u_previousWeights[15] : u_weights[15])/weightSum : max(0.0,1.0-abs(u_shape.x-15.0));
  float jellyfish=weightSum>0.0 ? (previous ? u_previousWeights[14] : u_weights[14])/weightSum : max(0.0,1.0-abs(u_shape.x-14.0));
  float solar=weightSum>0.0 ? (previous ? u_previousWeights[16] : u_weights[16])/weightSum : max(0.0,1.0-abs(u_shape.x-16.0));
  float celestial=solar;
  for(int i=17;i<${PARTICLE_FORMATION_COUNT};i++) celestial+=weightSum>0.0 ? (previous ? u_previousWeights[i] : u_weights[i])/weightSum : max(0.0,1.0-abs(u_shape.x-float(i)));
  float dispersion=previous ? u_dispersion.y : u_dispersion.x;
  p+=vec3(hash(id+4153.0)-0.5,hash(id+8923.0)-0.5,hash(id+12347.0)-0.5)*dispersion*1.6;
  float scale=previous ? u_turbulenceField.z : u_turbulenceField.x;
  float density=previous ? u_turbulenceField.w : u_turbulenceField.y;
  vec3 domain=p/max(0.1,scale);
  float pocket=0.5+0.5*sin(domain.x*1.7+t*0.12)*cos(domain.y*1.3-t*0.09)*sin(domain.z*1.9+0.6);
  float coverage=density>=0.999 ? 1.0 : smoothstep(1.0-density,1.08-density,pocket)*smoothstep(0.0,0.08,density);
  float flow=(u_shape.z+u_audio.y*0.55)*coverage;
  p+=flow*0.18*vec3(sin(domain.y*4.0+t+c*2.0),sin(domain.z*4.0-t*0.7),cos(domain.x*4.0+t*0.8));
  p.xz*=rot(p.y*(0.35+flow*1.8)*(1.0-aurora)*(1.0-landscape)*(1.0-celestial));
  float wave=sin(length(p)*10.0-t*5.0);
  p*=0.65+u_shape.y*0.65+u_audio.x*0.28+u_audio.w*0.16*wave;
  // Sparse outer dust gives perspective without an extra draw or buffer.
  if(c>0.94) p*=1.0+(c-0.94)*20.0*(1.0-aurora)*(1.0-landscape)*(1.0-jellyfish)*(1.0-celestial);
  float radius=length(p);
  for(int i=0;i<u_waveCount;i++) {
    float age=clock-u_waves[i].x;
    if(age>=0.0 && age<2.5 && u_waves[i].y>0.0) {
      float front=exp(-pow((radius-age*1.8)/0.22,2.0));
      p+=p/max(radius,0.001)*front*u_waves[i].y*0.65*exp(-age*0.65);
    }
  }
  // Two bounded analytic attractors: no integration drift or CPU simulation.
  // Seeded exchange varies smoothly, so particles travel between the two wells.
  float exchange=tanh(sin(t*0.35+a*6.2831853)*4.0);
  vec3 axis=vec3(cos(attractors.z),sin(attractors.z*0.7)*0.4,sin(attractors.z));
  vec3 centre=axis*exchange*attractors.y*(0.8+u_audio.x*0.12);
  vec3 local=p*0.55;
  local.xz*=rot(exchange*(t*0.18+p.y*1.4));
  p=mix(p,local+centre,attractors.x);
  vec3 scatter=normalize(vec3(a-0.5,b-0.5,c-0.5)+vec3(0.001));
  vec3 outward=p/max(length(p),0.001);
  p=p*(1.0-cycle.x*0.94)+(outward*0.75+scatter*0.25)*cycle.y*2.0;
  p.xz*=rot(u_view.x); p.yz*=rot(u_view.y); p.xy*=rot(u_view.w);
  return p;
}
vec4 project(vec3 p) {
  float depth=max(0.3,u_view.z-p.z);
  return vec4(p.x*2.1/u_aspect,p.y*2.1,depth-0.2,depth);
}
void main() {
  float id=float(u_ribbon ? gl_InstanceID*8 : gl_VertexID);
  float a=hash(id), b=hash(id+921.0), c=hash(id+2719.0);
  float angle=a*6.2831853, t=u_time;
  vec3 p=position(id,t,u_motionTime,u_shape,u_audio,u_cycle,u_attractors,false);
  float depth=max(0.3,u_view.z-p.z);
  gl_Position=project(p);
  gl_PointSize=clamp((2.0+c*2.0+u_audio.z*2.0)*u_height/900.0*3.5/depth*u_thickness,0.75,36.0);
  float silkSizeWeight=clamp(u_weights[28],0.0,1.0);
  gl_PointSize*=mix(1.0,c>0.993 ? 2.0 : 0.85,silkSizeWeight);
  // Ribbon instances follow every eighth point. Enlarge only their leading heads.
  if(!u_ribbon && mod(id,8.0)<0.5) gl_PointSize=min(64.0,gl_PointSize*u_headSize);
  float focusDepth=u_view.z+(u_lens.z-0.5)*4.0;
  v_blur=smoothstep(0.05,1.2,abs(depth-focusDepth))*u_lens.y;
  float originalSize=gl_PointSize;
  // Pixel-sized optical footprint remains visible even on tiny point heads
  // in four-view mode. No inverse-size attenuation that cancels the halo.
  float lensPixels=clamp(u_height/720.0,0.65,1.5);
  gl_PointSize=min(64.0,originalSize+(u_lens.x*14.0+v_blur*24.0)*lensPixels);
  v_spriteScale=gl_PointSize/originalSize;
  float opacity=u_opacity;
  v_edge=0.0;
  if(u_ribbon) {
    // Recycled sand grains must never bridge the two edges of the landscape.
    float sandSpeed=(0.055+hash(id+871.0)*0.055)/6.0;
    if(max(u_weights[29],u_previousWeights[29])>0.001 &&
       floor(a+u_motionTime*sandSpeed)!=floor(a+u_previousMotionTime*sandSpeed)) {
      gl_Position=vec4(2.0,2.0,2.0,1.0); v_color=vec3(0.0); v_light=0.0; return;
    }
    vec4 tail=project(position(id,u_previous.x,u_previousMotionTime,u_previousShape,u_previousAudio,u_previousCycle,u_previousAttractors,true));
    vec2 delta=(gl_Position.xy/gl_Position.w-tail.xy/tail.w)*vec2(u_aspect,1.0);
    vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),0.00001);
    int corner=gl_VertexID;
    bool atHead=corner==0 || corner==1 || corner==3;
    float side=(corner==0 || corner==2 || corner==5) ? -1.0 : 1.0;
    opacity=atHead ? u_opacity : u_previous.y;
    gl_Position=atHead ? gl_Position : tail;
    float width=(0.45+c*0.65)*sqrt(max(opacity,0.0))*u_trailWidth;
    gl_Position.xy+=normal/vec2(u_aspect,1.0)*side*width*2.0/u_height*gl_Position.w;
    v_edge=side;
  }
  vec3 ice=vec3(0.19,0.60,0.95), gold=vec3(1.0,0.38,0.09);
  float band=0.5+0.5*sin(angle*2.0+b*3.0+t*0.08);
  float variety=clamp(u_colorVariety,0.0,5.0);
  float palettePosition=smoothstep(0.10,0.90,band)*variety;
  v_color=mix(ice,gold,clamp(palettePosition,0.0,1.0));
  v_color=mix(v_color,vec3(0.65,0.25,1.0),clamp(palettePosition-1.0,0.0,1.0));
  v_color=mix(v_color,vec3(0.10,1.0,0.32),clamp(palettePosition-2.0,0.0,1.0));
  v_color=mix(v_color,vec3(1.0,0.18,0.55),clamp(palettePosition-3.0,0.0,1.0));
  v_color=mix(v_color,vec3(0.10,0.95,1.0),clamp(palettePosition-4.0,0.0,1.0));
  float totalWeight=0.0;
  for(int i=0;i<${PARTICLE_FORMATION_COUNT};i++) totalWeight+=u_weights[i];
  float aurora=totalWeight>0.0 ? u_weights[13]/totalWeight : max(0.0,1.0-abs(u_shape.x-13.0));
  // Emit green near the hem; additional colors spread along the vertical rays.
  float auroraPosition=smoothstep(0.08,0.82,b)*variety;
  vec3 auroraColor=mix(vec3(0.10,1.0,0.32),vec3(0.55,0.14,0.85),clamp(auroraPosition,0.0,1.0));
  auroraColor=mix(auroraColor,vec3(0.12,0.28,1.0),clamp(auroraPosition-1.0,0.0,1.0));
  auroraColor=mix(auroraColor,vec3(0.10,0.95,0.95),clamp(auroraPosition-2.0,0.0,1.0));
  auroraColor=mix(auroraColor,vec3(1.0,0.12,0.55),clamp(auroraPosition-3.0,0.0,1.0));
  auroraColor=mix(auroraColor,vec3(1.0,0.62,0.10),clamp(auroraPosition-4.0,0.0,1.0));
  v_color=mix(v_color,auroraColor,aurora);
  float solar=totalWeight>0.0 ? u_weights[16]/totalWeight : max(0.0,1.0-abs(u_shape.x-16.0));
  float planet=floor(hash(id+6101.0)*8.0);
  vec3 planetColors[8]=vec3[8](vec3(0.65,0.55,0.43),vec3(1.0,0.66,0.25),vec3(0.12,0.55,1.0),vec3(1.0,0.22,0.07),vec3(0.92,0.61,0.38),vec3(1.0,0.82,0.45),vec3(0.18,0.92,0.92),vec3(0.18,0.32,1.0));
  vec3 solarColor=c<0.24 ? mix(vec3(1.0,0.22,0.015),vec3(1.0,0.85,0.24),b) : planetColors[int(planet)];
  if(c>=0.82) solarColor=vec3(0.22,0.36,0.55);
  solarColor=mix(vec3(1.0,0.65,0.25),solarColor,clamp(variety,0.0,1.0));
  v_color=mix(v_color,solarColor,solar);
  float earth=totalWeight>0.0 ? u_weights[17]/totalWeight : max(0.0,1.0-abs(u_shape.x-17.0));
  float jupiter=totalWeight>0.0 ? u_weights[18]/totalWeight : max(0.0,1.0-abs(u_shape.x-18.0));
  float saturn=totalWeight>0.0 ? u_weights[19]/totalWeight : max(0.0,1.0-abs(u_shape.x-19.0));
  float hole=totalWeight>0.0 ? u_weights[20]/totalWeight : max(0.0,1.0-abs(u_shape.x-20.0));
  float planetVisibility=1.0;
  if(earth+jupiter+saturn>0.0001) {
  float latitude=2.0*b-1.0;
  vec3 globe=vec3(sqrt(1.0-latitude*latitude)*cos(angle),latitude,sqrt(1.0-latitude*latitude)*sin(angle));
  // Continuous spherical noise: no longitudinal seam in continents or clouds.
  vec2 map=globe.xy*3.8+globe.z*vec2(1.7,2.4);
  float land=terrainNoise(map)+0.22*terrainNoise(map*2.4+8.0);
  vec3 earthColor=mix(vec3(0.015,0.13,0.55),vec3(0.16,0.47,0.15),smoothstep(0.60,0.67,land));
  earthColor=mix(earthColor,vec3(0.64,0.50,0.24),smoothstep(0.73,0.87,land));
  float clouds=terrainNoise(map*2.2+vec2(t*0.012,0.0));
  earthColor=mix(earthColor,vec3(0.85,0.95,1.0),smoothstep(0.66,0.80,clouds)*0.85);
  earthColor=mix(earthColor,vec3(0.85,0.95,1.0),smoothstep(0.83,0.96,abs(latitude)));
  if(c>0.77 && c<0.83) earthColor=vec3(0.06,0.42,1.0);
  if(c>=0.83) earthColor=vec3(0.53,0.56,0.61)*(0.6+0.6*terrainNoise(map*5.0));
  float daylight=0.35+0.65*max(0.0,dot(globe,normalize(vec3(-0.7,0.4,0.65))));
  v_color=mix(v_color,earthColor*daylight,earth);
  float bands=0.5+0.5*sin(latitude*42.0+2.4*terrainNoise(globe.xz*4.0+latitude*3.0));
  vec3 jovian=mix(vec3(0.46,0.19,0.07),vec3(0.94,0.78,0.53),smoothstep(0.1,0.85,bands));
  jovian=mix(jovian,vec3(1.0,0.92,0.75),pow(0.5+0.5*sin(latitude*77.0+globe.x*3.0),10.0)*0.55);
  float spot=length(vec2((atan(globe.z,globe.x)-0.65)*2.8,(latitude+0.25)*10.0));
  jovian=mix(jovian,vec3(0.85,0.23,0.08),1.0-smoothstep(0.65,1.0,spot));
  v_color=mix(v_color,jovian*daylight,jupiter);
  vec3 saturnColor=mix(vec3(0.52,0.36,0.18),vec3(1.0,0.85,0.55),0.55+0.35*sin(latitude*38.0));
  if(c>=0.55) saturnColor=mix(vec3(0.25,0.21,0.17),vec3(0.93,0.81,0.61),0.5+0.3*sin(b*180.0)+0.2*sin(b*47.0));
  v_color=mix(v_color,saturnColor*(c<0.55 ? daylight : 0.75),saturn);
  vec3 facing=globe;
  facing.xz*=rot(u_view.x); facing.yz*=rot(u_view.y); facing.xy*=rot(u_view.w);
  float solid=earth+jupiter+saturn*(c<0.55 ? 1.0 : 0.0);
  planetVisibility=mix(1.0,smoothstep(-0.08,0.12,facing.z),solid);
  // Hide the rear rings where they pass behind the opaque planetary disk.
  if(saturn>0.0 && c>=0.55) {
    float radius=0.78*(0.65+u_shape.y*0.65);
    float disk=radius*radius-dot(p.xy,p.xy);
    if(disk>0.0 && p.z<sqrt(disk)) planetVisibility*=1.0-saturn;
  }
  }
  vec3 holeColor=mix(vec3(0.75,0.13,0.025),vec3(1.0,0.91,0.72),pow(1.0-b,1.7));
  if(c>=0.78) holeColor=mix(vec3(1.0,0.94,0.80),vec3(0.85,0.30,0.06),b);
  v_color=mix(v_color,holeColor,hole);
  float lotus=totalWeight>0.0 ? u_weights[21]/totalWeight : max(0.0,1.0-abs(u_shape.x-21.0));
  float eye=totalWeight>0.0 ? u_weights[22]/totalWeight : max(0.0,1.0-abs(u_shape.x-22.0));
  float portal=totalWeight>0.0 ? u_weights[23]/totalWeight : max(0.0,1.0-abs(u_shape.x-23.0));
  float eclipse=totalWeight>0.0 ? u_weights[24]/totalWeight : max(0.0,1.0-abs(u_shape.x-24.0));
  vec3 lotusColor=mix(vec3(0.20,0.75,1.0),vec3(0.72,0.12,0.95),clamp(c*1.4,0.0,1.0));
  lotusColor=mix(lotusColor,vec3(1.0,0.55,0.18),pow(abs(b*2.0-1.0),9.0));
  if(c>0.90) lotusColor=vec3(1.0,0.85,0.45);
  v_color=mix(v_color,lotusColor,lotus);
  vec3 eyeColor=mix(vec3(0.10,0.90,0.95),vec3(0.42,0.14,0.90),b);
  if(b<0.10 || c>=0.76) eyeColor=vec3(1.0,0.68,0.25);
  v_color=mix(v_color,eyeColor,eye);
  vec3 portalColor=mix(vec3(0.18,0.65,1.0),vec3(0.82,0.16,0.95),0.5+0.5*sin(floor(c*12.0)*0.75+t*0.12));
  if(mod(floor(c*12.0),4.0)==0.0) portalColor=vec3(1.0,0.67,0.28);
  v_color=mix(v_color,portalColor,portal);
  vec3 eclipseColor=mix(vec3(1.0,0.90,0.60),vec3(0.95,0.25,0.025),smoothstep(0.1,0.85,b));
  v_color=mix(v_color,eclipseColor,eclipse);
  float aether=totalWeight>0.0 ? u_weights[25]/totalWeight : max(0.0,1.0-abs(u_shape.x-25.0));
  vec3 aetherColor=mix(vec3(0.04,0.80,1.0),vec3(0.78,0.08,0.95),0.5+0.5*sin(floor(a*6.0)*1.7+b*2.0+t*0.08));
  if(c>=0.56 && c<0.77) aetherColor=mix(vec3(1.0,0.64,0.18),vec3(0.25,0.60,1.0),floor(a*3.0)/2.0);
  if(c>=0.77 && c<0.88) aetherColor=vec3(1.0,0.87,0.55);
  if(c>=0.88) aetherColor=mix(vec3(0.12,0.28,0.80),vec3(0.60,0.20,0.90),b);
  aetherColor=mix(vec3(0.15,0.70,1.0),aetherColor,clamp(variety/2.5,0.0,1.0));
  v_color=mix(v_color,aetherColor,aether);
  float liquid=totalWeight>0.0 ? u_weights[26]/totalWeight : max(0.0,1.0-abs(u_shape.x-26.0));
  float flame=totalWeight>0.0 ? u_weights[27]/totalWeight : max(0.0,1.0-abs(u_shape.x-27.0));
  float reflection=0.5+0.5*sin(angle*3.0+b*11.0+0.7*sin(b*8.0-t*0.35)+t*0.22);
  vec3 liquidColor=mix(vec3(0.025,0.10,0.18),vec3(0.48,0.82,0.95),smoothstep(0.25,0.85,reflection));
  liquidColor=mix(liquidColor,vec3(1.0,0.97,0.88),pow(reflection,16.0));
  v_color=mix(v_color,liquidColor,liquid);
  vec3 flameColor=mix(vec3(1.0,0.85,0.32),vec3(1.0,0.09,0.008),smoothstep(0.08,0.9,b));
  flameColor=mix(flameColor,vec3(0.15,0.28,1.0),(1.0-smoothstep(0.0,0.16,b))*(1.0-c));
  if(c>0.93) flameColor=vec3(1.0,0.38,0.045);
  v_color=mix(v_color,flameColor,flame);
  float silk=totalWeight>0.0 ? u_weights[28]/totalWeight : max(0.0,1.0-abs(u_shape.x-28.0));
  float silkStrand=floor(hash(id+5101.0)*220.0);
  float silkFamily=mod(silkStrand,4.0);
  vec3 silkColor=mix(vec3(0.12,0.45,1.0),vec3(0.50,0.85,1.0),hash(silkStrand+19.0));
  if(silkFamily>1.5) silkColor=mix(vec3(0.90,0.52,0.23),vec3(1.0,0.85,0.63),hash(silkStrand+19.0));
  if(c>0.993) silkColor=vec3(0.88,0.96,1.0);
  silkColor=mix(vec3(0.22,0.62,1.0),silkColor,clamp(variety,0.0,1.0));
  v_color=mix(v_color,silkColor,silk);
  float sand=totalWeight>0.0 ? u_weights[29]/totalWeight : max(0.0,1.0-abs(u_shape.x-29.0));
  vec2 sandGround=vec2(fract(a+u_motionTime*(0.055+hash(id+871.0)*0.055)/6.0)*6.0-3.0,(b-0.5)*5.0);
  float slope=(sandHeight(sandGround+vec2(0.025,0.0))-sandHeight(sandGround-vec2(0.025,0.0)))/0.05;
  float slopeZ=(sandHeight(sandGround+vec2(0.0,0.025))-sandHeight(sandGround-vec2(0.0,0.025)))/0.05;
  vec3 sandNormal=normalize(vec3(-slope,1.0,-slopeZ));
  float sun=pow(max(0.0,dot(sandNormal,normalize(vec3(-0.8,0.6,0.35)))),0.8);
  vec3 sandColor=mix(vec3(0.25,0.095,0.025),vec3(1.0,0.76,0.38),sun);
  sandColor*=0.75+hash(id+771.0)*0.5;
  v_color=mix(v_color,sandColor,sand);

  if(u_paletteCount>0) {
    float colorPosition=clamp(band,0.0,1.0)*min(float(u_paletteCount-1),variety);
    int colorIndex=int(floor(colorPosition));
    v_color=mix(u_palette[colorIndex],u_palette[min(colorIndex+1,u_paletteCount-1)],fract(colorPosition));
  }
  // Full hue rotation around the neutral axis; zero retains the authored palette.
  vec3 neutral=vec3(0.577350269);
  float hueAngle=u_hue*6.2831853;
  v_color=clamp(v_color*cos(hueAngle)+cross(neutral,v_color)*sin(hueAngle)+neutral*dot(neutral,v_color)*(1.0-cos(hueAngle)),0.0,1.0);
  float curtainLight=(0.35+0.65*exp(-pow((b-0.10)/0.22,2.0)))*(1.0-smoothstep(0.65,1.0,b));
  curtainLight*=0.55+0.45*pow(0.5+0.5*sin(floor(a*480.0)*2.39996),2.0);
  float holeVisibility=(c<0.78 && p.z>0.0) ? 1.0 : smoothstep(0.49,0.56,length(p.xy));
  float holeLight=c<0.78 ? (0.25+1.8*pow(1.0-b,2.0))*(0.65+0.35*sin(b*190.0+angle*2.0)) : (0.25+1.5*pow(1.0-b,2.0))*(p.y>0.0 ? 1.0 : 0.3);
  float aetherLight=c>=0.88 ? 0.20 : (c>=0.77 ? 0.55 : 0.75+0.25*sin(b*12.0+t*0.9));
  float flameLight=c>0.93 ? 0.45*sin(fract(b+u_motionTime*0.13)*3.14159265) : (0.45+0.55*pow(1.0-b,0.6));
  v_light=mix(1.0,c>0.993 ? 1.2 : 1.65,silk)*mix(1.0,flameLight,flame)*mix(1.0,1.35,liquid)*mix(1.0,aetherLight,aether)*planetVisibility*mix(1.0,1.8,earth+jupiter+saturn)*mix(1.0,holeVisibility*holeLight,hole)*mix(1.0,c>=0.82 ? 0.35 : (c<0.24 ? 1.8 : 0.6),solar)*mix(1.0,curtainLight,aurora)*opacity*(0.20+u_shape.w*0.7)*(0.65+c*0.45)*(0.65+0.35*sin(a*90.0+t+u_audio.z));
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_light;
in float v_edge;
in float v_spriteScale;
in float v_blur;
uniform bool u_ribbon;
uniform vec3 u_lens;
out vec4 color;
void main() {
  float r=u_ribbon ? abs(v_edge) : length(gl_PointCoord-0.5)*2.0;
  if(r>1.0) discard;
  float light=exp(-r*r*5.0)*v_light;
  if(!u_ribbon) {
    float coreScale=mix(v_spriteScale,1.3,v_blur);
    float coreRadius=r*coreScale;
    float core=exp(-coreRadius*coreRadius*5.0)/(1.0+v_blur*1.5);
    float halo=exp(-r*r*4.0)*u_lens.x*0.3;
    light=(core+halo)*v_light;
  }
  color=vec4(v_color*light,1.0);
}`;

const EMPTY_WEIGHTS = new Float32Array(PARTICLE_FORMATION_COUNT);
const UNIFORM_NAMES = [
  "turbulenceField",
  "customMix",
  "time",
  "aspect",
  "height",
  "shape",
  "dispersion",
  "weights[0]",
  "previousWeights[0]",
  "audio",
  "view",
  "hue",
  "palette[0]",
  "paletteCount",
  "colorVariety",
  "opacity",
  "thickness",
  "headSize",
  "trailWidth",
  "lens",
  "motionTime",
  "previousMotionTime",
  "ribbon",
  "previous",
  "previousShape",
  "previousAudio",
  "waves[0]",
  "waveCount",
  "cycle",
  "previousCycle",
  "attractors",
  "previousAttractors",
] as const;
/** Bounded per-context cache; programs still used by a renderer are never evicted. */
export const PARTICLE_PROGRAM_CACHE_SIZE = 48;
type ProgramEntry = {
  program: WebGLProgram;
  shaders: WebGLShader[];
  state: "pending" | "ready" | "failed";
  error?: Error;
  uniforms: Record<string, WebGLUniformLocation | null>;
  users: number;
  lastUsed: number;
};
/**
 * Compiled particle programs, shared by every renderer on one WebGL2 context.
 * A custom shape is compiled into the vertex shader together with the shape it
 * fades from, so entries are keyed by that (previous, next) pair. With
 * KHR_parallel_shader_compile, `prepare` compiles without blocking the page;
 * `acquire` finishes synchronously (the legacy blocking path) when needed.
 */
class ParticleProgramCache {
  private entries = new Map<string, ProgramEntry>();
  private parallel: { COMPLETION_STATUS_KHR: number } | null;
  private clock = 0;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.parallel = gl.getExtension("KHR_parallel_shader_compile");
  }
  static for(gl: WebGL2RenderingContext): ParticleProgramCache {
    let cache = caches.get(gl);
    if (!cache) {
      cache = new ParticleProgramCache(gl);
      caches.set(gl, cache);
      // Programs die with the context; a restored context starts a fresh cache.
      gl.canvas.addEventListener("webglcontextlost", () => caches.delete(gl), { once: true });
    }
    return cache;
  }
  static key(next: CustomGeometry, previous: CustomGeometry): string {
    return `mix(${geometryGLSL(previous)},${geometryGLSL(next)},u_customMix)`;
  }
  /**
   * Starts (or polls) a compile without blocking the page; true once usable.
   * Throws if it failed. Note: on ANGLE/Metal the GPU process still builds a
   * never-seen program for ~0.5 s and delays presentation meanwhile, so this
   * removes the JS freeze and repeat costs, not the first-build GPU stall.
   */
  prepare(key: string): boolean {
    const entry = this.entries.get(key) ?? this.start(key);
    entry.lastUsed = ++this.clock;
    if (
      entry.state === "pending" &&
      (!this.parallel ||
        this.gl.getProgramParameter(entry.program, this.parallel.COMPLETION_STATUS_KHR))
    )
      this.finish(entry);
    if (entry.state === "failed") throw entry.error;
    return entry.state === "ready";
  }
  /** Returns a usable program for a renderer, compiling synchronously if necessary. */
  acquire(key: string): ProgramEntry {
    const entry = this.entries.get(key) ?? this.start(key);
    entry.lastUsed = ++this.clock;
    if (entry.state === "pending") this.finish(entry);
    if (entry.state === "failed") {
      this.drop(key, entry);
      throw entry.error;
    }
    entry.users++;
    return entry;
  }
  release(entry: ProgramEntry): void {
    entry.users = Math.max(0, entry.users - 1);
    this.evict();
  }
  private start(key: string): ProgramEntry {
    const gl = this.gl;
    const program = gl.createProgram()!;
    const shaders: WebGLShader[] = [];
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex.replace("CUSTOM_GEOMETRY_EXPRESSION", key)],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    const entry: ProgramEntry = {
      program,
      shaders,
      state: "pending",
      uniforms: {},
      users: 0,
      lastUsed: ++this.clock,
    };
    this.entries.set(key, entry);
    this.evict();
    return entry;
  }
  private finish(entry: ProgramEntry): void {
    const gl = this.gl;
    if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS)) {
      const failed = entry.shaders.find(
        (shader) => !gl.getShaderParameter(shader, gl.COMPILE_STATUS),
      );
      entry.state = "failed";
      entry.error = new Error(
        (failed ? gl.getShaderInfoLog(failed) : gl.getProgramInfoLog(entry.program)) ||
          (failed ? "Shader compilation failed" : "Shader link failed"),
      );
    } else {
      entry.state = "ready";
      for (const name of UNIFORM_NAMES)
        entry.uniforms[name] = gl.getUniformLocation(entry.program, `u_${name}`);
    }
    for (const shader of entry.shaders) gl.deleteShader(shader);
    entry.shaders = [];
  }
  private drop(key: string, entry: ProgramEntry): void {
    for (const shader of entry.shaders) this.gl.deleteShader(shader);
    this.gl.deleteProgram(entry.program);
    this.entries.delete(key);
  }
  private evict(): void {
    if (this.entries.size <= PARTICLE_PROGRAM_CACHE_SIZE) return;
    const idle = [...this.entries]
      .filter(([, entry]) => entry.users === 0)
      .sort((x, y) => x[1].lastUsed - y[1].lastUsed);
    for (const [key, entry] of idle.slice(0, this.entries.size - PARTICLE_PROGRAM_CACHE_SIZE))
      this.drop(key, entry);
  }
}
const caches = new WeakMap<WebGL2RenderingContext, ParticleProgramCache>();

export class ParticleRenderer {
  private gl: WebGL2RenderingContext;
  private programs: ParticleProgramCache;
  private entry: ProgramEntry;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  count = 45_000;
  /**
   * At most this many particles draw ribbons (default: all, as in the Designer).
   * Ribbons repeat the full position math for up to six trail copies, so on
   * dense looks they dominate GPU time; a hashed id gives an even subset.
   */
  ribbonLimit = Number.POSITIVE_INFINITY;
  /**
   * Quality levers for hosts that adapt to the device (the embed kit): the share of
   * particles drawn (0..1] and of the ribbon budget (0 = no ribbons). 1 = as authored.
   */
  countScale = 1;
  ribbonScale = 1;
  gpuMs: number | null = null;
  private timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pendingQuery: WebGLQuery | null = null;
  /** Bounded control snapshots, not pixels or per-particle CPU positions. */
  private history: { timeMs: number; drive: ParticleDrive }[] = [];
  private lastTime = -Infinity;
  private waves: { timeMs: number; strength: number }[] = [];
  private waveData = new Float32Array(32);
  private waveArmed = true;
  private paletteData = new Float32Array(18);
  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly maxParticles = 100_000,
    customGeometry: CustomGeometry = DEFAULT_GEOMETRY,
    previousGeometry: CustomGeometry = customGeometry,
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is unavailable. Open this study in a WebGL2-capable browser.");
    this.gl = gl;
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.programs = ParticleProgramCache.for(gl);
    this.entry = this.programs.acquire(ParticleProgramCache.key(customGeometry, previousGeometry));
    this.program = this.entry.program;
    this.uniforms = this.entry.uniforms;
    this.vao = gl.createVertexArray()!;
  }
  /**
   * Compiles the program for a custom shape (faded in from `previous`) in the
   * background. Returns true once `setGeometry` would switch without a stall;
   * throws if the shape does not compile. Safe to call every frame.
   */
  prepareGeometry(next: CustomGeometry, previous: CustomGeometry = next): boolean {
    return this.programs.prepare(ParticleProgramCache.key(next, previous));
  }
  /** Switches the custom shape in place (trails and timing survive). Blocks
   *  only if the program was not prepared; a failure keeps the current shape. */
  setGeometry(next: CustomGeometry, previous: CustomGeometry = next): void {
    const entry = this.programs.acquire(ParticleProgramCache.key(next, previous));
    this.programs.release(this.entry);
    this.entry = entry;
    this.program = entry.program;
    this.uniforms = entry.uniforms;
  }
  render(
    timeMs: number,
    drive: ParticleDrive,
    tile?: { x: number; y: number; width: number; height: number; count: number },
  ): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const authored = particleCount(drive.density, this.maxParticles);
    this.count =
      this.countScale >= 1
        ? authored
        : Math.max(Math.min(authored, MIN_SCALED_COUNT), Math.round(authored * this.countScale));
    if (tile) this.count = Math.max(1, Math.min(this.maxParticles, Math.round(tile.count)));
    if (this.timer && this.pendingQuery) {
      if (gl.getParameter(this.timer.GPU_DISJOINT_EXT)) {
        gl.deleteQuery(this.pendingQuery);
        this.pendingQuery = null;
        this.gpuMs = null;
      } else if (gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT_AVAILABLE)) {
        this.gpuMs = Number(gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT)) / 1e6;
        gl.deleteQuery(this.pendingQuery);
        this.pendingQuery = null;
      }
    }
    const query = this.timer && !this.pendingQuery ? gl.createQuery() : null;
    if (query && this.timer) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
    const trail =
      this.ribbonScale > 0 && Number.isFinite(drive.trail)
        ? Math.max(0, Math.min(1, drive.trail))
        : 0;
    if (timeMs < this.lastTime || timeMs - this.lastTime > 500) {
      this.waves.length = 0;
      this.waveArmed = true;
    }
    if (drive.ripple < 0.12) this.waveArmed = true;
    if (drive.shock <= 0) this.waves.length = 0;
    if (drive.shock > 0 && drive.ripple > 0.3 && this.waveArmed) {
      this.waveArmed = false;
      if (this.waves.length === 16) this.waves.shift();
      this.waves.push({ timeMs, strength: Math.max(0, Math.min(1, drive.shock)) });
    }
    this.waves = this.waves.filter((wave) => timeMs - wave.timeMs < 5000);
    if (timeMs < this.lastTime || timeMs - this.lastTime > 500 || trail === 0)
      this.history.length = 0;
    this.lastTime = timeMs;
    const newest = this.history[this.history.length - 1];
    if (trail > 0 && (!newest || timeMs - newest.timeMs >= 30)) {
      if (this.history.length === 600) this.history.shift();
      this.history.push({ timeMs, drive: { ...drive } });
    }
    const x = tile?.x ?? 0,
      y = tile?.y ?? 0;
    const width = tile?.width ?? this.canvas.width,
      height = tile?.height ?? this.canvas.height;
    gl.viewport(x, y, width, height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(this.uniforms.aspect, width / height);
    gl.uniform1f(this.uniforms.height, height);
    gl.uniform1f(
      this.uniforms.thickness,
      0.35 +
        Math.max(0, Math.min(1, Number.isFinite(drive.thickness) ? drive.thickness : 0.25)) * 2.65,
    );
    this.waveData.fill(0);
    this.waves.forEach((wave, i) => {
      this.waveData[i * 2] = wave.timeMs / 1000;
      this.waveData[i * 2 + 1] = wave.strength;
    });
    gl.uniform2fv(this.uniforms["waves[0]"], this.waveData);
    gl.uniform1i(this.uniforms.waveCount, this.waves.length);
    // Current camera projects all samples: these are trails in 3D, not screen smears.
    gl.uniform4f(this.uniforms.view, drive.yaw, drive.pitch, drive.distance, drive.roll);
    const duration =
      Math.max(0, Math.min(8, Number.isFinite(drive.ribbonLength) ? drive.ribbonLength : 0.75)) *
      2160;
    // Draw continuously sliding ages instead of discrete snapshots appearing
    // at full brightness every capture interval. Only six GPU echoes remain.
    const first = this.history[0];
    let previous: { timeMs: number; drive: ParticleDrive; opacity: number } | undefined;
    if (trail > 0 && duration > 0 && first) {
      for (let i = 6; i >= 1; i--) {
        const age = (duration * i) / 7;
        const target = timeMs - age;
        if (target <= first.timeMs) continue;
        let before = first;
        let after = { timeMs, drive };
        for (const sample of this.history) {
          if (sample.timeMs > target) {
            after = sample;
            break;
          }
          before = sample;
        }
        const fraction = Math.min(
          1,
          Math.max(0, (target - before.timeMs) / Math.max(0.001, after.timeMs - before.timeMs)),
        );
        const interpolated = { ...before.drive };
        for (const key of Object.keys(interpolated) as (keyof ParticleDrive)[]) {
          if (key === "formationWeights") {
            const start = before.drive.formationWeights;
            const end = after.drive.formationWeights;
            if (start && end)
              interpolated.formationWeights = start.map((v, i) => v + (end[i] - v) * fraction);
          } else if (key === "turbulenceScale" || key === "turbulenceDensity") {
            interpolated[key] =
              (before.drive[key] ?? 1) +
              ((after.drive[key] ?? 1) - (before.drive[key] ?? 1)) * fraction;
          } else if (key === "customMix") {
            interpolated.customMix = drive.customMix ?? 1;
          } else if (key === "palette") {
            interpolated.palette = after.drive.palette;
          } else if (key === "yaw" || key === "pitch" || key === "roll") {
            // Camera values wrap at ±π; ribbons must not sweep a full turn there.
            interpolated[key] +=
              cyclicDelta(before.drive[key], after.drive[key], Math.PI * 2) * fraction;
          } else if (key === "trailWidth") {
            interpolated.trailWidth =
              (before.drive.trailWidth ?? 1) +
              ((after.drive.trailWidth ?? 1) - (before.drive.trailWidth ?? 1)) * fraction;
          } else if (key === "headSize") {
            interpolated.headSize =
              (before.drive.headSize ?? 1) +
              ((after.drive.headSize ?? 1) - (before.drive.headSize ?? 1)) * fraction;
          } else if (key === "colorVariety") {
            interpolated.colorVariety =
              (before.drive.colorVariety ?? 1) +
              ((after.drive.colorVariety ?? 1) - (before.drive.colorVariety ?? 1)) * fraction;
          } else if (key === "dispersion") {
            interpolated.dispersion =
              (before.drive.dispersion ?? 0) +
              ((after.drive.dispersion ?? 0) - (before.drive.dispersion ?? 0)) * fraction;
          } else interpolated[key] += (after.drive[key] - before.drive[key]) * fraction;
        }
        // Reconstruct past motion in today's formation and settings. Long trails
        // must not connect a newly selected shape to a previous preset's geometry.
        if (drive.formationWeights) {
          const motionTime = interpolated.motionTime;
          const attractorAngle = interpolated.attractorAngle;
          Object.assign(interpolated, drive, { motionTime, attractorAngle });
        }
        const warmup = Math.min(1, (target - first.timeMs) / 120);
        const opacity = 0.8 * trail * (1 - age / duration) * warmup;
        if (previous) this.draw(target, interpolated, opacity, previous);
        previous = { timeMs: target, drive: interpolated, opacity };
      }
    }
    if (previous) this.draw(timeMs, drive, trail * 0.8, previous);
    this.draw(timeMs, drive, 1);
    gl.disable(gl.SCISSOR_TEST);
    if (query && this.timer) {
      gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      this.pendingQuery = query;
    }
  }
  /** Particles that draw ribbons: the ribbon scale of the count, capped by ribbonLimit. */
  private get ribbonBudget(): number {
    return Math.min(this.count * Math.min(1, this.ribbonScale), this.ribbonLimit);
  }
  private draw(
    timeMs: number,
    drive: ParticleDrive,
    opacity: number,
    previous?: { timeMs: number; drive: ParticleDrive; opacity: number },
  ): void {
    const gl = this.gl;
    gl.uniform2f(
      this.uniforms.dispersion,
      Math.max(0, Math.min(1, drive.dispersion ?? 0)),
      Math.max(0, Math.min(1, previous?.drive.dispersion ?? 0)),
    );
    gl.uniform1fv(this.uniforms["weights[0]"], drive.formationWeights ?? EMPTY_WEIGHTS);
    gl.uniform1fv(
      this.uniforms["previousWeights[0]"],
      previous?.drive.formationWeights ?? EMPTY_WEIGHTS,
    );
    gl.uniform4f(
      this.uniforms.turbulenceField,
      drive.turbulenceScale ?? 1,
      drive.turbulenceDensity ?? 1,
      previous?.drive.turbulenceScale ?? 1,
      previous?.drive.turbulenceDensity ?? 1,
    );
    gl.uniform1f(this.uniforms.customMix, drive.customMix ?? 1);
    gl.uniform1f(this.uniforms.time, timeMs / 1000);
    gl.uniform1f(this.uniforms.motionTime, drive.motionTime / 1000);
    gl.uniform4f(this.uniforms.shape, drive.formation, drive.spread, drive.turbulence, drive.glow);
    gl.uniform4f(this.uniforms.audio, drive.low, drive.mid, drive.high, drive.ripple);
    this.paletteData.fill(0);
    const paletteCount = Math.min(6, Math.floor((drive.palette?.length ?? 0) / 3));
    for (let i = 0; i < paletteCount * 3; i++)
      this.paletteData[i] = Math.max(0, Math.min(1, drive.palette![i]));
    gl.uniform3fv(this.uniforms["palette[0]"], this.paletteData);
    gl.uniform1i(this.uniforms.paletteCount, paletteCount);
    gl.uniform1f(this.uniforms.hue, drive.hue);
    gl.uniform1f(this.uniforms.colorVariety, Math.max(0, Math.min(5, drive.colorVariety ?? 1)));
    // Thinned ribbons (ribbonLimit) keep part of the trail light: √(all / drawn).
    const thinned = previous ? this.count / Math.max(1, this.ribbonBudget) : 1;
    gl.uniform1f(this.uniforms.opacity, opacity * Math.sqrt(Math.max(1, thinned)));
    gl.uniform1f(
      this.uniforms.trailWidth,
      Math.max(0.25, Math.min(16, Number.isFinite(drive.trailWidth) ? drive.trailWidth! : 1)),
    );
    gl.uniform1f(
      this.uniforms.headSize,
      Math.max(1, Math.min(4, Number.isFinite(drive.headSize) ? drive.headSize! : 1)),
    );
    gl.uniform3f(this.uniforms.lens, drive.halo, drive.softness, drive.focus);
    gl.uniform2f(this.uniforms.cycle, drive.collapse, drive.explosion);
    gl.uniform3f(
      this.uniforms.attractors,
      drive.attraction,
      drive.separation * 2,
      drive.attractorAngle,
    );
    gl.uniform1i(this.uniforms.ribbon, previous ? 1 : 0);
    if (previous) {
      const d = previous.drive;
      gl.uniform1f(this.uniforms.previousMotionTime, d.motionTime / 1000);
      gl.uniform2f(this.uniforms.previousCycle, d.collapse, d.explosion);
      gl.uniform3f(
        this.uniforms.previousAttractors,
        d.attraction,
        d.separation * 2,
        d.attractorAngle,
      );
      gl.uniform2f(this.uniforms.previous, previous.timeMs / 1000, previous.opacity);
      gl.uniform4f(this.uniforms.previousShape, d.formation, d.spread, d.turbulence, d.glow);
      gl.uniform4f(this.uniforms.previousAudio, d.low, d.mid, d.high, d.ripple);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.floor(this.ribbonBudget / 8));
    } else gl.drawArrays(gl.POINTS, 0, this.count);
  }
  /** Drops trails and shockwaves (a new look), keeping the GL program and context. */
  clearTrails(): void {
    this.history.length = 0;
    this.waves.length = 0;
    this.waveArmed = true;
    this.lastTime = -Infinity;
  }
  dispose(): void {
    if (this.pendingQuery) this.gl.deleteQuery(this.pendingQuery);
    this.pendingQuery = null;
    this.history.length = 0;
    this.waves.length = 0;
    this.gl.deleteVertexArray(this.vao);
    this.programs.release(this.entry);
  }
}
