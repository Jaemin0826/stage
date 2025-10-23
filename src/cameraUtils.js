import gsap from "gsap";

// 카메라 이동 함수
export function moveCamera(cameraRef, to, lookAt = [0, 0, 0], duration = 1.5) {
  if (!cameraRef?.current) return;
  gsap.to(cameraRef.current.position, {
    x: to[0],
    y: to[1],
    z: to[2],
    duration,
    ease: "power2.out",
    onUpdate: () => {
      cameraRef.current.lookAt(...lookAt);
    },
  });
}
