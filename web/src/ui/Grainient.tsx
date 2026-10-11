/*
 * Fundo em gradiente granulado, renderizado em WebGL.
 * Adaptado do componente "Grainient" do React Bits (reactbits.dev), de David
 * Haz, com três ajustes para servir de fundo permanente de um app com vidro:
 * resolução limitada, 30 quadros por segundo e quadro estático quando o
 * sistema pede menos movimento.
 */
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { memo, useEffect, useRef } from 'react'

interface GrainientProps {
  color1: string
  color2: string
  color3: string
  timeSpeed?: number
  colorBalance?: number
  warpStrength?: number
  warpFrequency?: number
  warpSpeed?: number
  warpAmplitude?: number
  blendAngle?: number
  blendSoftness?: number
  rotationAmount?: number
  noiseScale?: number
  grainAmount?: number
  grainScale?: number
  contrast?: number
  saturation?: number
  zoom?: number
  /** Congela o movimento (prefers-reduced-motion). */
  paused?: boolean
}

const hexToRgb = (hex: string): [number, number, number] => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return [1, 1, 1]
  return [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255]
}

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uContrast;
uniform float uSaturation;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void main(){
  vec2 C=gl_FragCoord.xy;
  float t=iTime*uTimeSpeed;
  vec2 uv=C/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5;
  tuv/=max(uZoom,0.001);

  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;

  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);

  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s;
  float edge1=0.2-b+s;
  float v0=0.5-b+s;
  float v1=-0.3-b-s;
  vec3 layer1=mix(uColor3,uColor2,S(edge0,edge1,blendX));
  vec3 layer2=mix(uColor2,uColor1,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));

  vec2 grainUv=uv*max(uGrainScale,0.001);
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;

  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  fragColor=vec4(clamp(col,0.0,1.0),1.0);
}
`

const FRAME_INTERVAL_MS = 1000 / 30

function GrainientBase({
  color1,
  color2,
  color3,
  timeSpeed = 0.25,
  colorBalance = 0,
  warpStrength = 1,
  warpFrequency = 5,
  warpSpeed = 2,
  warpAmplitude = 50,
  blendAngle = 0,
  blendSoftness = 0.05,
  rotationAmount = 500,
  noiseScale = 2,
  grainAmount = 0.1,
  grainScale = 2,
  contrast = 1.5,
  saturation = 1,
  zoom = 0.9,
  paused = false,
}: GrainientProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const uniforms = {
    uTimeSpeed: timeSpeed,
    uColorBalance: colorBalance,
    uWarpStrength: warpStrength,
    uWarpFrequency: warpFrequency,
    uWarpSpeed: warpSpeed,
    uWarpAmplitude: warpAmplitude,
    uBlendAngle: blendAngle,
    uBlendSoftness: blendSoftness,
    uRotationAmount: rotationAmount,
    uNoiseScale: noiseScale,
    uGrainAmount: grainAmount,
    uGrainScale: grainScale,
    uContrast: contrast,
    uSaturation: saturation,
    uZoom: zoom,
  }
  const signature = JSON.stringify([uniforms, color1, color2, color3, paused])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: Renderer
    try {
      // O gradiente é suave: renderizar em resolução nativa só custaria GPU.
      renderer = new Renderer({ webgl: 2, alpha: false, antialias: false, dpr: 1 })
    } catch {
      return // Sem WebGL, fica a cor de fundo do documento.
    }
    const gl = renderer.gl
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    container.appendChild(canvas)

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uColor1: { value: new Float32Array(hexToRgb(color1)) },
        uColor2: { value: new Float32Array(hexToRgb(color2)) },
        uColor3: { value: new Float32Array(hexToRgb(color3)) },
        ...Object.fromEntries(Object.entries(uniforms).map(([key, value]) => [key, { value }])),
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight))
      const resolution = program.uniforms.iResolution!.value as Float32Array
      resolution[0] = gl.drawingBufferWidth
      resolution[1] = gl.drawingBufferHeight
      renderer.render({ scene: mesh })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frame = 0
    let last = 0
    const start = performance.now()
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (now - last < FRAME_INTERVAL_MS) return
      last = now
      program.uniforms.iTime!.value = (now - start) * 0.001
      renderer.render({ scene: mesh })
    }
    const play = () => {
      if (!paused && !document.hidden && frame === 0) frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const onVisibility = () => (document.hidden ? stop() : play())
    document.addEventListener('visibilitychange', onVisibility)
    play()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    // `signature` resume todas as props: mudar qualquer uma recria o programa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return <div ref={containerRef} className="h-full w-full" aria-hidden />
}

export const Grainient = memo(GrainientBase)
