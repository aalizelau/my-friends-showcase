"use client";

import { Environment, Loader, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  ShaderMaterial,
  Vector2,
} from "three";

function GridPlane({
  targetCenterUv,
}: {
  targetCenterUv: React.MutableRefObject<Vector2>;
}) {
  const meshRef = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uGridScale: { value: 28.0 },
      uLineWidth: { value: 0.5 },
      uEdgeWidth: { value: 0.14 },
      uEdgeAmp: { value: 1.35 },
      uCenterRadius: { value: 0.22 },
      uCenterAmp: { value: 0.9 },
      uCenter: { value: new Vector2(0.5, 0.5) },
      uTime: { value: 0.0 },
      uScrollSpeed: { value: 0.01 },
      uResolution: { value: new Vector2(1, 1) },
    }),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const material = mesh.material as ShaderMaterial;

    material.uniforms.uTime.value = state.clock.getElapsedTime();
    (material.uniforms.uCenter.value as Vector2).lerp(targetCenterUv.current, 0.08);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -5.2]}>
      <planeGeometry args={[18, 18, 512, 512]} />
      <shaderMaterial
        attach="material"
        args={[
          {
            uniforms,
            vertexShader: `
                varying vec2 vUv;
                
                uniform float uEdgeWidth;
                uniform float uEdgeAmp;
                uniform float uCenterRadius;
                uniform float uCenterAmp;
                uniform vec2 uCenter;

                void main() {
                  vUv = uv;

                  vec3 p = position;

                  float dEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
                  float edgeMask = 1.0 - smoothstep(0.0, uEdgeWidth, dEdge);

                  float dCenter = distance(vUv, uCenter);
                  float centerMask = 1.0 - smoothstep(0.0, uCenterRadius, dCenter);

                  float zOffset = edgeMask * uEdgeAmp + centerMask * uCenterAmp;
                  p.z += zOffset;

                  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                }
              `,
            fragmentShader: `
                varying vec2 vUv;
                
                uniform float uGridScale;
                uniform float uLineWidth;
                uniform float uTime;
                uniform float uScrollSpeed;
                uniform vec2 uResolution;

                float gridLine(float coord, float width) {
                  float fw = fwidth(coord);
                  float p = abs(fract(coord - 0.5) - 0.5);
                  return 1.0 - smoothstep(width * fw, (width + 1.0) * fw, p);
                }

                void main() {
                  vec2 uv = (vUv + vec2(uTime * uScrollSpeed, 0.0)) * uGridScale;
                  float gx = gridLine(uv.x, uLineWidth);
                  float gy = gridLine(uv.y, uLineWidth);
                  float g = max(gx, gy);

                  vec3 base = vec3(0.);
                  vec3 line = vec3(0.1);
                  vec3 col = mix(base, line, g);
                  gl_FragColor = vec4(col, 1.);
                }
              `,
            side: DoubleSide,
          },
        ]}
      />
    </mesh>
  );
}

function HelmetModel({ tubeAngleRef }: { tubeAngleRef: React.MutableRefObject<number> }) {
  const helmet = useGLTF("/models/helmet.glb");

  const scene = useMemo(() => helmet.scene.clone(true), [helmet.scene]);
  const modelRef = useRef<Object3D>(null);
  const baseRotation = useMemo(() => ({ x: Math.PI / 8, y: Math.PI / 2 }), []);
  const glassMaterial = useMemo(
    () =>
      new MeshPhysicalMaterial({
        transmission: 1,
        thickness: 10,
        roughness: 0,
        metalness: 0.1,
        ior: 1.9,
        dispersion: 1,
        clearcoat: 0.1,
        clearcoatRoughness: 1.1,
        iridescenceThicknessRange: [100, 400],
        color: "transparent",
        transparent: true,
        depthWrite: true,
      }),
    [],
  );

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.scale.set(0.7, 0.7, 0.7);
        object.material = glassMaterial;
        object.material.needsUpdate = true;
      }
    });

    return () => {
      glassMaterial.dispose();
    };
  }, [scene, glassMaterial]);

  useFrame(() => {
    const obj = modelRef.current;
    if (!obj) return;
    obj.rotation.x = baseRotation.x;
    obj.rotation.y = baseRotation.y - tubeAngleRef.current;
  });

  return (
    <primitive ref={modelRef} object={scene} rotation={[baseRotation.x, baseRotation.y, 0]} />
  );
}

