import { Canvas, useLoader, useThree } from "@react-three/fiber";
import styled from "styled-components";
import { useRef, useEffect, useState, useMemo } from "react";
import gsap from "gsap";
import {
  OrbitControls,
  Environment,
  Text,
  MeshReflectorMaterial,
  ContactShadows,
} from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  Outline,
  Selection,
  Select,
  Vignette,
} from "@react-three/postprocessing";
import Chair from "./Chair.jsx";
import { moveCamera } from "./cameraUtils";

// 카메라 컨트롤러: ref 연결 및 최초 애니메이션
function CameraController({ cameraRef, target = [0, 0, 12] }) {
  const { camera } = useThree();
  const initialTargetRef = useRef(target);
  useEffect(() => {
    if (cameraRef) cameraRef.current = camera;
  }, [camera, cameraRef]);
  // 초기 1회 애니메이션만 수행 (target 변경과 무관)
  useEffect(() => {
    if (!cameraRef?.current) return;
    const start = { x: 0, y: 10, z: -80 };
    const end = { x: 0, y: 2, z: -10 };
    cameraRef.current.position.set(start.x, start.y, start.z);
    cameraRef.current.lookAt(...initialTargetRef.current);
    gsap.to(cameraRef.current.position, {
      x: end.x,
      y: end.y,
      z: end.z,
      duration: 2,
      ease: "power2.out",
      onUpdate: () => {
        cameraRef.current.lookAt(...initialTargetRef.current);
      },
    });
  }, [cameraRef]);
  return null;
}

// hover 시 그룹 전체 외곽선 표시 (단일 항목만 활성)
function Hoverable({ id, activeId, setActiveId, onClick, children }) {
  const enabled = activeId === id;
  return (
    <Select enabled={enabled}>
      <group
        onPointerEnter={() => {
          if (activeId !== id) setActiveId(id);
        }}
        onPointerLeave={() => {
          if (activeId === id) setActiveId(null);
        }}
        onClick={onClick}
      >
        {children}
      </group>
    </Select>
  );
}

// three RectAreaLight 셰이더 유니폼 초기화는 RectAreaLightUniformsLib.init()로 처리

// activeId에 따라 텍스트를 부드럽게 전환(페이드/스케일)
function AnimatedLabel({ activeId }) {
  const textRef = useRef();
  const [displayLabel, setDisplayLabel] = useState("FOR:EST");

  useEffect(() => {
    const nextLabel =
      activeId === "chair"
        ? "1"
        : activeId === "shell"
        ? "2"
        : activeId === "wheel"
        ? "3"
        : "For:est";

    if (!textRef.current) return;
    const mat = textRef.current.material;
    if (!mat) return;
    mat.transparent = true;

    // 레이블이 동일하면 불필요한 상태 변경/트윈 스킵
    if (nextLabel === textRef.current.userData?.currentLabel) return;
    textRef.current.userData.currentLabel = nextLabel;

    // 기존 트윈 중단 후 전환
    gsap.killTweensOf(mat);
    gsap.killTweensOf(textRef.current.scale);

    const tl = gsap.timeline();
    tl.to(mat, { opacity: 0, duration: 0.15, ease: "power2.in" })
      .add(() => setDisplayLabel(nextLabel))
      .to(mat, { opacity: 1, duration: 0.2, ease: "power2.out" }, ">-0.02")
      .fromTo(
        textRef.current.scale,
        { x: 0.9, y: 0.9, z: 0.9 },
        { x: 1, y: 1, z: 1, duration: 0.25, ease: "back.out(2)" },
        "<"
      );

    return () => tl.kill();
  }, [activeId]);

  return (
    <Text
      ref={textRef}
      position={[0, 2, 4]}
      anchorX="center"
      anchorY="middle"
      fontSize={4}
      color="#222222"
      toneMapped={false}
      renderOrder={1000}
      depthTest={false}
      rotation={[0, Math.PI, 0]}
      material-transparent
      material-opacity={1}
    >
      {displayLabel}
    </Text>
  );
}

const CanvasWrap = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

function Model({ url, position = [0, 0, 0] }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} position={position} />;
}

// 차체(금속 광택 카페인트) 전용 재질 적용 컴포넌트
function CarBody({ url, position = [0, 0, 0] }) {
  const gltf = useLoader(GLTFLoader, url);
  const carPaint = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#f7d3b2"), // 따뜻한 오렌지/브론즈 톤
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.2,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      sheen: 0,
      reflectivity: 1,
      toneMapped: true,
    });
    return m;
  }, []);

  useEffect(() => {
    if (!gltf?.scene) return;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material = carPaint;
      }
    });
  }, [gltf, carPaint]);

  return <primitive object={gltf.scene} position={position} />;
}

