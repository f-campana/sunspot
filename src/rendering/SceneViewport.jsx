import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CAMERA_PRESETS,
  FLOOR_HEIGHT,
  SAMPLE_DEBUG_COLORS,
} from "../constants.js";
import { findClosestEdge, getFacadeAccentColor } from "../geometry/facades.js";

const MARKER_COUNT = 32;

function createBuildingMesh(building) {
  const shape = new THREE.Shape();
  shape.moveTo(building.poly[0][0], -building.poly[0][1]);
  for (let index = 1; index < building.poly.length; index += 1) {
    shape.lineTo(building.poly[index][0], -building.poly[index][1]);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: building.height_m,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: building.color,
    roughness: 0.82,
    metalness: 0.03,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { building };
  return mesh;
}

function disposeMesh(mesh) {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((material) => material.dispose());
    return;
  }
  mesh.material.dispose();
}

const SceneViewport = forwardRef(function SceneViewport(
  {
    buildings,
    cameraPreset,
    debugEvaluation,
    effectiveFloor,
    onSceneReady,
    onSelectFacade,
    selectedFacade,
    showDebugPoints,
    sunInfo,
  },
  ref
) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const groupsRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const meshListRef = useRef([]);
  const meshMapRef = useRef(new Map());
  const markerPoolRef = useRef([]);
  const facadeHighlightRef = useRef(null);
  const fullHighlightRef = useRef(null);
  const lightsRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getSimulationContext() {
      return {
        meshes: meshListRef.current,
        meshById: meshMapRef.current,
        raycaster: raycasterRef.current,
      };
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    const meshMap = meshMapRef.current;
    if (!container) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#adc5d6");
    scene.fog = new THREE.FogExp2("#adc5d6", 0.0015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      46,
      container.clientWidth / container.clientHeight,
      1,
      1600
    );
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxDistance = 680;
    controls.minDistance = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.target.set(0, 14, 0);
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight("#8ca0bb", 0.28);
    const hemisphere = new THREE.HemisphereLight("#d5e1f0", "#413628", 0.22);
    const sunLight = new THREE.DirectionalLight("#fff2d4", 1.0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -320;
    sunLight.shadow.camera.right = 320;
    sunLight.shadow.camera.top = 320;
    sunLight.shadow.camera.bottom = -320;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 900;
    sunLight.shadow.bias = -0.001;
    sunLight.shadow.normalBias = 0.03;
    scene.add(ambient, hemisphere, sunLight, sunLight.target);
    lightsRef.current = {
      ambient,
      hemisphere,
      sunLight,
    };

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({
        color: "#e7ddcc",
        roughness: 0.95,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const buildingGroup = new THREE.Group();
    const contextGroup = new THREE.Group();
    const markerGroup = new THREE.Group();
    scene.add(buildingGroup, contextGroup, markerGroup);
    groupsRef.current = {
      ground,
      buildingGroup,
      contextGroup,
      markerGroup,
    };

    // Full-height building highlight — shows which facade is selected
    const fullHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: "#f6b444",
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    fullHighlight.visible = false;
    fullHighlight.renderOrder = 499;
    scene.add(fullHighlight);
    fullHighlightRef.current = fullHighlight;

    // Floor-band highlight — brighter, shows active analysis band
    const facadeHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, FLOOR_HEIGHT),
      new THREE.MeshBasicMaterial({
        color: "#f6b444",
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    facadeHighlight.visible = false;
    facadeHighlight.renderOrder = 500;
    scene.add(facadeHighlight);
    facadeHighlightRef.current = facadeHighlight;

    const markerGeometry = new THREE.SphereGeometry(0.32, 8, 6);
    for (let index = 0; index < MARKER_COUNT; index += 1) {
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({
          color: SAMPLE_DEBUG_COLORS.inactive,
          transparent: true,
          opacity: 0.65,
        })
      );
      marker.visible = false;
      marker.renderOrder = 600;
      markerGroup.add(marker);
      markerPoolRef.current.push(marker);
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    let downPosition = null;

    const onPointerDown = (event) => {
      downPosition = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event) => {
      if (!downPosition) {
        return;
      }

      const delta = Math.hypot(
        event.clientX - downPosition.x,
        event.clientY - downPosition.y
      );
      downPosition = null;
      if (delta > 5) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycasterRef.current.setFromCamera(pointer, camera);
      const hits = raycasterRef.current.intersectObjects(meshListRef.current, false);
      if (!hits.length) {
        return;
      }

      const hit = hits[0];
      const building = hit.object.userData.building;
      const worldNormal = hit.face.normal.clone();
      worldNormal
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
        .normalize();

      const edge = findClosestEdge({
        building,
        hitNormal: worldNormal,
        hitPoint: hit.point,
      });

      onSelectFacade({
        buildingId: building.id,
        edgeIndex: edge.index,
      });
    };

    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.setAnimationLoop(null);
      controls.dispose();
      markerPoolRef.current.forEach((marker) => {
        marker.material.dispose();
      });
      markerPoolRef.current = [];
      markerGeometry.dispose();

      meshListRef.current.forEach((mesh) => disposeMesh(mesh));
      meshListRef.current = [];
      meshMap.clear();

      [facadeHighlight, fullHighlight].forEach((hl) => {
        if (hl.geometry) hl.geometry.dispose();
        if (hl.material) hl.material.dispose();
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onSelectFacade]);

  useEffect(() => {
    const scene = sceneRef.current;
    const groups = groupsRef.current;
    if (!scene || !groups) {
      return;
    }

    meshListRef.current.forEach((mesh) => {
      groups.buildingGroup.remove(mesh);
      disposeMesh(mesh);
    });
    meshListRef.current = [];
    meshMapRef.current.clear();

    while (groups.contextGroup.children.length) {
      const child = groups.contextGroup.children[groups.contextGroup.children.length - 1];
      groups.contextGroup.remove(child);
      disposeMesh(child);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    buildings.forEach((building) => {
      building.poly.forEach(([x, z]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      });

      const mesh = createBuildingMesh(building);
      groups.buildingGroup.add(mesh);
      meshListRef.current.push(mesh);
      meshMapRef.current.set(building.id, mesh);
    });

    if (Number.isFinite(minX)) {
      const roadMaterial = new THREE.MeshStandardMaterial({
        color: "#a09a92",
        roughness: 0.92,
      });
      const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: "#d4ccc0",
        roughness: 0.9,
      });

      const roadWidth = maxX - minX + 92;
      const roadDepth = maxZ - minZ + 92;
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;

      // Main streets
      const strips = [
        // Horizontal streets
        { x: cx, z: minZ - 16, w: roadWidth, d: 16 },
        { x: cx, z: maxZ + 16, w: roadWidth, d: 16 },
        { x: cx, z: cz, w: roadWidth, d: 16 },
        // Vertical streets
        { x: minX - 14, z: cz, w: 12, d: roadDepth },
        { x: maxX + 14, z: cz, w: 12, d: roadDepth },
      ];

      strips.forEach((strip) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(strip.w, strip.d),
          roadMaterial.clone()
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(strip.x, 0.05, strip.z);
        mesh.receiveShadow = true;
        groups.contextGroup.add(mesh);
      });

      // Sidewalks along the main horizontal street
      const sidewalks = [
        { x: cx, z: cz - 9.5, w: roadWidth, d: 1.5 },
        { x: cx, z: cz + 9.5, w: roadWidth, d: 1.5 },
      ];
      sidewalks.forEach((sw) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(sw.w, sw.d),
          sidewalkMaterial.clone()
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(sw.x, 0.07, sw.z);
        groups.contextGroup.add(mesh);
      });
    }

    onSceneReady?.();
  }, [buildings, onSceneReady]);

  useEffect(() => {
    const preset = CAMERA_PRESETS[cameraPreset];
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!preset || !camera || !controls) {
      return;
    }

    camera.position.set(...preset.position);
    controls.target.set(...preset.target);
    controls.update();
  }, [cameraPreset]);

  useEffect(() => {
    const scene = sceneRef.current;
    const lights = lightsRef.current;
    const groups = groupsRef.current;
    if (!scene || !lights || !groups) {
      return;
    }

    const altitude = sunInfo.altitudeDegrees;
    const direction = sunInfo.direction;
    const distance = 320;

    lights.sunLight.position.set(
      direction.x * distance,
      Math.max(direction.y * distance, 3),
      direction.z * distance
    );
    lights.sunLight.target.position.set(0, 0, 0);

    const daylightFactor = Math.max(0, Math.min(1, altitude / 45));
    lights.sunLight.intensity = altitude > 0 ? 0.35 + daylightFactor * 0.85 : 0.04;
    lights.ambient.intensity = altitude > 0 ? 0.16 + daylightFactor * 0.2 : 0.12;
    lights.hemisphere.intensity = altitude > 0 ? 0.12 + daylightFactor * 0.15 : 0.08;

    if (altitude > 15) {
      scene.background.set("#b8cce0");
      scene.fog.color.set("#b8cce0");
      lights.sunLight.color.set("#fff5e0");
      groups.ground.material.color.set("#d8d0c0");
    } else if (altitude > 0) {
      scene.background.set("#c9a878");
      scene.fog.color.set("#c9a878");
      lights.sunLight.color.set("#ffccaa");
      groups.ground.material.color.set("#c8b898");
    } else {
      scene.background.set("#101828");
      scene.fog.color.set("#101828");
      lights.sunLight.color.set("#334466");
      groups.ground.material.color.set("#1a1e2a");
    }

    const selectedBuildingId = selectedFacade?.buildingId;

    meshListRef.current.forEach((mesh) => {
      const base = new THREE.Color(mesh.userData.building.color);
      const isSelected = mesh.userData.building.id === selectedBuildingId;

      if (altitude <= 0) {
        mesh.material.color.copy(base).multiplyScalar(0.34);
        return;
      }

      let litSamples = 0;
      [0.35, 0.78].forEach((heightFactor) => {
        const point = new THREE.Vector3(
          mesh.userData.building.centroid.x,
          mesh.userData.building.height_m * heightFactor,
          mesh.userData.building.centroid.z
        );
        raycasterRef.current.set(point, direction);
        raycasterRef.current.near = 1;
        raycasterRef.current.far = 800;
        const occluded = raycasterRef.current
          .intersectObjects(
            meshListRef.current.filter((candidate) => candidate !== mesh),
            false
          )
          .length > 0;
        if (!occluded) {
          litSamples += 1;
        }
      });

      const warmth = litSamples / 2;
      const warmTint = new THREE.Color("#fff0d0");
      const coolTint = new THREE.Color("#b0b8c8");

      if (selectedBuildingId && !isSelected) {
        // Dim + desaturate non-selected buildings for cooler receding look
        mesh.material.color
          .copy(base.clone().multiplyScalar(0.42))
          .lerp(coolTint, 0.18)
          .lerp(warmTint, warmth * 0.06);
      } else {
        mesh.material.color
          .copy(base.clone().multiplyScalar(0.7))
          .lerp(warmTint, warmth * 0.3);
      }
    });
  }, [sunInfo, selectedFacade]);

  useEffect(() => {
    const highlight = facadeHighlightRef.current;
    const fullHL = fullHighlightRef.current;
    if (!highlight || !fullHL) {
      return;
    }
    if (!selectedFacade) {
      highlight.visible = false;
      fullHL.visible = false;
      return;
    }

    const selectedBuilding = buildings.find(
      (building) => building.id === selectedFacade.buildingId
    );
    const selectedEdge = selectedBuilding?.edges.find(
      (edge) => edge.index === selectedFacade.edgeIndex
    );

    if (!selectedBuilding || !selectedEdge) {
      highlight.visible = false;
      fullHL.visible = false;
      return;
    }

    // Use facade accent color based on direction
    const accentColor = getFacadeAccentColor(selectedEdge);
    const offset = 0.32;

    // Full-height highlight covering entire building facade
    fullHL.visible = true;
    fullHL.geometry.dispose();
    fullHL.geometry = new THREE.PlaneGeometry(selectedEdge.len, selectedBuilding.height_m);
    fullHL.material.color.set(accentColor);
    const fullY = selectedBuilding.height_m / 2;
    fullHL.position.set(
      selectedEdge.midX + selectedEdge.nx * offset,
      fullY,
      selectedEdge.midZ + selectedEdge.nz * offset
    );
    fullHL.lookAt(
      selectedEdge.midX + selectedEdge.nx * (offset + 1),
      fullY,
      selectedEdge.midZ + selectedEdge.nz * (offset + 1)
    );

    // Floor-band highlight — brighter band at the analyzed floor
    highlight.visible = true;
    highlight.geometry.dispose();
    highlight.geometry = new THREE.PlaneGeometry(selectedEdge.len, FLOOR_HEIGHT);
    highlight.material.color.set(accentColor);
    const y = effectiveFloor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
    highlight.position.set(
      selectedEdge.midX + selectedEdge.nx * (offset - 0.01),
      y,
      selectedEdge.midZ + selectedEdge.nz * (offset - 0.01)
    );
    highlight.lookAt(
      selectedEdge.midX + selectedEdge.nx * (offset + 1),
      y,
      selectedEdge.midZ + selectedEdge.nz * (offset + 1)
    );
  }, [buildings, effectiveFloor, selectedFacade]);

  useEffect(() => {
    markerPoolRef.current.forEach((marker) => {
      marker.visible = false;
    });

    if (!showDebugPoints || !debugEvaluation) {
      return;
    }

    debugEvaluation.samples.forEach((sample, index) => {
      const marker = markerPoolRef.current[index];
      if (!marker) {
        return;
      }

      marker.visible = true;
      marker.position.copy(sample.point);
      const state = debugEvaluation.sampleStates[index];
      marker.material.color.set(SAMPLE_DEBUG_COLORS[state] || SAMPLE_DEBUG_COLORS.inactive);
      marker.material.opacity = state === "lit" ? 0.7 : state === "blocked" ? 0.5 : 0.25;
    });
  }, [debugEvaluation, showDebugPoints]);

  return <div className="scene-viewport" ref={containerRef} />;
});

export default SceneViewport;
