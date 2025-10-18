declare module "three" {
  export = THREE;
  export as namespace THREE;
  namespace THREE {
    const SRGBColorSpace: any;
    const NoToneMapping: any;
    const DynamicDrawUsage: any;
    const NearestFilter: any;
    const NormalBlending: any;
    const AdditiveBlending: any;
    class WebGLRenderer {
      constructor(params?: any);
      domElement: HTMLCanvasElement;
      outputColorSpace: any;
      toneMapping: any;
      toneMappingExposure: number;
      setPixelRatio(value: number): void;
      setSize(width: number, height: number): void;
      render(scene: any, camera: any): void;
      dispose(): void;
    }
    class Scene {
      background: any;
      add(obj: any): void;
      remove(obj: any): void;
    }
    class PerspectiveCamera {
      constructor(fov: number, aspect: number, near: number, far: number);
      position: { set(x: number, y: number, z: number): void };
      aspect: number;
      near: number;
      far: number;
      updateProjectionMatrix(): void;
      lookAt(x: number, y: number, z: number): void;
    }
    class Group {
      add(obj: any): void;
      remove(obj: any): void;
      traverse(cb: (obj: any) => void): void;
      children: any[];
      rotation: { x: number; y: number; z: number };
      userData: any;
    }
    class AmbientLight {
      constructor(color?: any, intensity?: number);
      position: { set(x: number, y: number, z: number): void };
    }
    class DirectionalLight {
      constructor(color?: any, intensity?: number);
      position: { set(x: number, y: number, z: number): void };
    }
    class Color {
      constructor(color?: any);
      setRGB(r: number, g: number, b: number): Color;
      convertSRGBToLinear(): Color;
    }
    class BoxGeometry {
      constructor(width?: number, height?: number, depth?: number);
    }
    class SphereGeometry {
      constructor(radius?: number, widthSegments?: number, heightSegments?: number);
    }
    class PlaneGeometry {
      constructor(width: number, height: number);
    }
    class TorusGeometry {
      constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number);
    }
    class MeshBasicMaterial {
      constructor(params?: any);
    }
    class MeshStandardMaterial {
      constructor(params?: any);
    }
    class ShaderMaterial {
      constructor(params?: any);
      uniforms: any;
    }
    class Mesh {
      constructor(geometry: any, material?: any);
      rotation: { x: number; y: number; z: number };
      position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
    }
    class InstancedMesh {
      constructor(geometry: any, material: any, count: number);
      instanceMatrix: { setUsage(usage: any): void; needsUpdate?: boolean };
      instanceColor?: { needsUpdate: boolean };
      setMatrixAt(index: number, matrix: any): void;
      setColorAt(index: number, color: any): void;
    }
    class Object3D {
      position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
      scale: { set(x: number, y: number, z: number): void };
      rotation: { x: number; y: number; z: number };
      matrix: any;
      updateMatrix(): void;
    }
    class CanvasTexture {
      constructor(canvas: HTMLCanvasElement);
      colorSpace: any;
      minFilter: any;
      magFilter: any;
    }
    class BufferGeometry {
      setAttribute(name: string, attribute: any): void;
      dispose(): void;
    }
    class BufferAttribute {
      constructor(array: ArrayLike<number>, itemSize: number);
      needsUpdate?: boolean;
    }
    class Points {
      constructor(geometry: any, material: any);
    }
    class Clock {
      constructor();
      getDelta(): number;
    }
    class Material {
      dispose?: () => void;
    }
    namespace MathUtils {
      function degToRad(deg: number): number;
    }
  }
}