function App() {
  const cameraRef = useRef();
  const controlsRef = useRef();
  const [activeId, setActiveId] = useState(null);
  // 하나의 lookAt 타겟을 공유(참조 고정)하여 리렌더로 인한 카메라 애니메이션 재시작을 방지
  const lookAtTarget = useMemo(() => [0, 0, 40], []);

  // RectAreaLight 셰이더 유니폼 1회 초기화 (three examples 유틸)
  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  // 카메라 포커스 헬퍼: 목적지/포커스와 함께 부드럽게 이동
  const focusCamera = (to, lookAt, duration = 1.5) => {
    if (!cameraRef.current) return;
    moveCamera(cameraRef, to, lookAt, duration);
    if (controlsRef.current) {
      controlsRef.current.target.set(lookAt[0], lookAt[1], lookAt[2]);
      controlsRef.current.update();
      // 애니메이션 완료 시점에 한 번 더 동기화
      gsap.delayedCall(duration, () => {
        if (controlsRef.current) {
          controlsRef.current.target.set(lookAt[0], lookAt[1], lookAt[2]);
          controlsRef.current.update();
        }
      });
    }
  };

  // shell 전용 카메라 포커스 위치 (필요시 조정)
  const SHELL_TO = useMemo(() => [0, 3.5, -8], []);
  const SHELL_LOOK = useMemo(() => [0, 1.5, 6], []);
  return (
    <CanvasWrap>
      <Canvas shadows camera={{ fov: 50, position: [0, 2, -6] }}>
        {/* 씬 배경을 검은색으로 설정 */}
        <color attach="background" args={["#000000"]} />
        {/* 약한 포그로 원근감 및 분위기 추가 */}
        <fog attach="fog" args={["#000", 12, 60]} />
        <CameraController cameraRef={cameraRef} target={lookAtTarget} />
        <Selection>
          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            mouseButtons={{ LEFT: 0, MIDDLE: 2, RIGHT: 2 }}
            // target은 ref로 직접 업데이트
          />
          {/* 전체적으로 부드럽게 밝혀주는 보조 광원들 */}
          <hemisphereLight
            color="#888888"
            groundColor="#111111"
            intensity={4}
          />
          <ambientLight intensity={0.5} />
          {/* 상단 스포트라이트로 바닥 하이라이트 */}
          <spotLight
            position={[0, 6, 4]}
            angle={0.35}
            penumbra={0.6}
            intensity={10}
            castShadow
          />
          <rectAreaLight
            position={[0, 2, 4]}
            width={10}
            height={2}
            intensity={5}
            color="#d46666"
          />

          {/* 각각 독립 Hoverable로 감싸되 activeId로 단일 선택 유지 */}
          <Hoverable
            id="chair"
            activeId={activeId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              focusCamera([4, 2, -4], [0, 0, 0], 1.4);
            }}
          >
            <Chair center={[0, 0, 0]} speed={0.2} />
          </Hoverable>

          <Hoverable
            id="shell"
            activeId={activeId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              focusCamera([0, 6, 0], [0, 0, 0], 1.4);
            }}
          >
            <CarBody url="/Stage_Shell.glb" position={[0, 0, 0]} />
          </Hoverable>

          <Hoverable
            id="wheel"
            activeId={activeId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              focusCamera([-3, 0, -3], [0, 0, 0], 1.4);
            }}
          >
            <Model url="/Stage_Wheel.glb" position={[0, 0, 0]} />
          </Hoverable>

          {/* <Model url="/Stage_Studio.glb" position={[0, -2, 8]} /> */}
          <Model url="/Stage_Background.glb" position={[0, 0, 0]} />

          {/* Hover 대상에 따라 1/2/3 또는 기본 FOR:EST를 부드럽게 전환 */}
          <AnimatedLabel activeId={activeId} />

          {/* Environment 강도 조절: 배경/라이팅 각각 */}
          <Environment
            preset="city"
            backgroundIntensity={10}
            environmentIntensity={0.1}
          />

          {/* 전광판(가로로 긴 박스) + 역광 주황색 면광원 */}
          <group position={[0, 0, 6]}>
            {/* 전광판이 원점을 바라보도록 180도 회전 */}
            <group rotation={[0, Math.PI, 0]}>
              <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[12, 3.2, 0.12]} />
                <meshStandardMaterial
                  color="#FF4B1C"
                  emissive="#FF4B1C"
                  emissiveIntensity={6}
                  metalness={0}
                  roughness={0.3}
                  toneMapped={false}
                />
              </mesh>
              <rectAreaLight
                position={[0, 1.2, 0.14]}
                width={12}
                height={3.2}
                intensity={20}
                color="#FF4B1C"
              />
            </group>
          </group>

          {/* 매달린 링 3개 */}
          {/* <HangingRings /> */}

          {/* <mesh rotation-x={-Math.PI / 2} position={[0, -0.4, 0]}>
            <planeGeometry args={[20, 20]} />
            <MeshReflectorMaterial
              resolution={1024}
              blur={[20, 20]}
              mixBlur={1}
              mixStrength={1}
              roughness={0}
              mirror={1}
              depthScale={0}
              reflectorOffset={0.001}
              color="#0a0a0a"
              metalness={0}
            />
          </mesh> */}

          <EffectComposer autoClear={false}>
            <Outline
              visibleEdgeColor="#fff"
              hiddenEdgeColor="#fff"
              edgeStrength={2.5}
              width={1000}
              blur={false}
            />
            {/* <Bloom
              intensity={0.12}
              luminanceThreshold={0.18}
              luminanceSmoothing={0.9}
            /> */}
            <BrightnessContrast brightness={0} contrast={0.1} />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        </Selection>
      </Canvas>
    </CanvasWrap>
  );
}

export default App;
