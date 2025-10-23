import { Canvas, useLoader, useThree, useFrame } from "@react-three/fiber";
import styled, { keyframes } from "styled-components";
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import gsap from "gsap";
import {
  OrbitControls,
  Text,
  MeshReflectorMaterial,
  GradientTexture,
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
function CameraController({
  cameraRef,
  target = [0, 0, 0],
  play = false,
  onDone,
}) {
  const { camera } = useThree();
  const initialTargetRef = useRef(target);
  const hasRunRef = useRef(false);
  useEffect(() => {
    if (cameraRef) cameraRef.current = camera;
  }, [camera, cameraRef]);
  // 초기 1회 애니메이션만 수행 (target 변경과 무관)
  useEffect(() => {
    if (!cameraRef?.current || !play || hasRunRef.current) return;
    const start = { x: 0, y: 3, z: -16 };
    const end = { x: 0, y: 1, z: -7 };
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
      onComplete: () => {
        hasRunRef.current = true;
        if (typeof onDone === "function") onDone();
      },
    });
  }, [cameraRef, play, onDone]);
  return null;
}

// hover 시 그룹 전체 외곽선 표시 (단일 항목만 활성)
function Hoverable({
  id,
  activeId,
  focusedId,
  setActiveId,
  onClick,
  children,
}) {
  // 포커스가 있으면 해당 항목에만 아웃라인 고정, 없으면 호버에 따라 동작
  const enabled = focusedId ? focusedId === id : activeId === id;
  return (
    <Select enabled={enabled}>
      <group
        onPointerEnter={() => {
          if (!focusedId && activeId !== id) setActiveId(id);
        }}
        onPointerLeave={() => {
          if (!focusedId && activeId === id) setActiveId(null);
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
        ? "CarSeat"
        : activeId === "shell"
        ? "Module"
        : activeId === "wheel"
        ? "PBV"
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
      position={[0, 1.4, 4]}
      anchorX="center"
      anchorY="middle"
      fontSize={3}
      letterSpacing={-0.08}
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

// 카메라가 특정 타겟을 바라보며 수평 원운동(오빗)하도록 하는 팔로워
function CameraOrbitFollower({
  active,
  controlsRef,
  target = [0, 1, 0.08],
  speed = 0.1,
}) {
  const { camera } = useThree();
  const angleRef = useRef(null);
  const radiusRef = useRef(0);
  const yRef = useRef(0);

  useEffect(() => {
    if (!active) {
      angleRef.current = null;
      return;
    }
    const [tx, ty, tz] = target;
    const dx = camera.position.x - tx;
    const dz = camera.position.z - tz;
    radiusRef.current = Math.hypot(dx, dz);
    angleRef.current = Math.atan2(dz, dx);
    yRef.current = camera.position.y;
    // 초기 정렬
    camera.lookAt(tx, ty, tz);
    if (controlsRef?.current) {
      controlsRef.current.target.set(tx, ty, tz);
      controlsRef.current.update();
    }
  }, [active, target, camera, controlsRef]);

  useFrame((_, delta) => {
    if (!active || angleRef.current === null) return;
    const [tx, ty, tz] = target;
    angleRef.current += speed * delta; // chair 회전 속도와 동일한 각속도
    const r = radiusRef.current;
    const x = tx + r * Math.cos(angleRef.current);
    const z = tz + r * Math.sin(angleRef.current);
    camera.position.set(x, yRef.current, z);
    camera.lookAt(tx, ty, tz);
    if (controlsRef?.current) {
      controlsRef.current.target.set(tx, ty, tz);
      controlsRef.current.update();
    }
  });
  return null;
}

const CanvasWrap = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
`;

// Intro Overlay UI
const pulse = keyframes`
  0% { opacity: 0.4; transform: translateY(0px); }
  50% { opacity: 1; transform: translateY(-2px); }
  100% { opacity: 0.4; transform: translateY(0px); }
`;

const IntroOverlay = styled.div`
  position: absolute;
  inset: 0;
  /* 요청: 뒤 3D가 은은히 비치도록 반투명 + 약한 블러 */
  background: rgba(0, 0, 0, 0.62);
  -webkit-backdrop-filter: blur(2px) saturate(0.9);
  backdrop-filter: blur(2px) saturate(0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 240px;
  z-index: 10;
  cursor: pointer;
  /* 상하 가장자리를 살짝 더 어둡게 해서 가독성 확보 */
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.35) 0%,
      rgba(0, 0, 0, 0) 40%,
      rgba(0, 0, 0, 0.35) 100%
    );
  }
`;

const Logo = styled.img`
  width: clamp(60px, 11vw, 160px);
  height: auto;
  user-select: none;
  pointer-events: none;
`;

const ClickHint = styled.div`
  color: #e7e7e7;
  font-size: clamp(12px, 1.4vw, 16px);
  letter-spacing: 0.06em;
  opacity: 0.8;
  animation: ${pulse} 1.6s ease-in-out infinite;
`;

// ===== Top Header (shows after intro) =====
const fadeDown = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const TopHeader = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  z-index: 9;
  pointer-events: auto; /* 로고 클릭 가능하도록 */
  animation: ${fadeDown} 0.45s ease-out both;
  /* 요청: 박스의 경계선 제거 */
  border-bottom: none;
`;

const HeaderInner = styled.div`
  width: 100%;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* 기본적으로 클릭 통과, 필요한 요소만 별도로 활성화 */
  pointer-events: none;
`;

const LeftGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: auto; /* 로고 클릭 허용 */
`;

const RightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
`;

const LogoSmall = styled.img`
  height: 22px;
  object-fit: contain;
  filter: drop-shadow(0 0 0.25px rgba(255, 255, 255, 0.2));
  cursor: pointer;
`;

const Span = styled.span`
  color: #eaeaea;
  font-weight: 400;
  letter-spacing: 0.01em;
  font-size: 13px;
  opacity: 0.95;
`;

const Sep = styled.span`
  color: #8b8b8b;
  font-size: 20px;
  opacity: 0.7;
`;

const GlowLine = styled.div`
  pointer-events: none;
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, #131313 0%, #fff 100%);
  margin-left: 16px;
`;

const RightTag = styled.span`
  color: #f5f5f5;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-size: 14px;
`;

// ===== Left Titles (Seat / Module / Base) =====
const LeftTitles = styled.div`
  position: absolute;
  top: 88px; /* 헤더(64px) 아래 여백 */
  left: clamp(16px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 1.2vw, 10px);
  z-index: 8;
  pointer-events: none; /* 컨테이너는 통과, 버튼만 클릭 */
`;

const LeftTitleButton = styled.button`
  font-family: Paperlogy;
  all: unset;
  cursor: pointer;
  color: #ffffff;
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: 0.01em;
  font-size: clamp(24px, 5vw, 64px);
  opacity: ${(p) => (p.$active ? 1 : 0.2)};
  filter: ${(p) =>
    p.$active ? "drop-shadow(0 0 10px rgba(255,255,255,0.25))" : "none"};
  transition: opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease;
  pointer-events: auto;
  &:hover {
    opacity: 1;
    transform: translateY(-1px);
  }
`;

// ===== Focus Info Panel (reusable per focused item) =====
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const FocusPanel = styled.div`
  position: absolute;
  left: clamp(16px, 4vw, 56px);
  bottom: clamp(16px, 4vw, 56px);
  z-index: 8;
  color: #f1f1f1;
  max-width: min(48vw, 620px);
  pointer-events: none; /* 3D 인터랙션 방해하지 않음 */
  animation: ${fadeUp} 0.4s ease-out both;
`;

const FocusTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TipIcon = styled.img`
  width: 18px;
  height: 18px;
  object-fit: contain;
  filter: drop-shadow(0 0 0.5px rgba(255, 255, 255, 0.45));
`;

const FocusTitle = styled.h2`
  margin: 0;
  font-size: clamp(18px, 2.2vw, 28px);
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #ffffff;
`;

const FocusBody = styled.p`
  margin: 14px 0 0 0;
  color: #d8d8d8;
  font-size: clamp(12px, 1.25vw, 16px);
  line-height: 1.5;
  letter-spacing: 0.01em;
  strong {
    color: #ffffff;
    font-weight: 800;
  }
`;

// ===== Bottom Dock (floor-attached text/arrow section) =====
const BottomDock = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 7;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, #000 100%);

  pointer-events: auto; /* 화살표 클릭 가능 (텍스트 영역은 none으로 설정) */
  /* 상단에 살짝 그레인/글로우 느낌의 얇은 그라디언트 라인 */
`;

const DockInner = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  /* 요청: 패딩값 증가 */
  padding: clamp(28px, 5vw, 72px) clamp(28px, 7vw, 112px);
`;

const DockLeft = styled.div`
  max-width: min(46vw, 720px);
  color: #e9e9e9;
  pointer-events: none; /* 텍스트 영역은 클릭 통과 */
`;

const DockTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Bullet = styled.span`
  width: 12px;
  height: 24px;
  border-radius: 2px;
  background: #ffffff;
  display: inline-block;
`;

const GradientTitle = styled.h3`
  margin: 0;
  font-size: clamp(18px, 2.2vw, 28px);
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #ffffff; /* 요청: 타이틀은 #fff 컬러 사용 */
`;

const DockPara = styled.p`
  margin: 18px 0 0 0;
  font-size: clamp(12px, 1.25vw, 16px);
  line-height: 1.9;
  color: #d8d8d8;
  letter-spacing: 0.01em;
  strong {
    color: #ffffff;
    font-weight: 800;
  }
`;

const DockRight = styled.div`
  display: flex;
  align-items: flex-end;
  pointer-events: auto; /* 화살표 클릭 가능 */
`;

const arrowBlink = keyframes`
  0% { opacity: 0.55; filter: drop-shadow(0 0 6px rgba(255,255,255,0.25)); }
  50% { opacity: 1; filter: drop-shadow(0 0 16px rgba(255,255,255,0.6)); }
  100% { opacity: 0.55; filter: drop-shadow(0 0 6px rgba(255,255,255,0.25)); }
`;

const ArrowImg = styled.img`
  width: clamp(120px, 18vw, 320px);
  height: auto;
  filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.4));
  opacity: 0.95;
  cursor: pointer;
  animation: ${arrowBlink} 1.6s ease-in-out infinite;
  transition: transform 0.18s ease;
  &:hover {
    transform: scale(1.06);
  }
`;

function Model({ url, position = [0, 0, 0], metallic = false, ...props }) {
  const gltf = useLoader(GLTFLoader, url);
  const goldMat = useMemo(() => {
    if (!metallic) return null;
    // 골드 재질(물리 기반): 금속성 1, 중간 러프니스, 약간 따뜻한 금색
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#626262"),
      metalness: 1,
      roughness: 0.28,
      clearcoat: 0.05,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1.4,
    });
    return mat;
  }, [metallic]);

  useEffect(() => {
    if (!gltf?.scene || !metallic || !goldMat) return;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material = goldMat;
      }
    });
  }, [gltf, metallic, goldMat]);

  // 도크(바닥 고정) 텍스트 컨텐츠: focusedId 기준으로 노출

  return <primitive object={gltf.scene} position={position} {...props} />;
}