function ImageTube({
    scrollTargetRef,
    spinVelocityRef,
    naturalDirRef,
    tubeAngleRef,
    rotationSpeedScaleTargetRef,
    rotationSpeedScaleLerpRef,
    baseSpeedRef,
    rows,
    cols,
    onHoverStart,
    onHoverMove,
    onHoverEnd,
  }: {
    scrollTargetRef: React.MutableRefObject<number>;
    spinVelocityRef: React.MutableRefObject<number>;
    naturalDirRef: React.MutableRefObject<number>;
    tubeAngleRef: React.MutableRefObject<number>;
    rotationSpeedScaleTargetRef: React.MutableRefObject<number>;
    rotationSpeedScaleLerpRef: React.MutableRefObject<number>;
    baseSpeedRef: React.MutableRefObject<number>;
    rows: number;
    cols: number;
    onHoverStart: (projectName: string, event: ThreeEvent<PointerEvent>) => void;
    onHoverMove: (event: ThreeEvent<PointerEvent>) => void;
    onHoverEnd: () => void;
  }) {
    const groupRef = useRef<Object3D>(null);
    const rowGroupRefs = useRef<Array<Object3D | null>>([]);
    const scrollCurrent = useRef(0);
    const angle = useRef(0);
    const rotationSpeedScale = useRef(1);

    const imageUrls = useMemo(
      () => [
        "/tube/im1.jpg",
        "/tube/im3.jpg",
        "/tube/im2.jpg",
        "/tube/im4.jpg",
        "/tube/im5.jpg",
        "/tube/im6.jpg",
        "/tube/im7.jpg",
        "/tube/im8.jpg",
        "/tube/im9.jpg",
      ],
      [],
    );

    const textures = useTexture(imageUrls);

    const projectNames = useMemo(() => {
      const fileToName: Record<string, string> = {
        "/tube/im1.jpg": "Project 1",
        "/tube/im2.jpg": "Project 2",
        "/tube/im3.jpg": "Project 3",
        "/tube/im4.jpg": "Project 4",
        "/tube/im5.jpg": "Project 5",
        "/tube/im6.jpg": "Project 6",
        "/tube/im7.jpg": "Project 7",
        "/tube/im8.jpg": "Project 8",
        "/tube/im9.jpg": "Project 9",
      };

      return imageUrls.map((url) => fileToName[url] ?? url);
    }, [imageUrls]);

    const radius = 4;
    const tileW = 0.72;
    const tileH = 1;
    const ySpacing = 2.7;
    const loopHeight = rows * ySpacing;
    const repeatCount = 3;
    const totalRows = rows * repeatCount;

    const rowSpeed = useMemo(() => {
      const speeds: number[] = [];
      for (let r = 0; r < rows; r++) {
        const t = rows <= 1 ? 0 : r / (rows - 1);
        speeds.push(0.65 + t * 0.9);
      }
      return speeds;
    }, [rows]);

    const rowPositions = useMemo(() => {
      const out: Array<{ rowIndex: number; y: number; baseRow: number; rowOffset: number }> = [];
      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        const y = (rowIndex - (totalRows - 1) / 2) * ySpacing;
        const baseRow = rowIndex % rows;
        const rowOffset = baseRow % 2 === 0 ? 0 : 0.5;
        out.push({ rowIndex, y, baseRow, rowOffset });
      }
      return out;
    }, [rows, totalRows, ySpacing]);

    useFrame((_state, dt) => {
      scrollCurrent.current += (scrollTargetRef.current - scrollCurrent.current) * 0.12;

      if (scrollCurrent.current > loopHeight / 2) {
        scrollCurrent.current -= loopHeight;
        scrollTargetRef.current -= loopHeight;
      } else if (scrollCurrent.current < -loopHeight / 2) {
        scrollCurrent.current += loopHeight;
        scrollTargetRef.current += loopHeight;
      }

      const damping = 0.92;
      spinVelocityRef.current *= Math.pow(damping, dt * 60);
      spinVelocityRef.current = Math.max(-2.0, Math.min(2.0, spinVelocityRef.current));

      rotationSpeedScale.current +=
        (rotationSpeedScaleTargetRef.current - rotationSpeedScale.current) *
        rotationSpeedScaleLerpRef.current;

      const scaledDt = dt * rotationSpeedScale.current;

      const baseSpeed = naturalDirRef.current * baseSpeedRef.current;
      angle.current += (baseSpeed + spinVelocityRef.current) * scaledDt;

      tubeAngleRef.current = angle.current;

      const group = groupRef.current;
      if (!group) return;
      group.position.y = -scrollCurrent.current;

      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        const rowObj = rowGroupRefs.current[rowIndex];
        if (!rowObj) continue;
        const baseRow = rowIndex % rows;
        rowObj.rotation.y = angle.current * rowSpeed[baseRow];
      }
    });

    return (
      <group ref={groupRef}>
        {rowPositions.map(({ rowIndex, y, baseRow, rowOffset }) => (
          <group
            key={rowIndex}
            position={[0, y, 0]}
            ref={(obj) => {
              rowGroupRefs.current[rowIndex] = obj;
            }}
          >
            {Array.from({ length: cols }).map((_, col) => {
              const theta = ((col + rowOffset) / cols) * Math.PI * 2;
              const x = Math.cos(theta) * radius;
              const z = Math.sin(theta) * radius;
              const ry = -(theta + Math.PI / 2);
              const texIndex = (baseRow * cols + col) % imageUrls.length;
              const projectName = projectNames[texIndex] ?? "";

              return (
                <mesh
                  key={col}
                  position={[x, 0, z]}
                  rotation={[0, ry, 0]}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    onHoverStart(projectName, e);
                  }}
                  onPointerMove={(e) => {
                    e.stopPropagation();
                    onHoverMove(e);
                  }}
                  onPointerOut={(e) => {
                    e.stopPropagation();
                    onHoverEnd();
                  }}
                >
                  <planeGeometry args={[tileW, tileH]} />
                  <meshBasicMaterial map={textures[texIndex]} toneMapped={false} side={DoubleSide} />
                </mesh>
              );
            })}
          </group>
        ))}
      </group>
    );
  }

