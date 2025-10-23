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
import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  Outline,
  Selection,
  Select,
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
      color="#444"
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

function App() {
  const cameraRef = useRef();
  const controlsRef = useRef();
  const [activeId, setActiveId] = useState(null);
  // 하나의 lookAt 타겟을 공유(참조 고정)하여 리렌더로 인한 카메라 애니메이션 재시작을 방지
  const lookAtTarget = useMemo(() => [0, 0, 40], []);

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
        <CameraController cameraRef={cameraRef} target={lookAtTarget} />
        <Selection>
          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            mouseButtons={{ LEFT: 0, MIDDLE: 2, RIGHT: 2 }}
            // target은 ref로 직접 업데이트
          />
          <spotLight
            position={[0, 6, 4]}
            angle={0.35}
            penumbra={0.6}
            intensity={2}
            castShadow
          />
          {/* 필요시 useRectAreaLightUniforms() 호출 */}
          <rectAreaLight
            position={[0, 2, 0]}
            width={10}
            height={2}
            intensity={20}
            color="#ffffff"
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
            <Model url="/Stage_Shell.glb" position={[0, 0, 0]} />
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

          {/* Hover 대상에 따라 1/2/3 또는 기본 FOR:EST를 부드럽게 전환 */}
          <AnimatedLabel activeId={activeId} />

          {/* <Environment preset="city" /> */}

          {/* <mesh rotation-x={-Math.PI / 2} position={[0, -0.4, 0]}>
            <planeGeometry args={[10, 10]} />
            <MeshReflectorMaterial
              blur={[10000, 200]} // 반사 블러
              mixBlur={1} // 블러 강도
              mixStrength={0.5} // 반사색 섞기 강도
              roughness={0}
              mirror={1}
              color="#fff"
              metalness={1}
            />
          </mesh> */}

          <EffectComposer autoClear={false}>
            <Outline
              visibleEdgeColor="#00eaff"
              hiddenEdgeColor="#00eaff"
              edgeStrength={2.5}
              width={1000}
              blur={false}
            />
            <Bloom
              intensity={0.08}
              luminanceThreshold={0.2}
              luminanceSmoothing={1}
            />
            <BrightnessContrast brightness={0} contrast={0.1} />
          </EffectComposer>
        </Selection>
      </Canvas>
    </CanvasWrap>
  );
}

export default App;
