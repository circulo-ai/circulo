"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

/** simple in-view hook */
function useInView(ref: React.RefObject<HTMLElement | null>, rootMargin = "0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => e.isIntersecting && setInView(true),
      { rootMargin },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [rootMargin]);
  return inView;
}

/** A single object instance */
function ProductModel({
  model,
  colorHex = "#cccccc",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: {
  model: THREE.Group;
  colorHex?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  // 1) Deep-clone the object graph (children), but materials are still shared…
  const clone = useMemo(() => model.clone(true), [model]);

  // 2) …so reassign *unique* material instances per mesh and set color
  useMemo(() => {
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const orig = mesh.material;

        // Clone or create fresh materials per mesh
        if (Array.isArray(orig)) {
          mesh.material = orig.map((m) => {
            const cloned = (m as THREE.Material).clone() as any;
            // Normalize to PBR if needed while preserving base map
            const std = cloned.isMeshStandardMaterial
              ? cloned
              : new THREE.MeshStandardMaterial({
                  map: cloned.map ?? null,
                  roughness: 0.6,
                  metalness: 0.1,
                });
            std.color.set(colorHex);
            return std;
          });
        } else if (orig) {
          const cloned = (orig as THREE.Material).clone() as any;
          const std = cloned.isMeshStandardMaterial
            ? cloned
            : new THREE.MeshStandardMaterial({
                map: cloned.map ?? null,
                roughness: 0.6,
                metalness: 0.1,
              });
          std.color.set(colorHex);
          mesh.material = std;
        } else {
          // No material: make one
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            roughness: 0.6,
            metalness: 0.1,
          });
        }

        // If you want pure solid color (ignore any textures), uncomment:
        // if (Array.isArray(mesh.material)) mesh.material.forEach((m: any) => (m.map = null));
        // else (mesh.material as THREE.MeshStandardMaterial).map = null;
      }
    });
  }, [clone, colorHex]);

  return (
    <primitive
      object={clone}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

/** The loader & scene */
function ModelsGroup() {
  const obj = useLoader(OBJLoader, "/three-d/character/model.obj");

  return (
    <>
      {/* Example: three duplicates with different positions and colors */}
      <ProductModel
        model={obj}
        colorHex="#ff6a00"
        position={[-3, -5, 0]}
        rotation={[0, (90 * Math.PI) / 180, 0]}
        scale={3}
      />
      {/* <ProductModel model={obj} colorHex="#00b894" position={[0, 0, 0]} /> */}
      <ProductModel
        model={obj}
        colorHex="#4f46e5"
        position={[3, -5, 0]}
        rotation={[0, (-90 * Math.PI) / 180, 0]}
        scale={3}
      />
    </>
  );
}

export function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const show = useInView(containerRef, "200px");
  const dpr = useMemo(
    () =>
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
    [],
  );

  return (
    <div ref={containerRef} className="size-full">
      {show && (
        <Canvas
          dpr={dpr}
          shadows
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ position: new THREE.Vector3(0, -5, 5), fov: 50 }}
        >
          {/* <ambientLight intensity={0.} /> */}
          <directionalLight position={[0, -4, 0]} intensity={0.3} castShadow />
          <directionalLight position={[0, 4, 0]} intensity={1.2} castShadow />
          <Suspense fallback={null}>
            <ModelsGroup />
          </Suspense>
          {/* <OrbitControls enableDamping /> */}
        </Canvas>
      )}
    </div>
  );
}