export function FiberScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetCenterUv = useRef(new Vector2(0.5, 0.5));
  const tubeScrollTarget = useRef(0);
  const tubeSpinVelocity = useRef(0);
  const tubeNaturalDir = useRef(1);
  const tubeAngle = useRef(0);

  const tubeRows = 5;
  const tubeCols = 12;

  const baseSpeedRef = useRef(0.25);
  const hoverSlowdownEnabledRef = useRef(true);
  const hoverSlowdownScaleRef = useRef(0.35);
  const rotationSpeedScaleTargetRef = useRef(1);
  const rotationSpeedScaleLerpRef = useRef(0.12);

  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

    const tooltipElRef = useRef<HTMLDivElement | null>(null);
    const tooltipTarget = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const tooltipCurrent = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const tooltipRaf = useRef<number | null>(null);

    const cursorElRef = useRef<HTMLDivElement | null>(null);
    const cursorTarget = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const cursorCurrent = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const cursorActive = useRef(false);
    const cursorRaf = useRef<number | null>(null);

  const setTooltipFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    tooltipTarget.current = { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

    useEffect(() => {
      const tick = () => {
        const el = tooltipElRef.current;
        if (el) {
          const lerp = 0.18;
          tooltipCurrent.current.x += (tooltipTarget.current.x - tooltipCurrent.current.x) * lerp;
          tooltipCurrent.current.y += (tooltipTarget.current.y - tooltipCurrent.current.y) * lerp;

          const x = tooltipCurrent.current.x + 12;
          const y = tooltipCurrent.current.y - 18;
          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        }

        tooltipRaf.current = requestAnimationFrame(tick);
      };

      tooltipRaf.current = requestAnimationFrame(tick);
      return () => {
        if (tooltipRaf.current != null) cancelAnimationFrame(tooltipRaf.current);
      };
    }, []);

    useEffect(() => {
      const tick = () => {
        const el = cursorElRef.current;
        if (el) {
          const lerp = 0.14;
          cursorCurrent.current.x += (cursorTarget.current.x - cursorCurrent.current.x) * lerp;
          cursorCurrent.current.y += (cursorTarget.current.y - cursorCurrent.current.y) * lerp;

          const x = cursorCurrent.current.x + 8;
          const y = cursorCurrent.current.y + 8;
          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
          el.style.opacity = cursorActive.current ? "1" : "0";
        }

        cursorRaf.current = requestAnimationFrame(tick);
      };

      cursorRaf.current = requestAnimationFrame(tick);
      return () => {
        if (cursorRaf.current != null) cancelAnimationFrame(cursorRaf.current);
      };
    }, []);

    const onImageHoverStart = useCallback(
      (projectName: string, event: ThreeEvent<PointerEvent>) => {
        setHoveredProject(projectName);
        setTooltipFromClientPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);

        if (hoverSlowdownEnabledRef.current) {
          rotationSpeedScaleTargetRef.current = hoverSlowdownScaleRef.current;
        }

        tooltipCurrent.current = { ...tooltipTarget.current };
      },
      [setTooltipFromClientPoint],
    );

    const onImageHoverMove = useCallback(
      (event: ThreeEvent<PointerEvent>) => {
        setTooltipFromClientPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
      },
      [setTooltipFromClientPoint],
    );

    const onImageHoverEnd = useCallback(() => {
      setHoveredProject(null);
      rotationSpeedScaleTargetRef.current = 1;
    }, []);

    const onPointerEnter = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      cursorTarget.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      cursorCurrent.current = { ...cursorTarget.current };
      cursorActive.current = true;
    }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      cursorTarget.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      const clampedX = Math.min(1, Math.max(0, nx));
      const clampedY = Math.min(1, Math.max(0, ny));

      const uvX = clampedX;
      const uvY = 1 - clampedY;

      const strength = 0.4;
      const cx = 0.5 + (uvX - 0.5) * strength;
      const cy = 0.5 + (uvY - 0.5) * strength;

    targetCenterUv.current.set(Math.min(1, Math.max(0, cx)), Math.min(1, Math.max(0, cy)));
  }, []);

    const onPointerLeave = useCallback(() => {
      targetCenterUv.current.set(0.5, 0.5);
      onImageHoverEnd();
      cursorActive.current = false;
    }, [onImageHoverEnd]);

    const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
      tubeScrollTarget.current += event.deltaY * 0.002;
      tubeSpinVelocity.current += event.deltaY * 0.004;

      if (event.deltaY < 0) tubeNaturalDir.current = -1;
      else if (event.deltaY > 0) tubeNaturalDir.current = 1;
    }, []);

    return (
      <div
        className="sceneRoot"
        ref={containerRef}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      >
        <Canvas
          camera={{ position: [0, 0, 6.5], fov: 50 }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0, 0);
          }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <Environment preset="studio" blur={10.5} />

            <GridPlane targetCenterUv={targetCenterUv} />

            <ImageTube
              scrollTargetRef={tubeScrollTarget}
              spinVelocityRef={tubeSpinVelocity}
              naturalDirRef={tubeNaturalDir}
              tubeAngleRef={tubeAngle}
              rotationSpeedScaleTargetRef={rotationSpeedScaleTargetRef}
              rotationSpeedScaleLerpRef={rotationSpeedScaleLerpRef}
              baseSpeedRef={baseSpeedRef}
              rows={tubeRows}
              cols={tubeCols}
              onHoverStart={onImageHoverStart}
              onHoverMove={onImageHoverMove}
              onHoverEnd={onImageHoverEnd}
            />

            <HelmetModel tubeAngleRef={tubeAngle} />
          </Suspense>
        </Canvas>

        <div className="whiteEdgeGradient" aria-hidden="true" />
        {hoveredProject && (
          <div
            className="projectTooltip"
            ref={tooltipElRef}
            role="status"
            aria-live="polite"
          >
            {hoveredProject}
          </div>
        )}

        <div className="customCursor" ref={cursorElRef} aria-hidden="true" />
        <Loader />
      </div>
    );
}

useGLTF.preload("/models/helmet.glb");

