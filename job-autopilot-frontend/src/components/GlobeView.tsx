import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface GlobeViewProps {
  countries: Array<{ country: string; n: number }>;
  onSelectCountry?: (code: string) => void;
  focusedCountry?: string | null;
}

const PLACE: Record<string, [number, number]> = {
  gb: [54, -2], us: [39, -98], de: [51, 10], in: [22, 79], fr: [46.5, 2.5],
  sg: [1.35, 103.8], ie: [53.3, -8], jp: [36, 138], ca: [57, -101], ch: [46.8, 8.2],
  nl: [52.2, 5.3], se: [62, 15], es: [40, -3.7], pl: [52, 19], kr: [36.5, 127.8],
  au: [-25, 134], dk: [56, 10], ae: [24, 54], br: [-10, -52], remote: [0, 0],
};
const HOME: [number, number] = [26.24, 73.02]; // Jodhpur base

export const GlobeView: React.FC<GlobeViewProps> = ({
  countries,
  onSelectCountry,
  focusedCountry,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    const world = new THREE.Group();
    scene.add(world);

    const vec = (lat: number, lng: number, r: number) => {
      const phi = ((90 - lat) * Math.PI) / 180;
      const th = ((lng + 180) * Math.PI) / 180;
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(th),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(th)
      );
    };

    // Body sphere with atmosphere rim
    const sphereGeo = new THREE.SphereGeometry(0.995, 48, 48);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x071524,
      wireframe: false,
    });
    world.add(new THREE.Mesh(sphereGeo, sphereMat));

    // Atmosphere halo
    const haloGeo = new THREE.SphereGeometry(1.08, 48, 48);
    const haloMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 n;
        void main() {
          n = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 n;
        void main() {
          float i = pow(max(0.0, 0.65 - dot(n, vec3(0, 0, 1.0))), 3.0);
          gl_FragColor = vec4(0.37, 0.89, 0.82, 1.0) * i * 1.2;
        }
      `,
    });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // Graticule grid lines
    const gridLines: number[] = [];
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lng = -180; lng < 180; lng += 6) {
        gridLines.push(...vec(lat, lng, 1.001).toArray(), ...vec(lat, lng + 6, 1.001).toArray());
      }
    }
    for (let lng = -180; lng < 180; lng += 30) {
      for (let lat = -88; lat < 88; lat += 6) {
        gridLines.push(...vec(lat, lng, 1.001).toArray(), ...vec(lat + 6, lng, 1.001).toArray());
      }
    }
    const gridGeo = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridLines, 3)
    );
    const gridMat = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.16 })
    );
    world.add(gridMat);

    // Home marker (Jodhpur)
    const homeV = vec(HOME[0], HOME[1], 1.004);
    const ringGeo = new THREE.RingGeometry(0.03, 0.04, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x5fe3d0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const homeRing = new THREE.Mesh(ringGeo, ringMat);
    homeRing.position.copy(homeV);
    homeRing.lookAt(homeV.clone().multiplyScalar(2));
    world.add(homeRing);

    // Orbit Satellite Line
    const orbit = new THREE.Group();
    orbit.rotation.set(1.15, 0, 0.35);
    scene.add(orbit);
    const orbitPts: number[] = [];
    for (let a = 0; a < 360; a += 4) {
      const r = 1.35;
      orbitPts.push(
        Math.cos((a * Math.PI) / 180) * r,
        Math.sin((a * Math.PI) / 180) * r,
        0,
        Math.cos(((a + 4) * Math.PI) / 180) * r,
        Math.sin(((a + 4) * Math.PI) / 180) * r,
        0
      );
    }
    const orbitGeo = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(orbitPts, 3)
    );
    orbit.add(
      new THREE.LineSegments(
        orbitGeo,
        new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.35 })
      )
    );

    // Country Beams & Arc Markers
    const beamsGroup = new THREE.Group();
    world.add(beamsGroup);

    countries.slice(0, 15).forEach((item) => {
      const code = item.country.toLowerCase();
      const coords = PLACE[code];
      if (!coords) return;
      const pos = vec(coords[0], coords[1], 1.002);
      const top = vec(coords[0], coords[1], 1.08 + Math.min(item.n * 0.002, 0.2));

      // vertical beam
      const beamGeo = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([...pos.toArray(), ...top.toArray()], 3)
      );
      const beamMat = new THREE.Line(
        beamGeo,
        new THREE.LineBasicMaterial({ color: 0x5fe3d0, transparent: true, opacity: 0.8 })
      );
      beamsGroup.add(beamMat);

      // top dot
      const dotGeo = new THREE.SphereGeometry(0.015, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.copy(top);
      beamsGroup.add(dotMesh);
    });

    // Interaction & Animation
    let reqId: number;
    let rotX = 0.42;
    let rotY = 0;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => {
      isDragging = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      rotY += (e.clientX - lastX) * 0.006;
      rotX = Math.max(-0.9, Math.min(0.9, rotX + (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
    };

    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (!isDragging) {
        rotY += 0.002;
      }
      world.rotation.set(rotX, rotY, 0);
      orbit.rotation.z += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [countries]);

  return (
    <div className="relative w-full h-[360px] flex items-center justify-center select-none">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-2 left-3 font-mono text-[11px] text-faint pointer-events-none flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-aqua" />
        <span>Jodhpur Home Base · Real-time Global Radar</span>
      </div>
    </div>
  );
};
