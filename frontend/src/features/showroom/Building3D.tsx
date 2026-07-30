import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Block, Unit } from "@/lib/types";

// Unit status → window color (three.js needs hex, not CSS vars).
const STATUS_HEX: Record<string, string> = {
  free: "#1c9b54",
  hold: "#b07c08",
  reserved: "#2456c9",
  sold: "#c23838",
};

const UNIT_W = 1.0;
const FLOOR_H = 0.9;
const CORE_DEPTH = 1.3;

function Window({
  unit,
  position,
  selected,
  onSelect,
}: {
  unit: Unit;
  position: [number, number, number];
  selected: boolean;
  onSelect: (u: Unit) => void;
}) {
  const [hover, setHover] = useState(false);
  const color = STATUS_HEX[unit.status] ?? "#8aa0b8";
  return (
    <mesh
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(unit);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      <boxGeometry args={[UNIT_W * 0.8, FLOOR_H * 0.7, 0.14]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.9 : hover ? 0.55 : 0.18}
        metalness={0.2}
        roughness={0.35}
      />
    </mesh>
  );
}

function Building({
  block,
  selectedId,
  onSelect,
}: {
  block: Block;
  selectedId: number | null;
  onSelect: (u: Unit) => void;
}) {
  // Floors bottom-to-top.
  const floors = useMemo(() => [...block.floors].sort((a, b) => a.number - b.number), [block]);
  const maxUnits = floors.reduce((m, f) => Math.max(m, f.units.length), 0) || 1;

  const W = maxUnits * UNIT_W + 0.4;
  const H = floors.length * FLOOR_H;

  return (
    <group>
      {/* Building core */}
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, CORE_DEPTH]} />
        <meshStandardMaterial color="#c7d3e0" metalness={0.1} roughness={0.7} />
      </mesh>

      {/* Roof slab */}
      <mesh position={[0, H + 0.08, 0]}>
        <boxGeometry args={[W + 0.3, 0.16, CORE_DEPTH + 0.3]} />
        <meshStandardMaterial color="#10233b" metalness={0.2} roughness={0.6} />
      </mesh>

      {/* Unit windows on the front face */}
      {floors.map((floor, i) =>
        floor.units.map((unit, j) => {
          const x = (j - (floor.units.length - 1) / 2) * UNIT_W;
          const y = i * FLOOR_H + FLOOR_H / 2;
          return (
            <Window
              key={unit.id}
              unit={unit}
              position={[x, y, CORE_DEPTH / 2 + 0.06]}
              selected={selectedId === unit.id}
              onSelect={onSelect}
            />
          );
        }),
      )}

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[W * 4, W * 4]} />
        <meshStandardMaterial color="#dfe6ee" />
      </mesh>
    </group>
  );
}

export function Building3D({
  block,
  selectedId,
  onSelect,
}: {
  block: Block;
  selectedId: number | null;
  onSelect: (u: Unit) => void;
}) {
  const floors = block.floors.length || 1;
  const maxUnits = block.floors.reduce((m, f) => Math.max(m, f.units.length), 0) || 1;
  const W = maxUnits * UNIT_W;
  const H = floors * FLOOR_H;

  return (
    <Canvas
      camera={{ position: [W * 1.1, H * 0.8, W * 1.5 + 4], fov: 42 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#eaeef3"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 12, 8]} intensity={1.1} />
      <directionalLight position={[-8, 5, -6]} intensity={0.3} />
      <Building block={block} selectedId={selectedId} onSelect={onSelect} />
      <OrbitControls
        target={[0, H / 2, 0]}
        enablePan={false}
        minDistance={W * 0.8 + 2}
        maxDistance={W * 3 + 12}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
}
