import { Canvas, useLoader, useFrame } from "@react-three/fiber";
import { useRef, useEffect, useMemo } from "react";
import {
  OrbitControls,
  Environment,
  Sky,
  KeyboardControls,
  Stars,
  Cloud,
  Outlines,
  Edges,
  Grid,
  CameraControlsImpl,
  DragControls,
  ContactShadows,
  Plane,
  Float,
} from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import {
  EffectComposer,
  Noise,
  Bloom,
  GodRays,
  Vignette,
} from "@react-three/postprocessing";

function Model({ url, position = [0, 0, 0], metallic = false }) {
  const gltf = useLoader(GLTFLoader, url);
  const goldMat = useMemo(() => {
    if (!metallic) return null;
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#464646"),
      metalness: 1,
      roughness: 0.28,
      clearcoat: 0.05,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1.4,
    });
  }, [metallic]);

  // 로드된 씬을 순회하며 메시에 금속(골드) 재질을 적용
  useEffect(() => {
    if (!gltf?.scene) return;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (metallic && goldMat) {
          obj.material = goldMat;
          obj.material.needsUpdate = true;
        }
      }
    });
  }, [gltf, metallic, goldMat]);
  return <primitive object={gltf.scene} position={position} />;
}

const asset = (p) => `${import.meta.env.BASE_URL}${p}`;

function Chair({ center = [0, 0, 0], speed = 1 }) {
  const groupRef = useRef();
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * speed;
    }
  });
  return (
    <group ref={groupRef} position={center}>
      <Model url={asset("Stage_LeftChair.glb")} position={[0, 0, 0]} metallic />
      <Model url={asset("Stage_CenterChair.glb")} position={[0, 0, 0]} metallic />
      <Model url={asset("Stage_RightChair.glb")} position={[0, 0, 0]} metallic />
      <Model url={asset("Stage_Spin.glb")} position={[0, 0, 0]} metallic />
    </group>
  );
}

export default Chair;