// 차체(금속 광택 카페인트) 전용 재질 적용 컴포넌트
// CarBody 커스텀 재질 제거 (원본 GLB 재질 사용)

function App() {
  const asset = (p) => `${import.meta.env.BASE_URL}${p}`;
  const cameraRef = useRef();
  const controlsRef = useRef();
  const [activeId, setActiveId] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [introActive, setIntroActive] = useState(true);
  const [startCam, setStartCam] = useState(false);
  const overlayRef = useRef(null);
  const logoRef = useRef(null);
  const orbitDelayRef = useRef(null);
  // 하나의 lookAt 타겟을 공유(참조 고정)하여 리렌더로 인한 카메라 애니메이션 재시작을 방지
  // 초기 카메라 애니메이션이 약간 더 높은 지점을 바라보도록(y=2)
  const lookAtTarget = useMemo(() => [0, 4, 40], []);

  // chair 회전 속도(Chair.jsx와 동일 값으로 유지)
  const CHAIR_SPEED = 0.1;
  const [followChair, setFollowChair] = useState(false);
  const FOCUS_DUR = 1.4;
  // 의자 포커스 시 카메라와 오빗 팔로워가 동일하게 바라볼 타겟(약간의 오프셋으로 pole 회피)
  const CHAIR_TARGET = useMemo(() => [0, 1, 0.08], []);
  // 메인(초기 구도) 포커스용 위치/타겟: 초기 카메라 무빙 도착점과 동일하게 맞춤
  const MAIN_TO = useMemo(() => [0, 1, -7], []);
  const MAIN_LOOK = lookAtTarget;

  // 포커스 이동 헬퍼 (id별 카메라 포지션/타겟 및 chair 오빗 제어 통합)
  const focusById = useMemo(
    () => ({
      main: () => {
        setFocusedId("main");
        if (orbitDelayRef.current) orbitDelayRef.current.kill();
        setFollowChair(false);
        focusCamera(MAIN_TO, MAIN_LOOK, FOCUS_DUR);
      },
      chair: () => {
        setFocusedId("chair");
        // 포커스 트윈과 오빗 팔로워가 동일 타겟을 사용하도록 통일
        focusCamera([1, 4, 1], CHAIR_TARGET, FOCUS_DUR);
        if (orbitDelayRef.current) orbitDelayRef.current.kill();
        // 컨트롤 재활성화 시점과 맞물려 미세 점프 방지용으로 소폭 지연
        orbitDelayRef.current = gsap.delayedCall(FOCUS_DUR + 0.03, () =>
          setFollowChair(true)
        );
      },
      shell: () => {
        setFocusedId("shell");
        if (orbitDelayRef.current) orbitDelayRef.current.kill();
        setFollowChair(false);
        focusCamera([6, 3, -2], [2, 0, 2], FOCUS_DUR);
      },
      wheel: () => {
        setFocusedId("wheel");
        if (orbitDelayRef.current) orbitDelayRef.current.kill();
        setFollowChair(false);
        focusCamera([-3, 0, -2.8], [0, 0, 0], FOCUS_DUR);
      },
    }),
    [FOCUS_DUR, CHAIR_TARGET, MAIN_TO, MAIN_LOOK]
  );

  // 화살표 순서를 왼쪽 타이틀(위→아래) 순서와 동일하게 유지
  // LeftTitles: Main → Seat(chair) → Module(shell) → Base(wheel)
  const order = ["main", "chair", "shell", "wheel"];
  const goNextFocus = () => {
    if (!focusedId) return focusById.main();
    const idx = order.indexOf(focusedId);
    const next = order[(idx + 1) % order.length];
    focusById[next]();
  };

  // 포커스 정보 컨텐츠 (재사용 가능)
  // const focusContent = useMemo(
  //   () => ({
  //     wheel: {
  //       title: "PBV 모듈형 교체",
  //       body:
  //         "해당 자동차 인테리어 디자인에는 PBV 플랫폼의 모듈 구조를 채용했습니다. \n" +
  //         "PBV 플랫폼의 모듈 구조를 채용했습니다. \n" +
  //         "사용자의 니즈와 목적에 맞춰 공간 구성을 변경하고, 탑승할 수 있도록 보조합니다.",
  //     },
  //     chair: {
  //       title: "카시트 디자인",
  //       body:
  //         "기존의 딱딱하고 사각형 형상의 카시트는 시니어의 장시간 탑승을 불편하게 만듭니다.  \n" +
  //         "자율주행, PBV를 통해 넓어진 공간 구성을 반영해 무중력 시트 기능을\n" +
  //         "제공하는 라운지 체어(코로나 체어)의 형상을 가져온 카시트를 제안합니다.  ",
  //     },
  //     shell: {
  //       title: "모듈 디자인",
  //       body:
  //         "액티브 시니어의 시나리오를 반영해 두가지 모듈을 사용자에 맞춰 부착할 수 있도록. \n" +
  //         "디자인했습니다. 반려견을 기르는 엑티브 시니어를 위한 반려견 카시트 모듈, \n" +
  //         "이외에는 사이드 테이블 모듈을 부착합니다. ",
  //     },
  //   }),
  //   []
  // );

  // 도크(바닥 고정) 텍스트 컨텐츠: focusedId 기준으로 노출
  const dockContent = useMemo(
    () => ({
      chair: {
        title: "카시트 디자인",
        body:
          "기존의 딱딱하고 사각형 형상의 카시트는 시니어의 장시간 탑승을 불편하게 만듭니다.  <br/>" +
          "자율주행, PBV를 통해 넓어진 공간 구성을 반영해 무중력 시트 기능을<br/>" +
          "제공하는 라운지 체어(코로나 체어)의 형상을 가져온 카시트를 제안합니다.",
      },
      shell: {
        title: "모듈 디자인",
        body:
          "" +
          "<strong>액티브 시니어</strong>의 시나리오를 반영해 <strong>두가지 모듈</strong>을 사용자에 맞춰 부착할 수 있도록 디자인했습니다. " +
          "반려견을 기르는 액티브 시니어를 위한 <strong>반려견 카시트 모듈</strong>, " +
          "이외에는 <strong>사이드 테이블 모듈</strong>을 부착합니다.",
      },
      wheel: {
        title: "PBV 모듈형 교체",
        body:
          "해당 자동차 인테리어 디자인에는 PBV 플랫폼의 모듈 구조를 채용했습니다. <br/>" +
          "PBV 플랫폼의 모듈 구조를 채용했습니다. <br/>" +
          "사용자의 니즈와 목적에 맞춰 공간 구성을 변경하고, 탑승할 수 있도록 보조합니다.",
      },
    }),
    []
  );

  // RectAreaLight 셰이더 유니폼 1회 초기화 (three examples 유틸)
  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  // 카메라 포커스 헬퍼: 목적지/포커스와 함께 부드럽게 이동
  const focusCamera = (to, lookAt, duration = 1.5) => {
    if (!cameraRef.current) return;
    // 기존 진행 중인 카메라 트윈이 있으면 중단
    gsap.killTweensOf(cameraRef.current.position);
    const controls = controlsRef.current;
    // 트윈 중에는 OrbitControls의 내부 업데이트가 개입하지 않도록 비활성화
    if (controls) {
      controls.enabled = false;
      controls.target.set(lookAt[0], lookAt[1], lookAt[2]);
    }
    // 카메라 포지션 트윈 (onUpdate에서 lookAt 유지)
    moveCamera(cameraRef, to, lookAt, duration);
    // 트윈 종료 직후, 타겟/업데이트를 마지막으로 한 번 동기화한 뒤 컨트롤 재활성화
    gsap.delayedCall(duration + 0.02, () => {
      if (controlsRef.current) {
        controlsRef.current.target.set(lookAt[0], lookAt[1], lookAt[2]);
        controlsRef.current.update();
        controlsRef.current.enabled = true;
      }
    });
  };

  // shell 전용 카메라 포커스 위치 (필요시 조정)
  const SHELL_TO = useMemo(() => [0, 3.5, -8], []);
  const SHELL_LOOK = useMemo(() => [0, 1.5, 6], []);

  const handleStart = () => {
    if (!overlayRef.current) return;
    const tl = gsap.timeline();
    if (logoRef.current) {
      tl.fromTo(
        logoRef.current,
        { scale: 1 },
        { scale: 1.2, duration: 0.22, ease: "power2.out" }
      ).to(
        logoRef.current,
        { scale: 1, duration: 0.18, ease: "back.out(2)" },
        ">-0.06"
      );
    }
    // 카메라 무빙을 먼저 시작하고, 오버레이는 그 뒤에 페이드 아웃하여 초기 프레임 노출 방지
    tl.add(() => {
      setStartCam(true);
    })
      // 오버레이는 로고가 원래 크기로 되돌아오는 단계와 동시에 빠르게 페이드
      .to(
        overlayRef.current,
        {
          opacity: 0,
          duration: 0.35,
          ease: "power2.out",
          onStart: () => {
            overlayRef.current.style.pointerEvents = "none";
          },
        },
        "<"
      )
      .add(() => {
        setIntroActive(false);
      });
  };

  // 초기 대기화면(인트로)로 복귀
  const returnToIntro = useCallback(() => {
    // 오빗/포커스 상태 리셋
    setFollowChair(false);
    setFocusedId(null);
    setActiveId(null);
    // 오버레이 보이기 + 불투명도 1로 복귀
    setIntroActive(true);
    setStartCam(false);
    if (overlayRef.current) {
      overlayRef.current.style.opacity = 1;
      overlayRef.current.style.pointerEvents = "auto";
    }
    // 카메라를 초기 위치로 살짝 되돌려 다음 시작이 매끄럽게 보이도록
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 2, -6);
      if (controlsRef.current) {
        const [tx, ty, tz] = lookAtTarget;
        controlsRef.current.target.set(tx, ty, tz);
        controlsRef.current.update();
      }
    }
  }, [lookAtTarget]);

  // 초기 카메라 무빙 동안 OrbitControls가 각 프레임 camera.lookAt를 덮어쓰므로
  // 시작 시점에 controls의 target도 함께 설정해 준다.
  useEffect(() => {
    if (!startCam || !controlsRef.current) return;
    const [tx, ty, tz] = lookAtTarget;
    controlsRef.current.target.set(tx, ty, tz);
    controlsRef.current.update();
    // 짧은 지연 뒤 한 번 더 동기화하여 HMR/레이트 이슈 보완
    const id = setTimeout(() => {
      if (controlsRef.current) {
        controlsRef.current.target.set(tx, ty, tz);
        controlsRef.current.update();
      }
    }, 50);
    return () => clearTimeout(id);
  }, [startCam, lookAtTarget]);

  // 사용자 상호작용이 10초간 없으면 페이지를 새로고침하는 타이머 (인트로 상태에서는 동작하지 않음)
  useEffect(() => {
    let idleTimer;
    const RESET_MS = 10000;
    const resetTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      // 인트로가 이미 보이는 상태면 타이머 불필요
      if (introActive) return;
      idleTimer = setTimeout(() => {
        // 10초간 무입력 시 하드 리프레시로 초기 상태 복원
        window.location.reload();
      }, RESET_MS);
    };

    // 키보드/마우스 입력 감지
    const events = [
      "mousemove",
      "mousedown",
      "mouseup",
      "wheel",
      "keydown",
      "keyup",
      "touchstart",
      "touchend",
    ];
    events.forEach((e) =>
      window.addEventListener(e, resetTimer, { passive: true })
    );
    resetTimer();
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [introActive, returnToIntro]);

  return (
    <CanvasWrap>
      <Canvas shadows camera={{ fov: 50, position: [0, 2, -6] }}>
        {/* 씬 배경을 검은색으로 설정 */}
        <color attach="background" args={["#000000"]} />
        {/* 약한 포그로 원근감 및 분위기 추가 */}
        <fog attach="fog" args={["#000", 12, 60]} />
        <CameraController
          cameraRef={cameraRef}
          target={lookAtTarget}
          play={startCam}
          onDone={() => setFocusedId("main")}
        />
        <Selection>
          <OrbitControls
            ref={controlsRef}
            // 사용자 자유 시점 이동 비활성화
            enablePan={false}
            enableRotate={false}
            enableZoom={false}
            mouseButtons={{ LEFT: 0, MIDDLE: 2, RIGHT: 2 }}
            // target은 ref로 직접 업데이트
          />
          {/* chair 포커스 시 카메라를 동일 속도로 오빗 */}
          <CameraOrbitFollower
            active={followChair && focusedId === "chair"}
            controlsRef={controlsRef}
            target={CHAIR_TARGET}
            speed={-CHAIR_SPEED}
          />
          {/* 전체적으로 부드럽게 밝혀주는 보조 광원들 */}
          <hemisphereLight
            color="#777777"
            groundColor="#111111"
            intensity={1}
          />
          <ambientLight intensity={1} />
          {/* 상단 스포트라이트로 바닥 하이라이트 */}

          <spotLight
            position={[0, 6, -5]}
            angle={2}
            penumbra={0.6}
            intensity={10}
            castShadow
          />
          {/* 차체 전면을 부드럽게 밝혀줄 전면 보조 면광원 (카메라 근처에서 차량을 향해) */}
          <rectAreaLight
            position={[0, 1, -6]}
            rotation={[0, Math.PI, 0]}
            width={6}
            height={1.2}
            intensity={16}
            color="#ffffff"
          />
          {/* 차량 전체를 은은하게 감싸는 와이드 전면 소프트 필 */}
          <rectAreaLight
            position={[0, 2, -2]}
            rotation={[0, Math.PI, 0]}
            width={12}
            height={3}
            intensity={20}
            color="#ffffff"
          />
          {/* <rectAreaLight
            position={[0, 2, 4]}
            width={10}
            height={2}
            intensity={10}
            color="#d46666"
          /> */}

          {/* <rectAreaLight
            position={[0, 0, -10]}
            width={10}
            height={2}
            intensity={10}
            color="#d46666"
          /> */}

          {/* 각각 독립 Hoverable로 감싸되 activeId로 단일 선택 유지 */}
          <Hoverable
            id="chair"
            activeId={activeId}
            focusedId={focusedId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedId("chair");
              // 주의: target과 카메라가 정확히 수직 정렬되면 OrbitControls가 극점(pole) 보정으로 미세 점프가 발생할 수 있음
              // 약간의 x/z 오프셋을 주어 극점 정렬을 피함
              const dur = FOCUS_DUR;
              focusCamera([1, 4, 1], [0.2, 1, 0.2], dur);
              // 포커스 무빙이 끝난 뒤에 오빗 시작 (트윈과 충돌 방지)
              if (orbitDelayRef.current) orbitDelayRef.current.kill();
              orbitDelayRef.current = gsap.delayedCall(dur, () =>
                setFollowChair(true)
              );
            }}
          >
            <Chair center={[0, 0, 0]} speed={0.1} />
          </Hoverable>

          <Hoverable
            id="shell"
            activeId={activeId}
            focusedId={focusedId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedId("shell");
              if (orbitDelayRef.current) orbitDelayRef.current.kill();
              setFollowChair(false);
              focusCamera([6, 3, -2], [2, 0, 2], FOCUS_DUR);
            }}
          >
            <Model
              url={asset("Stage_Shell.glb")}
              position={[0, 0, 0]}
              metallic
            />
          </Hoverable>

          <Hoverable
            id="wheel"
            activeId={activeId}
            focusedId={focusedId}
            setActiveId={setActiveId}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedId("wheel");
              if (orbitDelayRef.current) orbitDelayRef.current.kill();
              setFollowChair(false);
              focusCamera([-3, 0, -2.8], [0, 0, 0], FOCUS_DUR);
            }}
          >
            <Model
              url={asset("Stage_Wheel.glb")}
              position={[0, 0, 0]}
              metallic
            />
          </Hoverable>

          {/* <Model url="/Stage_Studio.glb" position={[0, 0, 0]} /> */}

          {/* <Model url="/Stage_Background.glb" position={[0, 0, 0]} /> */}

          {/* 포커스가 있으면 텍스트 고정, 없으면 Hover에 따라 전환 */}
          <AnimatedLabel activeId={focusedId ?? activeId} />

          {/* Environment 강도 조절: 배경/라이팅 각각 */}
          {/* <Environment
            preset="city"
            backgroundIntensity={0}
            environmentIntensity={1}
          /> */}

          {/* 전광판(가로로 긴 박스) + 역광 주황색 면광원 */}
          <group position={[0, 0, 6]}>
            {/* 전광판이 원점을 바라보도록 180도 회전 */}
            <group rotation={[0, Math.PI, 0]}>
              <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[12, 3.2, 0.12]} />
                {/* 물리기반(PBR) 오렌지 패널: 그라디언트를 컬러 맵으로 사용 */}
                <meshPhysicalMaterial
                  metalness={0}
                  roughness={0.5}
                  clearcoat={0.02}
                  clearcoatRoughness={0.4}
                  side={THREE.DoubleSide}
                >
                  <GradientTexture
                    attach="map"
                    stops={[0, 0.55, 1]}
                    colors={["#1a0d0a", "#7a2a16", "#ff4b1c"]}
                    size={1024}
                  />
                </meshPhysicalMaterial>
              </mesh>
              {/* 패널 하단 라인 하이라이트용 얇은 면광원 (앞쪽, 약하게) */}
              <rectAreaLight
                position={[0, 0.4, -0.06]}
                width={12}
                height={0.08}
                intensity={1.2}
                color="#fff0e6"
              />
              <rectAreaLight
                position={[0, 1.2, 0.14]}
                width={12}
                height={3.2}
                intensity={12}
                color="#ff5d5d"
              />
            </group>
          </group>

          {/* 천장 라인 하이라이트용 얇은 면광원 2개 */}
          <rectAreaLight
            position={[-6, 5.5, 0]}
            width={14}
            height={0.12}
            intensity={10}
            color="#fff7ed"
          />
          <rectAreaLight
            position={[6, 5.5, 0]}
            width={14}
            height={0.12}
            intensity={1}
            color="#fff7ed"
          />

          <mesh rotation-x={-Math.PI / 2} position={[0, -0.36, 0]}>
            <planeGeometry args={[48, 48]} />
            <MeshReflectorMaterial
              resolution={1024}
              blur={[300, 30]}
              mixBlur={1}
              mixStrength={1.6}
              roughness={0}
              mirror={1}
              depthScale={0}
              reflectorOffset={0.001}
              color="#0a0a0a"
              metalness={0}
            />
          </mesh>

          <EffectComposer autoClear={false}>
            <Outline
              visibleEdgeColor="#fff"
              hiddenEdgeColor="#fff"
              edgeStrength={4}
              width={1000}
              blur={false}
            />
            <Bloom
              intensity={0.12}
              luminanceThreshold={0.28}
              luminanceSmoothing={0.8}
            />
            <BrightnessContrast brightness={0} contrast={0.1} />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        </Selection>
      </Canvas>
      {/* 바닥 고정 도크: 포커스 컨텐츠가 있으면 표시, 없더라도 화살표는 유지(main 등) */}
      {!introActive && (
        <BottomDock>
          <DockInner>
            {focusedId && dockContent[focusedId] ? (
              <>
                <DockLeft>
                  <DockTitleRow>
                    <Bullet />
                    <GradientTitle>
                      {dockContent[focusedId].title}
                    </GradientTitle>
                  </DockTitleRow>
                  <DockPara
                    dangerouslySetInnerHTML={{
                      __html: dockContent[focusedId].body,
                    }}
                  />
                </DockLeft>
                <DockRight>
                  <ArrowImg
                    src={asset("Arrow.svg")}
                    alt="arrow"
                    onClick={goNextFocus}
                  />
                </DockRight>
              </>
            ) : (
              <DockRight>
                <ArrowImg
                  src={asset("Arrow.svg")}
                  alt="arrow"
                  onClick={goNextFocus}
                />
              </DockRight>
            )}
          </DockInner>
        </BottomDock>
      )}
      {!introActive && (
        <LeftTitles>
          <LeftTitleButton
            $active={focusedId === "main"}
            onClick={() => focusById.main()}
          >
            MAIN
          </LeftTitleButton>
          <LeftTitleButton
            $active={focusedId === "chair"}
            onClick={() => focusById.chair()}
          >
            SEAT
          </LeftTitleButton>
          <LeftTitleButton
            $active={focusedId === "shell"}
            onClick={() => focusById.shell()}
          >
            MODULE
          </LeftTitleButton>
          <LeftTitleButton
            $active={focusedId === "wheel"}
            onClick={() => focusById.wheel()}
          >
            BASE
          </LeftTitleButton>
        </LeftTitles>
      )}
      {!introActive && (
        <TopHeader>
          <HeaderInner>
            <LeftGroup>
              <LogoSmall
                src={asset("Text.svg")}
                alt="Logo"
                onClick={returnToIntro}
              />
              <Sep>|</Sep>
              <Span>PBV Interior Design for Active Senior</Span>
              <Sep>|</Sep>
              <Span>Designed By Hyeseong Park</Span>
            </LeftGroup>
            <RightGroup>
              <GlowLine />
              <RightTag>TUK Grad 25</RightTag>
            </RightGroup>
          </HeaderInner>
        </TopHeader>
      )}
      {introActive && (
        <IntroOverlay ref={overlayRef} onClick={handleStart}>
          <Logo src={asset("Logo.svg")} alt="Logo" ref={logoRef} />
          <ClickHint>Click to start</ClickHint>
        </IntroOverlay>
      )}
    </CanvasWrap>
  );
}

export default App;
