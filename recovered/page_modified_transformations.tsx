"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  RotateCcw,
  FlipHorizontal,
  Maximize2,
  Shuffle,
  CheckCircle2,
  XCircle,
  BookOpen,
  Target,
  Move,
  Eye,
  ArrowRight,
  Calculator,
  ZoomIn,
  ZoomOut,
  Layers,
  GripVertical,
  Brain,
  PenTool,
  ClipboardList,
  Users,
  BarChart3,
  FileText,
  Lightbulb,
  CheckSquare,
  Flame,
  Star,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  createOrUpdateStudent, 
  recordPracticeAttempt, 
  getClassStats, 
  getAllStudents,
  type StudentData,
  type PracticeAttempt
} from "@/lib/firebase";

const GRID_MIN = -8;
const GRID_MAX = 8;
const SIZE = 560;
const PAD = 40;
const STEP = (SIZE - PAD * 2) / (GRID_MAX - GRID_MIN);
const COLORS = {
  original: "#2563eb",
  image: "#f97316",
  guide: "#16a34a",
  center: "#dc2626",
  reflection: "#7c3aed",
  translation: "#0891b2",
  intermediate: "#8b5cf6",
};

type Point = [number, number];

function ColumnVector({
  vector,
  label = "",
}: {
  vector: [React.ReactNode, React.ReactNode];
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" aria-label={`Column vector ${String(vector[0])}, ${String(vector[1])}`}>
      {label && <span>{label}</span>}
      <span className="inline-flex items-center font-serif leading-none text-current">
        <span className="select-none text-[2.1em] font-light leading-[0.72]">(</span>
        <span className="mx-0.5 inline-grid min-w-[1.25rem] grid-rows-2 justify-items-center font-mono text-[0.9em] leading-[1.05]">
          <span>{vector[0]}</span>
          <span>{vector[1]}</span>
        </span>
        <span className="select-none text-[2.1em] font-light leading-[0.72]">)</span>
      </span>
    </span>
  );
}

/** Render only transformation-vector notation as a vertical column vector.
 * Coordinate points such as A(2, 3) remain ordinary ordered pairs.
 */
function TextWithColumnVectors({ text }: { text: string }) {
  const pattern = /(\b(?:vector|translation|translate by|T)\s*(?:is\s*)?)\(\s*(-?\d+(?:\.\d+)?|[ab])\s*,\s*(-?\d+(?:\.\d+)?|[ab])\s*\)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const prefix = match[1];
    const first = /^-?\d+(?:\.\d+)?$/.test(match[2]) ? Number(match[2]) : match[2];
    const second = /^-?\d+(?:\.\d+)?$/.test(match[3]) ? Number(match[3]) : match[3];
    parts.push(
      <React.Fragment key={`vector-text-${key++}`}>
        {prefix}
        <ColumnVector vector={[first, second]} />
      </React.Fragment>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts.length ? parts : text}</>;
}

function toPx([x, y]: Point): Point {
  return [PAD + (x - GRID_MIN) * STEP, SIZE - PAD - (y - GRID_MIN) * STEP];
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function fmtPoint([x, y]: Point) {
  return `(${clean(x)}, ${clean(y)})`;
}

function clean(n: number) {
  if (Number.isInteger(n)) return n;
  return Number(n.toFixed(2));
}

function add([a, b]: Point, [c, d]: Point): Point {
  return [a + c, b + d];
}
function sub([a, b]: Point, [c, d]: Point): Point {
  return [a - c, b - d];
}
function mul([a, b]: Point, k: number): Point {
  return [a * k, b * k];
}

// Translation: move by vector
function translatePoint(p: Point, vector: Point): Point {
  return add(p, vector);
}

// Reflection across line y = mx + c (general form)
function reflectPointGeneral(p: Point, m: number, c: number): Point {
  const [x, y] = p;
  if (!isFinite(m)) {
    return [2 * c - x, y];
  }
  const d = (x + (y - c) * m) / (1 + m * m);
  const xPrime = 2 * d - x;
  const yPrime = 2 * d * m - y + 2 * c;
  return [xPrime, yPrime];
}

// Alias for reflectPointGeneral
const reflectPointInLine = reflectPointGeneral;

// Named reflection lines
function reflectPoint(p: Point, line: string): Point {
  const [x, y] = p;
  if (line === "x-axis") return [x, -y];
  if (line === "y-axis") return [-x, y];
  if (line === "y=x") return [y, x];
  if (line === "y=-x") return [-y, -x];
  // Vertical lines x = k
  if (line.startsWith("x=")) {
    const k = parseFloat(line.slice(2));
    return [2 * k - x, y];
  }
  // Horizontal lines y = k
  if (line.startsWith("y=") && !line.includes("x")) {
    const k = parseFloat(line.slice(2));
    return [x, 2 * k - y];
  }
  return p;
}

function rotatePoint(p: Point, angle: number, center: Point): Point {
  const [x, y] = sub(p, center);
  let q: Point;
  if (angle === 90) q = [-y, x];
  else if (angle === -90) q = [y, -x];
  else q = [-x, -y];
  return add(q, center);
}

function enlargePoint(p: Point, scale: number, center: Point): Point {
  return add(center, mul(sub(p, center), scale));
}

function polygonPath(points: Point[], localToPx: (p: Point) => Point) {
  return (
    points
      .map((p, i) => {
        const [x, y] = localToPx(p);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ") + " Z"
  );
}

// Algebraic method explanations
function getAlgebraicMethod(
  type: string,
  params: {
    line?: string;
    lineM?: number;
    lineC?: number;
    angle?: number;
    center?: Point;
    scale?: number;
    vector?: Point;
  },
  original: Point,
  result: Point
): { steps: string[]; formula: string } {
  const [x, y] = original;
  const [xP, yP] = result;

  if (type === "translation") {
    const [vx, vy] = params.vector!;
    return {
      formula: `(x, y) -> (x + ${vx}, y + ${vy})`,
      steps: [
        `Start with point (${x}, ${y})`,
        `Add vector (${vx}, ${vy})`,
        `x' = ${x} + ${vx} = ${xP}`,
        `y' = ${y} + ${vy} = ${yP}`,
        `Image: (${xP}, ${yP})`,
      ],
    };
  }

  if (type === "reflection") {
    if (params.line === "x-axis") {
      return {
        formula: "(x, y) -> (x, -y)",
        steps: [
          `Start with point (${x}, ${y})`,
          `Reflecting in the x-axis: keep x, negate y`,
          `x' = ${x}`,
          `y' = -(${y}) = ${-y}`,
          `Image: (${xP}, ${yP})`,
        ],
      };
    }
    if (params.line === "y-axis") {
      return {
        formula: "(x, y) -> (-x, y)",
        steps: [
          `Start with point (${x}, ${y})`,
          `Reflecting in the y-axis: negate x, keep y`,
          `x' = -(${x}) = ${-x}`,
          `y' = ${y}`,
          `Image: (${xP}, ${yP})`,
        ],
      };
    }
    if (params.line === "y=x") {
      return {
        formula: "(x, y) -> (y, x)",
        steps: [
          `Start with point (${x}, ${y})`,
          `Reflecting in y = x: swap x and y`,
          `x' = ${y}`,
          `y' = ${x}`,
          `Image: (${xP}, ${yP})`,
        ],
      };
    }
    if (params.line === "y=-x") {
      return {
        formula: "(x, y) -> (-y, -x)",
        steps: [
          `Start with point (${x}, ${y})`,
          `Reflecting in y = -x: swap and negate both`,
          `x' = -(${y}) = ${-y}`,
          `y' = -(${x}) = ${-x}`,
          `Image: (${xP}, ${yP})`,
        ],
      };
    }
    const m = params.lineM!;
    const c = params.lineC!;
    if (!isFinite(m)) {
      return {
        formula: `x = ${c}: (x, y) -> (2*${c} - x, y)`,
        steps: [
          `Start with point (${x}, ${y})`,
          `Reflecting in vertical line x = ${c}`,
          `x' = 2(${c}) - ${x} = ${clean(xP)}`,
          `y' = ${y}`,
          `Image: (${clean(xP)}, ${clean(yP)})`,
        ],
      };
    }
    return {
      formula: `y = ${m}x + ${c}`,
      steps: [
        `Start with point (${x}, ${y})`,
        `Line: y = ${m}x + ${c}`,
        `d = (x + (y - c)m) / (1 + m^2)`,
        `d = (${x} + (${y} - ${c})(${m})) / (1 + ${m}^2) = ${clean((x + (y - c) * m) / (1 + m * m))}`,
        `x' = 2d - x = ${clean(xP)}`,
        `y' = 2dm - y + 2c = ${clean(yP)}`,
        `Image: (${clean(xP)}, ${clean(yP)})`,
      ],
    };
  }

  if (type === "rotation") {
    const [cx, cy] = params.center!;
    const angle = params.angle!;
    const relX = x - cx;
    const relY = y - cy;

    if (angle === 90) {
      return {
        formula: `90 deg anticlockwise about (${cx}, ${cy}): (x-a, y-b) -> (-(y-b), x-a)`,
        steps: [
          `Start with point (${x}, ${y}), centre (${cx}, ${cy})`,
          `Translate to origin: (${x} - ${cx}, ${y} - ${cy}) = (${relX}, ${relY})`,
          `Rotate 90 deg anticlockwise: (x, y) -> (-y, x)`,
          `(${relX}, ${relY}) -> (${-relY}, ${relX})`,
          `Translate back: (${-relY} + ${cx}, ${relX} + ${cy}) = (${xP}, ${yP})`,
        ],
      };
    }
    if (angle === -90) {
      return {
        formula: `90 deg clockwise about (${cx}, ${cy}): (x-a, y-b) -> (y-b, -(x-a))`,
        steps: [
          `Start with point (${x}, ${y}), centre (${cx}, ${cy})`,
          `Translate to origin: (${x} - ${cx}, ${y} - ${cy}) = (${relX}, ${relY})`,
          `Rotate 90 deg clockwise: (x, y) -> (y, -x)`,
          `(${relX}, ${relY}) -> (${relY}, ${-relX})`,
          `Translate back: (${relY} + ${cx}, ${-relX} + ${cy}) = (${xP}, ${yP})`,
        ],
      };
    }
    return {
      formula: `180 deg about (${cx}, ${cy}): (x, y) -> (2a - x, 2b - y)`,
      steps: [
        `Start with point (${x}, ${y}), centre (${cx}, ${cy})`,
        `For 180 deg rotation: x' = 2a - x, y' = 2b - y`,
        `x' = 2(${cx}) - ${x} = ${xP}`,
        `y' = 2(${cy}) - ${y} = ${yP}`,
        `Image: (${xP}, ${yP})`,
      ],
    };
  }

  // Enlargement
  const [cx, cy] = params.center!;
  const k = params.scale!;
  return {
    formula: `Scale factor ${k} from (${cx}, ${cy})`,
    steps: [
      `Start with point (${x}, ${y}), centre (${cx}, ${cy})`,
      `Find vector from centre: (${x} - ${cx}, ${y} - ${cy}) = (${x - cx}, ${y - cy})`,
      `Multiply by scale factor ${k}:`,
      `(${k} * ${x - cx}, ${k} * ${y - cy}) = (${clean(k * (x - cx))}, ${clean(k * (y - cy))})`,
      `Add back to centre: (${cx} + ${clean(k * (x - cx))}, ${cy} + ${clean(k * (y - cy))})`,
      `Image: (${clean(xP)}, ${clean(yP)})`,
    ],
  };
}

const sections = [
  { id: "translation", title: "T: Translation", icon: ArrowRight, color: "bg-cyan-500" },
  { id: "reflection", title: "M: Reflection", icon: FlipHorizontal, color: "bg-violet-500" },
  { id: "rotation", title: "R: Rotation", icon: RotateCcw, color: "bg-blue-500" },
  { id: "enlargement", title: "E: Enlargement", icon: Maximize2, color: "bg-orange-500" },
  { id: "composition", title: "Composition", icon: Layers, color: "bg-emerald-500" },
  { id: "reasoning", title: "Reasoning", icon: Brain, color: "bg-pink-500" },
  { id: "algebra", title: "Algebra", icon: PenTool, color: "bg-indigo-500" },
  { id: "practice", title: "Practice", icon: Target, color: "bg-rose-500" },
  { id: "assessment", title: "Assessment", icon: ClipboardList, color: "bg-amber-500" },
];

const starterShape: Point[] = [
  [1, 1],
  [3, 1],
  [2, 4],
];

const workedExample: Point[] = [
  [2, 1],
  [4, 1],
  [3, 3],
];

// Gamification State (persisted in localStorage)
function useGamification() {
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [achievements, setAchievements] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("transformations_gamification");
    if (saved) {
      const data = JSON.parse(saved);
      setXp(data.xp || 0);
      setStreak(data.streak || 0);
      setAchievements(data.achievements || []);
    }
  }, []);

  const addXp = useCallback((amount: number) => {
    setXp((prev) => {
      const newXp = prev + amount;
      localStorage.setItem("transformations_gamification", JSON.stringify({ xp: newXp, streak, achievements }));
      return newXp;
    });
  }, [streak, achievements]);

  const incrementStreak = useCallback(() => {
    setStreak((prev) => {
      const newStreak = prev + 1;
      localStorage.setItem("transformations_gamification", JSON.stringify({ xp, streak: newStreak, achievements }));
      return newStreak;
    });
  }, [xp, achievements]);

  const resetStreak = useCallback(() => {
    setStreak(0);
    localStorage.setItem("transformations_gamification", JSON.stringify({ xp, streak: 0, achievements }));
  }, [xp, achievements]);

  const unlockAchievement = useCallback((id: string) => {
    if (!achievements.includes(id)) {
      const newAchievements = [...achievements, id];
      setAchievements(newAchievements);
      localStorage.setItem("transformations_gamification", JSON.stringify({ xp, streak, achievements: newAchievements }));
    }
  }, [xp, streak, achievements]);

  return { xp, streak, achievements, addXp, incrementStreak, resetStreak, unlockAchievement };
}

// Gamification Display Component
function GamificationBar({ xp, streak }: { xp: number; streak: number }) {
  const level = Math.floor(xp / 100) + 1;
  const xpProgress = xp % 100;

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 text-white">
      <div className="flex items-center gap-1.5">
        <Star className="h-4 w-4 text-yellow-400" />
        <span className="text-sm font-bold">Level {level}</span>
      </div>
      <div className="flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all" style={{ width: `${xpProgress}%` }} />
        </div>
        <span className="text-xs text-slate-400">{xpProgress}/100 XP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-bold">{streak}</span>
      </div>
    </div>
  );
}

// Written Description Generator
function getTransformationDescription(type: string, params: Record<string, unknown>, points: Point[], imagePoints: Point[]): string {
  const [p0] = points;
  const [img0] = imagePoints;
  
  switch (type) {
    case "translation": {
      const v = params.vector as Point;
      return `Translation by vector (${v[0]}, ${v[1]}). Each point moves ${Math.abs(v[0])} unit${Math.abs(v[0]) !== 1 ? "s" : ""} ${v[0] >= 0 ? "right" : "left"} and ${Math.abs(v[1])} unit${Math.abs(v[1]) !== 1 ? "s" : ""} ${v[1] >= 0 ? "up" : "down"}. The shape keeps its size, shape, and orientation.`;
    }
    case "reflection": {
      const line = params.line as string | undefined;
      const lineM = params.lineM as number | undefined;
      const lineC = params.lineC as number | undefined;
      if (line) {
        return `Reflection in the ${line}. Each point is mapped to its mirror image across the line. The shape is congruent but has reversed orientation (like looking in a mirror).`;
      }
      if (lineM !== undefined) {
        const lineEq = !isFinite(lineM) ? `x = ${lineC}` : lineC === 0 ? `y = ${lineM}x` : `y = ${lineM}x ${lineC >= 0 ? "+" : ""}${lineC}`;
        return `Reflection in the line ${lineEq}. Each point is equidistant from the mirror line, perpendicular to it. The image is congruent with reversed orientation.`;
      }
      return "Reflection across a mirror line. The image is a mirror copy of the original.";
    }
    case "rotation": {
      const angle = params.angle as number;
      const center = params.center as Point;
      const dir = angle > 0 ? "anticlockwise" : "clockwise";
      return `Rotation of ${Math.abs(angle)} degrees ${dir} about the point (${center[0]}, ${center[1]}). Each point turns around the centre, maintaining its distance from it. The shape is congruent and keeps its orientation.`;
    }
    case "enlargement": {
      const scale = params.scale as number;
      const center = params.center as Point;
      const sizeChange = scale > 1 ? "larger" : scale < 1 && scale > 0 ? "smaller" : scale < 0 ? "inverted" : "unchanged";
      return `Enlargement with scale factor ${scale} from centre (${center[0]}, ${center[1]}). The image is ${Math.abs(scale)} times the original size${scale < 0 ? " and inverted through the centre" : ""}. The shape is similar (same shape, different size).`;
    }
    default:
      return "Apply the transformation to each point.";
  }
}

// Transformation Description Card
function TransformationDescriptionCard({ type, params, points, imagePoints }: { type: string; params: Record<string, unknown>; points: Point[]; imagePoints: Point[] }) {
  const description = getTransformationDescription(type, params, points, imagePoints);
  
  return (
    <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50 p-3">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-bold uppercase text-blue-800">Current Transformation</h4>
          <p className="mt-1 text-sm text-blue-700"><TextWithColumnVectors text={description} /></p>
        </div>
      </div>
    </div>
  );
}

// Calculate dynamic grid range based on all points
function calculateGridRange(allPoints: Point[]): { min: number; max: number } {
  if (allPoints.length === 0) return { min: -8, max: 8 };
  
  let minVal = 0;
  let maxVal = 0;
  
  for (const [x, y] of allPoints) {
    minVal = Math.min(minVal, x, y);
    maxVal = Math.max(maxVal, x, y);
  }
  
  // Add padding and ensure symmetric around origin for most cases
  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
  const range = Math.max(Math.ceil(absMax * 1.3), 4); // At least 4, with 30% padding
  
  return { min: -range, max: range };
}

// Coordinate Comparison Component
function CoordinateComparison({
  points,
  imagePoints,
  labels = ["A", "B", "C"],
  intermediatePoints,
}: {
  points: Point[];
  imagePoints: Point[];
  labels?: string[];
  intermediatePoints?: Point[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-bold text-slate-900">Coordinate Comparison</h4>
      <div className="grid gap-2">
        {points.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
            <div className="min-w-[100px]">
              <span className="text-xs font-medium text-slate-500">Original</span>
              <div className="text-lg font-bold text-blue-600">
                {labels[i]} = {fmtPoint(p)}
              </div>
            </div>
            {intermediatePoints && (
              <>
                <ArrowRight className="h-4 w-4 text-slate-400" />
                <div className="min-w-[100px]">
                  <span className="text-xs font-medium text-slate-500">After T1</span>
                  <div className="text-lg font-bold text-violet-600">
                    {labels[i]}'' = {fmtPoint(intermediatePoints[i])}
                  </div>
                </div>
              </>
            )}
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <div className="min-w-[100px]">
              <span className="text-xs font-medium text-slate-500">Image</span>
              <div className="text-lg font-bold text-orange-600">
                {labels[i]}' = {fmtPoint(imagePoints[i])}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GridProps {
  points?: Point[];
  imagePoints?: Point[];
  intermediatePoints?: Point[];
  center?: Point | null;
  draggableCenter?: boolean;
  onCenterDrag?: (p: Point) => void;
  reflectionLine?: string | null;
  customLine?: { m: number; c: number } | null;
  translationVector?: Point | null;
  draggable?: boolean;
  onPointDrag?: (index: number, point: Point) => void;
  title?: React.ReactNode;
  showLabels?: boolean;
  targetPoints?: Point[];
  onTargetDrag?: (index: number, point: Point) => void;
  feedback?: React.ReactNode;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showZoomControls?: boolean;
  draggableLine?: boolean;
  linePoint1?: Point;
  linePoint2?: Point;
  onLineDrag?: (p1: Point, p2: Point) => void;
  showSteps?: number;
  highlightPointIndex?: number; // Which point to highlight with arrow
  showArrowForPoint?: number; // Show transformation arrow only for this point index
  customGridRange?: { min: number; max: number }; // Custom axis range instead of zoom
}

function Grid({
  points,
  imagePoints,
  intermediatePoints,
  center,
  draggableCenter = false,
  onCenterDrag,
  reflectionLine,
  customLine,
  translationVector,
  draggable = false,
  onPointDrag,
  title,
  showLabels = true,
  targetPoints = [],
  onTargetDrag,
  feedback,
  zoom = 1,
  onZoomChange,
  showZoomControls = false,
  draggableLine = false,
  linePoint1,
  linePoint2,
  onLineDrag,
  showSteps,
  highlightPointIndex,
  showArrowForPoint,
  customGridRange,
}: GridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [dragLinePoint, setDragLinePoint] = useState<1 | 2 | null>(null);
  const [dragCenter, setDragCenter] = useState(false);

  // Use custom range if provided, otherwise calculate from zoom
  const gridMin = customGridRange ? customGridRange.min : -Math.ceil(8 / zoom);
  const gridMax = customGridRange ? customGridRange.max : Math.ceil(8 / zoom);
  const step = (SIZE - PAD * 2) / (gridMax - gridMin);

  const localToPx = useCallback(
    ([x, y]: Point): Point => {
      return [PAD + (x - gridMin) * step, SIZE - PAD - (y - gridMin) * step];
    },
    [gridMin, step]
  );

  const localFromPx = useCallback(
    (px: number, py: number): Point => {
      const x = gridMin + (px - PAD) / step;
      const y = gridMin + (SIZE - PAD - py) / step;
      return [Math.round(x), Math.round(y)];
    },
    [gridMin, step]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null && dragTargetIndex === null && dragLinePoint === null && !dragCenter) return;
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const scaleX = SIZE / rect.width;
      const scaleY = SIZE / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const [gx, gy] = localFromPx(px, py);
      const next: Point = [clamp(gx, gridMin, gridMax), clamp(gy, gridMin, gridMax)];

      if (dragIndex !== null && onPointDrag) {
        onPointDrag(dragIndex, next);
      }
      if (dragTargetIndex !== null && onTargetDrag) {
        onTargetDrag(dragTargetIndex, next);
      }
      if (dragLinePoint !== null && onLineDrag && linePoint1 && linePoint2) {
        if (dragLinePoint === 1) {
          onLineDrag(next, linePoint2);
        } else {
          onLineDrag(linePoint1, next);
        }
      }
      if (dragCenter && onCenterDrag) {
        onCenterDrag(next);
      }
    },
    [dragIndex, dragTargetIndex, dragLinePoint, dragCenter, onPointDrag, onTargetDrag, onLineDrag, onCenterDrag, localFromPx, gridMin, gridMax, linePoint1, linePoint2]
  );

  const handlePointerUp = useCallback(() => {
    setDragIndex(null);
    setDragTargetIndex(null);
    setDragLinePoint(null);
    setDragCenter(false);
  }, []);

  // Determine what to show based on showSteps
  const visiblePoints = points;
  const visibleImage = showSteps === undefined || showSteps >= 2 ? imagePoints : [];
  const visibleIntermediate = showSteps === undefined || showSteps >= 1 ? intermediatePoints : [];

  return (
    <div className="w-full">
      {title && (
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>{title}</span>
          {feedback}
        </div>
      )}
      {showZoomControls && onZoomChange && (
        <div className="mb-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            disabled={zoom <= 0.25}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <input
              type="range"
              min="0.25"
              max="2"
              step="0.25"
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
            onClick={() => onZoomChange(Math.min(2, zoom + 0.25))}
            disabled={zoom >= 2}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="min-w-[3.5rem] text-xs text-slate-500">
            {zoom < 1 ? `${Math.round(zoom * 100)}%` : `${zoom.toFixed(1)}x`}
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full touch-none rounded-2xl border bg-white shadow-sm select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Grid lines */}
        {Array.from({ length: gridMax - gridMin + 1 }, (_, i) => gridMin + i).map((n) => {
          const [x1] = localToPx([n, gridMin]);
          const [, y1] = localToPx([gridMin, n]);
          return (
            <g key={n}>
              <line x1={x1} y1={PAD} x2={x1} y2={SIZE - PAD} stroke={n === 0 ? "#0f172a" : "#e2e8f0"} strokeWidth={n === 0 ? 2 : 1} />
              <line x1={PAD} y1={y1} x2={SIZE - PAD} y2={y1} stroke={n === 0 ? "#0f172a" : "#e2e8f0"} strokeWidth={n === 0 ? 2 : 1} />
              {n !== 0 && Math.abs(n) % (zoom >= 1 ? 2 : 4) === 0 && (
                <>
                  <text x={x1 - 4} y={SIZE - PAD + 16} fontSize="10" fill="#64748b" textAnchor="middle">{n}</text>
                  <text x={PAD - 14} y={y1 + 4} fontSize="10" fill="#64748b" textAnchor="middle">{n}</text>
                </>
              )}
            </g>
          );
        })}

        {/* Translation vector arrow */}
        {translationVector && visiblePoints && visiblePoints.length > 0 && (
          <g>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={COLORS.translation} />
              </marker>
            </defs>
            {visiblePoints.map((p, i) => {
              // Only show arrow for specific point if showArrowForPoint is set
              if (showArrowForPoint !== undefined && showArrowForPoint !== i) return null;
              const [sx, sy] = localToPx(p);
              const [ex, ey] = localToPx(add(p, translationVector));
              return (
                <line key={`vec-${i}`} x1={sx} y1={sy} x2={ex} y2={ey} stroke={COLORS.translation} strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#arrowhead)" />
              );
            })}
          </g>
        )}

        {/* Transformation arrows for non-translation (reflection, rotation, enlargement) */}
        {visiblePoints && visibleImage && visibleImage.length > 0 && showArrowForPoint !== undefined && !translationVector && (
          <g>
            <defs>
              <marker id="transformArrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={COLORS.guide} />
              </marker>
            </defs>
            {visiblePoints.map((p, i) => {
              if (showArrowForPoint !== i) return null;
              const [sx, sy] = localToPx(p);
              const [ex, ey] = localToPx(visibleImage[i]);
              return (
                <line key={`transform-${i}`} x1={sx} y1={sy} x2={ex} y2={ey} stroke={COLORS.guide} strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#transformArrow)" />
              );
            })}
          </g>
        )}

        {/* Reflection line - standard */}
        {reflectionLine && <ReflectionLine line={reflectionLine} toPx={localToPx} gridMin={gridMin} gridMax={gridMax} />}
        {customLine && <CustomReflectionLine m={customLine.m} c={customLine.c} toPx={localToPx} gridMin={gridMin} gridMax={gridMax} />}

        {/* Draggable reflection line */}
        {draggableLine && linePoint1 && linePoint2 && (
          <g>
            <line x1={localToPx(linePoint1)[0]} y1={localToPx(linePoint1)[1]} x2={localToPx(linePoint2)[0]} y2={localToPx(linePoint2)[1]} stroke={COLORS.reflection} strokeWidth="3" strokeDasharray="10 6" />
            <g style={{ cursor: "grab" }} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragLinePoint(1); }}>
              <circle cx={localToPx(linePoint1)[0]} cy={localToPx(linePoint1)[1]} r="10" fill={COLORS.reflection} fillOpacity={0.8} />
              <GripVertical x={localToPx(linePoint1)[0] - 6} y={localToPx(linePoint1)[1] - 6} width={12} height={12} stroke="white" strokeWidth={1.5} />
            </g>
            <g style={{ cursor: "grab" }} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragLinePoint(2); }}>
              <circle cx={localToPx(linePoint2)[0]} cy={localToPx(linePoint2)[1]} r="10" fill={COLORS.reflection} fillOpacity={0.8} />
              <GripVertical x={localToPx(linePoint2)[0] - 6} y={localToPx(linePoint2)[1] - 6} width={12} height={12} stroke="white" strokeWidth={1.5} />
            </g>
          </g>
        )}

        {/* Centre point - draggable */}
        {center && (
          <g
            style={{ cursor: draggableCenter ? "grab" : "default" }}
            onPointerDown={(e) => {
              if (draggableCenter) {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragCenter(true);
              }
            }}
          >
            <circle cx={localToPx(center)[0]} cy={localToPx(center)[1]} r={draggableCenter ? 12 : 7} fill={COLORS.center} fillOpacity={draggableCenter ? 0.7 : 1} />
            <text x={localToPx(center)[0] + 14} y={localToPx(center)[1] - 10} fontSize="12" fontWeight="700" fill={COLORS.center}>
              C {fmtPoint(center)}
            </text>
          </g>
        )}

        {/* Intermediate shape */}
        {visibleIntermediate && visibleIntermediate.length > 0 && (
          <>
            <path d={polygonPath(visibleIntermediate, localToPx)} fill="rgba(139,92,246,.15)" stroke={COLORS.intermediate} strokeWidth="2" strokeDasharray="4 4" />
            {visibleIntermediate.map((p, i) => (
              <g key={`int-${i}`}>
                <circle cx={localToPx(p)[0]} cy={localToPx(p)[1]} r="5" fill={COLORS.intermediate} />
                {showLabels && (
                  <text x={localToPx(p)[0] + 8} y={localToPx(p)[1] - 8} fontSize="11" fontWeight="700" fill={COLORS.intermediate}>
                    {String.fromCharCode(65 + i)}''
                  </text>
                )}
              </g>
            ))}
          </>
        )}

        {/* Image shape */}
        {visibleImage && visibleImage.length > 0 && (
          <>
            <path d={polygonPath(visibleImage, localToPx)} fill="rgba(249,115,22,.18)" stroke={COLORS.image} strokeWidth="3" />
            {visibleImage.map((p, i) => (
              <g key={`img-${i}`}>
                <circle cx={localToPx(p)[0]} cy={localToPx(p)[1]} r="6" fill={COLORS.image} />
                {showLabels && (
                  <text x={localToPx(p)[0] + 8} y={localToPx(p)[1] - 8} fontSize="12" fontWeight="700" fill={COLORS.image}>
                    {String.fromCharCode(65 + i)}'
                  </text>
                )}
              </g>
            ))}
          </>
        )}

        {/* Original shape */}
        {visiblePoints && visiblePoints.length > 0 && (
          <>
            <path d={polygonPath(visiblePoints, localToPx)} fill="rgba(37,99,235,.16)" stroke={COLORS.original} strokeWidth="3" />
            {visiblePoints.map((p, i) => (
              <g
                key={`p-${i}`}
                style={{ cursor: draggable ? "grab" : "default" }}
                onPointerDown={(e) => {
                  if (draggable) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragIndex(i);
                  }
                }}
              >
                <circle cx={localToPx(p)[0]} cy={localToPx(p)[1]} r={draggable ? 12 : 8} fill={COLORS.original} fillOpacity={draggable ? 0.7 : 1} stroke={draggable ? COLORS.original : "none"} strokeWidth="2" />
                {showLabels && (
                  <text x={localToPx(p)[0] + 10} y={localToPx(p)[1] - 10} fontSize="12" fontWeight="700" fill={COLORS.original}>
                    {String.fromCharCode(65 + i)}
                  </text>
                )}
              </g>
            ))}
          </>
        )}

        {/* Target points for practice */}
        {targetPoints && targetPoints.length > 0 && (
          <>
            <path d={polygonPath(targetPoints, localToPx)} fill="rgba(22,163,74,.12)" stroke={COLORS.guide} strokeWidth="3" strokeDasharray="8 6" />
            {targetPoints.map((p, i) => (
              <g
                key={`target-${i}`}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragTargetIndex(i);
                }}
              >
                <circle cx={localToPx(p)[0]} cy={localToPx(p)[1]} r="12" fill="white" stroke={COLORS.guide} strokeWidth="3" />
                <text x={localToPx(p)[0]} y={localToPx(p)[1] + 4} fontSize="10" fontWeight="700" fill={COLORS.guide} textAnchor="middle">
                  {String.fromCharCode(65 + i)}'
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
      {draggable && (
        <p className="mt-2 text-xs text-slate-500">
          <Move className="mr-1 inline h-3 w-3" />
          Drag the blue vertices to move the shape.
          {draggableCenter && " Drag the red centre point to reposition it."}
        </p>
      )}
    </div>
  );
}

function ReflectionLine({ line, toPx, gridMin, gridMax }: { line: string; toPx: (p: Point) => Point; gridMin: number; gridMax: number }) {
  const common = { stroke: COLORS.reflection, strokeWidth: 3, strokeDasharray: "10 6" };
  if (line === "x-axis") return <line x1={PAD} y1={toPx([0, 0])[1]} x2={SIZE - PAD} y2={toPx([0, 0])[1]} {...common} />;
  if (line === "y-axis") return <line x1={toPx([0, 0])[0]} y1={PAD} x2={toPx([0, 0])[0]} y2={SIZE - PAD} {...common} />;
  if (line === "y=x") return <line x1={toPx([gridMin, gridMin])[0]} y1={toPx([gridMin, gridMin])[1]} x2={toPx([gridMax, gridMax])[0]} y2={toPx([gridMax, gridMax])[1]} {...common} />;
  if (line === "y=-x") return <line x1={toPx([gridMin, -gridMin])[0]} y1={toPx([gridMin, -gridMin])[1]} x2={toPx([gridMax, -gridMax])[0]} y2={toPx([gridMax, -gridMax])[1]} {...common} />;
  // Vertical lines x = k
  if (line.startsWith("x=")) {
    const k = parseFloat(line.slice(2));
    const [x1] = toPx([k, gridMin]);
    return <line x1={x1} y1={PAD} x2={x1} y2={SIZE - PAD} {...common} />;
  }
  // Horizontal lines y = k (not y=x or y=-x)
  if (line.startsWith("y=") && !line.includes("x")) {
    const k = parseFloat(line.slice(2));
    const [, y1] = toPx([gridMin, k]);
    return <line x1={PAD} y1={y1} x2={SIZE - PAD} y2={y1} {...common} />;
  }
  return <line x1={toPx([gridMin, -gridMin])[0]} y1={toPx([gridMin, -gridMin])[1]} x2={toPx([gridMax, -gridMax])[0]} y2={toPx([gridMax, -gridMax])[1]} {...common} />;
}

function CustomReflectionLine({ m, c, toPx, gridMin, gridMax }: { m: number; c: number; toPx: (p: Point) => Point; gridMin: number; gridMax: number }) {
  const common = { stroke: COLORS.reflection, strokeWidth: 3, strokeDasharray: "10 6" };
  if (!isFinite(m)) {
    const [x1] = toPx([c, gridMin]);
    return <line x1={x1} y1={PAD} x2={x1} y2={SIZE - PAD} {...common} />;
  }
  const y1 = m * gridMin + c;
  const y2 = m * gridMax + c;
  const [px1, py1] = toPx([gridMin, y1]);
  const [px2, py2] = toPx([gridMax, y2]);
  return <line x1={px1} y1={py1} x2={px2} y2={py2} {...common} />;
}

function CentreInputs({ center, setCenter }: { center: Point; setCenter: (c: Point) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">      <label>
        Centre x
        <input type="number" className="mt-1 w-full rounded-lg border p-2" value={center[0]} min={-8} max={8} onChange={(e) => setCenter([clamp(Number(e.target.value), -8, 8), center[1]])} />
      </label>
      <label>
        Centre y
        <input type="number" className="mt-1 w-full rounded-lg border p-2" value={center[1]} min={-8} max={8} onChange={(e) => setCenter([center[0], clamp(Number(e.target.value), -8, 8)])} />
      </label>
    </div>
  );
}

function AlgebraicMethodPanel({
  type,
  params,
  points,
  imagePoints,
}: {
  type: string;
  params: {
    line?: string;
    lineM?: number;
    lineC?: number;
    angle?: number;
    center?: Point;
    scale?: number;
    vector?: Point;
  };
  points: Point[];
  imagePoints: Point[];
}) {
  const [selectedPoint, setSelectedPoint] = useState(0);
  const method = getAlgebraicMethod(type, params, points[selectedPoint], imagePoints[selectedPoint]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-slate-600" />
        <h4 className="font-bold text-slate-900">Algebraic Method (for paper)</h4>
      </div>
      <div className="mb-3 flex gap-2">
        {points.map((_, i) => (
          <Button key={i} size="sm" variant={selectedPoint === i ? "default" : "outline"} className="rounded-lg px-3" onClick={() => setSelectedPoint(i)}>
            Point {String.fromCharCode(65 + i)}
          </Button>
        ))}
      </div>
      <div className="mb-3 rounded-lg bg-slate-900 px-3 py-2 font-mono text-sm text-white">{method.formula}</div>
      <ol className="space-y-1.5 text-sm text-slate-700">
        {method.steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
            <span><TextWithColumnVectors text={step} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}


function CentreFinderPanel({ kind }: { kind: "rotation" | "enlargement" }) {
  const [constructionStep, setConstructionStep] = useState(0);
  const isRotation = kind === "rotation";

  const original: Point[] = isRotation
    ? [[3, 1], [4, 1], [3, 3]]
    : [[1, 1], [2, 1], [1, 2]];
  const image: Point[] = isRotation
    ? original.map((p) => rotatePoint(p, 90, [0, 0]))
    : original.map((p) => enlargePoint(p, 2, [0, 0]));
  const centre: Point = [0, 0];

  const steps = isRotation
    ? [
        "Match two original vertices with their image vertices, for example A ↔ A′ and B ↔ B′.",
        "Join A to A′ and B to B′ with straight segments.",
        "Find the midpoint of AA′ and draw the perpendicular bisector of AA′. The rotation centre must lie somewhere on this line.",
        "Repeat for BB′. The two perpendicular bisectors intersect at O: this is the centre of rotation.",
        "Check your answer: OA = OA′ and OB = OB′. Then use the turn from a point to its image to identify the angle and direction.",
      ]
    : [
        "Match two original vertices with their image vertices, for example A ↔ A′ and B ↔ B′.",
        "Join A to A′ with a straight segment.",
        "Extend the line through A and A′ beyond both points. The centre must lie somewhere on this line.",
        "Do the same for B and B′. The extended lines intersect at O: this is the centre of enlargement.",
        "Check the scale factor using distances from O. Here OA′ = 2·OA and OB′ = 2·OB. For a negative scale factor, the image lies on the opposite side of O.",
      ];

  const min = -5;
  const max = 5;
  const diagramSize = 430;
  const pad = 34;
  const diagramStep = (diagramSize - 2 * pad) / (max - min);
  const mapPoint = ([x, y]: Point): Point => [
    pad + (x - min) * diagramStep,
    diagramSize - pad - (y - min) * diagramStep,
  ];
  const pathFor = (pts: Point[]) => pts.map((p, i) => {
    const [x, y] = mapPoint(p);
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ") + " Z";
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const extendedLine = (point: Point, direction: Point): [Point, Point] => [
    [point[0] - direction[0] * 20, point[1] - direction[1] * 20],
    [point[0] + direction[0] * 20, point[1] + direction[1] * 20],
  ];
  const drawLine = (a: Point, b: Point, props: React.SVGProps<SVGLineElement> = {}) => {
    const [x1, y1] = mapPoint(a);
    const [x2, y2] = mapPoint(b);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} {...props} />;
  };

  const pairA: [Point, Point] = [original[0], image[0]];
  const pairB: [Point, Point] = [original[1], image[1]];
  const midA = midpoint(...pairA);
  const midB = midpoint(...pairB);
  const segDirA = sub(pairA[1], pairA[0]);
  const segDirB = sub(pairB[1], pairB[0]);
  const perpA: Point = [-segDirA[1], segDirA[0]];
  const perpB: Point = [-segDirB[1], segDirB[0]];
  const [perpA1, perpA2] = extendedLine(midA, perpA);
  const [perpB1, perpB2] = extendedLine(midB, perpB);
  const [rayA1, rayA2] = extendedLine(pairA[0], sub(pairA[1], pairA[0]));
  const [rayB1, rayB2] = extendedLine(pairB[0], sub(pairB[1], pairB[0]));

  const borderClass = isRotation ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50";
  const headingClass = isRotation ? "text-blue-900" : "text-orange-900";
  const activeButton = isRotation ? "bg-blue-600 text-white" : "bg-orange-600 text-white";
  const activeStepClass = isRotation ? "border-blue-300 bg-blue-100" : "border-orange-300 bg-orange-100";

  return (
    <div className={`rounded-2xl border ${borderClass} p-4`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`font-bold ${headingClass}`}>How to find the centre of {kind}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
            {isRotation
              ? "Use perpendicular bisectors of segments joining corresponding points. Their intersection is the only point equidistant from each original point and its image."
              : "Use straight lines through corresponding points. Every original point, its image and the centre of enlargement are collinear."}
          </p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
          Construction method — no calculation needed
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setConstructionStep(i)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${constructionStep === i ? activeButton : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Step {i + 1}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <svg viewBox={`0 0 ${diagramSize} ${diagramSize}`} className="h-auto w-full" role="img" aria-label={`Graphical construction for finding the centre of ${kind}`}>
            <rect x="0" y="0" width={diagramSize} height={diagramSize} fill="white" />
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => {
              const [vx] = mapPoint([v, 0]);
              const [, vy] = mapPoint([0, v]);
              return (
                <React.Fragment key={`grid-${v}`}>
                  <line x1={vx} y1={pad} x2={vx} y2={diagramSize - pad} stroke="#e2e8f0" strokeWidth="1" />
                  <line x1={pad} y1={vy} x2={diagramSize - pad} y2={vy} stroke="#e2e8f0" strokeWidth="1" />
                </React.Fragment>
              );
            })}
            {drawLine([min, 0], [max, 0], { stroke: "#64748b", strokeWidth: 1.7 })}
            {drawLine([0, min], [0, max], { stroke: "#64748b", strokeWidth: 1.7 })}

            <path d={pathFor(original)} fill="#2563eb22" stroke={COLORS.original} strokeWidth="2.5" />
            <path d={pathFor(image)} fill="#f9731622" stroke={COLORS.image} strokeWidth="2.5" />

            {constructionStep >= 1 && (
              <>
                {drawLine(pairA[0], pairA[1], { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "5 4" })}
                {isRotation && drawLine(pairB[0], pairB[1], { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "5 4" })}
              </>
            )}

            {isRotation ? (
              <>
                {constructionStep >= 2 && (
                  <>
                    {drawLine(perpA1, perpA2, { stroke: COLORS.guide, strokeWidth: 2.5, strokeDasharray: "8 4" })}
                    <circle cx={mapPoint(midA)[0]} cy={mapPoint(midA)[1]} r="4.5" fill={COLORS.guide} />
                    <text x={mapPoint(midA)[0] + 7} y={mapPoint(midA)[1] - 7} fontSize="11" fill={COLORS.guide} fontWeight="700">midpoint</text>
                  </>
                )}
                {constructionStep >= 3 && (
                  <>
                    {drawLine(perpB1, perpB2, { stroke: COLORS.guide, strokeWidth: 2.5, strokeDasharray: "8 4" })}
                    <circle cx={mapPoint(midB)[0]} cy={mapPoint(midB)[1]} r="4.5" fill={COLORS.guide} />
                    <circle cx={mapPoint(centre)[0]} cy={mapPoint(centre)[1]} r="7" fill={COLORS.center} />
                    <text x={mapPoint(centre)[0] + 10} y={mapPoint(centre)[1] - 10} fontSize="12" fill={COLORS.center} fontWeight="800">O centre</text>
                  </>
                )}
                {constructionStep >= 4 && (
                  <>
                    {drawLine(centre, pairA[0], { stroke: COLORS.center, strokeWidth: 1.8, strokeDasharray: "3 3" })}
                    {drawLine(centre, pairA[1], { stroke: COLORS.center, strokeWidth: 1.8, strokeDasharray: "3 3" })}
                    <text x={mapPoint([1.0, -0.55])[0]} y={mapPoint([1.0, -0.55])[1]} fontSize="12" fill={COLORS.center} fontWeight="700">OA = OA′</text>
                  </>
                )}
              </>
            ) : (
              <>
                {constructionStep >= 2 && drawLine(rayA1, rayA2, { stroke: COLORS.guide, strokeWidth: 2.5, strokeDasharray: "8 4" })}
                {constructionStep >= 3 && (
                  <>
                    {drawLine(rayB1, rayB2, { stroke: COLORS.guide, strokeWidth: 2.5, strokeDasharray: "8 4" })}
                    <circle cx={mapPoint(centre)[0]} cy={mapPoint(centre)[1]} r="7" fill={COLORS.center} />
                    <text x={mapPoint(centre)[0] + 10} y={mapPoint(centre)[1] - 10} fontSize="12" fill={COLORS.center} fontWeight="800">O centre</text>
                  </>
                )}
                {constructionStep >= 4 && (
                  <>
                    {drawLine(centre, pairA[0], { stroke: COLORS.center, strokeWidth: 2 })}
                    {drawLine(pairA[0], pairA[1], { stroke: COLORS.center, strokeWidth: 2 })}
                    <text x={mapPoint([0.35, 0.55])[0]} y={mapPoint([0.35, 0.55])[1]} fontSize="11" fill={COLORS.center} fontWeight="700">OA</text>
                    <text x={mapPoint([1.35, 1.55])[0]} y={mapPoint([1.35, 1.55])[1]} fontSize="11" fill={COLORS.center} fontWeight="700">OA′ = 2·OA</text>
                  </>
                )}
              </>
            )}

            {original.map((p, i) => {
              const [x, y] = mapPoint(p);
              return (
                <React.Fragment key={`orig-${i}`}>
                  <circle cx={x} cy={y} r="5" fill={COLORS.original} />
                  <text x={x + 7} y={y - 7} fontSize="12" fill={COLORS.original} fontWeight="800">{String.fromCharCode(65 + i)}</text>
                </React.Fragment>
              );
            })}
            {image.map((p, i) => {
              const [x, y] = mapPoint(p);
              return (
                <React.Fragment key={`img-${i}`}>
                  <circle cx={x} cy={y} r="5" fill={COLORS.image} />
                  <text x={x + 7} y={y - 7} fontSize="12" fill={COLORS.image} fontWeight="800">{String.fromCharCode(65 + i)}′</text>
                </React.Fragment>
              );
            })}
          </svg>
          <div className="flex flex-wrap justify-center gap-4 border-t border-slate-100 pt-2 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Original</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Image</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-green-600" /> Construction line</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Centre</span>
          </div>
        </div>

        <div className="space-y-2">
          <ol className="space-y-2 text-sm leading-6 text-slate-700">
            {steps.map((stepText, i) => (
              <li key={i} className={`flex gap-3 rounded-xl border p-3 ${constructionStep === i ? activeStepClass : "border-slate-200 bg-white"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${constructionStep === i ? activeButton : "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
                <span>{stepText}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
            <span className="font-bold text-slate-800">Exam tip:</span> You normally need only two pairs of corresponding vertices. Use a third pair as a check if the diagram is crowded or your construction lines are not exact.
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== TRANSLATION SECTION =====
function TranslationSection() {
  const [mode, setMode] = useState<"theory" | "explore">("theory");
  const [points, setPoints] = useState<Point[]>(starterShape);
  const [vector, setVector] = useState<Point>([3, 2]);
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0);

  const imagePoints = useMemo(() => points.map((p) => translatePoint(p, vector)), [points, vector]);

  // Worked example
  const exampleVector: Point = [4, -2];
  const exampleImage = workedExample.map((p) => translatePoint(p, exampleVector));

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-cyan-200 bg-cyan-100 px-3 py-2 text-sm font-bold text-cyan-700">
            <ArrowRight className="mr-2 h-4 w-4" />
            Translation (T)
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "theory" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("theory")}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Theory
            </Button>
            <Button variant={mode === "explore" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("explore")}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Explore
            </Button>
          </div>
        </div>

        {mode === "theory" ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 font-bold text-slate-900">Definition</h3>
              <p className="text-sm leading-7 text-slate-700">
                A translation slides every point of a shape the same distance in the same direction. The shape, size and orientation remain unchanged. Described by a column vector.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">Rule:</span> (x, y) → (x + a, y + b) where vector is <ColumnVector vector={["a", "b"]} />
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">Properties:</span> Object and image are congruent. Orientation preserved.
              </div>
            </div>

            {/* Worked Example */}
            <div className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 p-4">
              <h3 className="mb-3 font-bold text-cyan-900">Worked Example</h3>
              <p className="mb-3 text-sm text-cyan-800">
                Translate triangle ABC by vector <ColumnVector vector={exampleVector} /> where A = (2, 1), B = (4, 1), C = (3, 3).
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button size="sm" variant={step === 0 ? "default" : "outline"} onClick={() => setStep(0)}>Original</Button>
                <Button size="sm" variant={step === 1 ? "default" : "outline"} onClick={() => setStep(1)}>Point A</Button>
                <Button size="sm" variant={step === 2 ? "default" : "outline"} onClick={() => setStep(2)}>Point B</Button>
                <Button size="sm" variant={step === 3 ? "default" : "outline"} onClick={() => setStep(3)}>Point C</Button>
                <Button size="sm" variant={step === 4 ? "default" : "outline"} onClick={() => setStep(4)}>Final</Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Grid 
                  points={workedExample} 
                  imagePoints={step >= 1 ? exampleImage.slice(0, Math.min(step, 3)) : []} 
                  translationVector={step >= 1 && step <= 3 ? exampleVector : null}
                  showArrowForPoint={step >= 1 && step <= 3 ? step - 1 : undefined}
                  title="Translation Worked Example"
                />
                <div className="space-y-2 text-sm">
                  {step === 0 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-blue-600">Step 1:</span> Identify original coordinates
                      <div className="mt-1 text-slate-600">A(2, 1), B(4, 1), C(3, 3)</div>
                      <div className="mt-1 text-slate-600">Vector = <ColumnVector vector={exampleVector} /></div>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-cyan-600">Step 2:</span> Transform Point A
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        A(2, 1) + <ColumnVector vector={exampleVector} /><br />
                        = (2 + 4, 1 + (-2))<br />
                        = (6, -1)<br />
                        <span className="font-bold text-orange-600">A&apos; = (6, -1)</span>
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-cyan-600">Step 3:</span> Transform Point B
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        B(4, 1) + <ColumnVector vector={exampleVector} /><br />
                        = (4 + 4, 1 + (-2))<br />
                        = (8, -1)<br />
                        <span className="font-bold text-orange-600">B&apos; = (8, -1)</span>
                      </div>
                    </div>
                  )}
                  {step === 3 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-cyan-600">Step 4:</span> Transform Point C
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        C(3, 3) + <ColumnVector vector={exampleVector} /><br />
                        = (3 + 4, 3 + (-2))<br />
                        = (7, 1)<br />
                        <span className="font-bold text-orange-600">C&apos; = (7, 1)</span>
                      </div>
                    </div>
                  )}
                  {step === 4 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-green-600">Complete!</span>
                      <div className="mt-2 text-slate-700">
                        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                          <div>A(2, 1)</div><div className="text-orange-600">A&apos;(6, -1)</div>
                          <div>B(4, 1)</div><div className="text-orange-600">B&apos;(8, -1)</div>
                          <div>C(3, 3)</div><div className="text-orange-600">C&apos;(7, 1)</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <Grid
                points={points}
                imagePoints={imagePoints}
                translationVector={vector}
                draggable
                onPointDrag={(i, p) => setPoints(points.map((old, idx) => (idx === i ? p : old)))}
                title="Interactive Translation"
                zoom={zoom}
                onZoomChange={setZoom}
                showZoomControls
              />
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Vector</h3>
                    <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700">Current: <ColumnVector vector={vector} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
                    <label>
                      x component
                      <input type="number" className="mt-1 w-full rounded-lg border p-2" value={vector[0]} min={-8} max={8} onChange={(e) => setVector([clamp(Number(e.target.value), -8, 8), vector[1]])} />
                    </label>
                    <label>
                      y component
                      <input type="number" className="mt-1 w-full rounded-lg border p-2" value={vector[1]} min={-8} max={8} onChange={(e) => setVector([vector[0], clamp(Number(e.target.value), -8, 8)])} />
                    </label>
                  </div>
                  <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => setPoints(starterShape)}>
                    Reset Shape
                  </Button>
                </div>
                <CoordinateComparison points={points} imagePoints={imagePoints} />
              </div>
            </div>
            <TransformationDescriptionCard type="translation" params={{ vector }} points={points} imagePoints={imagePoints} />
            <AlgebraicMethodPanel type="translation" params={{ vector }} points={points} imagePoints={imagePoints} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== REFLECTION SECTION =====
function ReflectionSection() {
  const [mode, setMode] = useState<"theory" | "explore">("theory");
  const [points, setPoints] = useState<Point[]>(starterShape);
  const [line, setLine] = useState("y-axis");
  const [useCustomLine, setUseCustomLine] = useState(false);
  const [customLineM, setCustomLineM] = useState(1);
  const [customLineC, setCustomLineC] = useState(0);
  const [useDraggableLine, setUseDraggableLine] = useState(true);
  const [linePoint1, setLinePoint1] = useState<Point>([-6, -6]);
  const [linePoint2, setLinePoint2] = useState<Point>([6, 6]);
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0);

  function getDraggableLineParams() {
    const [x1, y1] = linePoint1;
    const [x2, y2] = linePoint2;
    if (Math.abs(x2 - x1) < 0.001) return { m: Infinity, c: x1 };
    const m = (y2 - y1) / (x2 - x1);
    const c = y1 - m * x1;
    return { m: clean(m), c: clean(c) };
  }

  const imagePoints = useMemo(() => {
    if (useDraggableLine) {
      const { m, c } = getDraggableLineParams();
      return points.map((p) => reflectPointInLine(p, m, c));
    }
    if (useCustomLine) {
      return points.map((p) => reflectPointInLine(p, customLineM, customLineC));
    }
    return points.map((p) => reflectPoint(p, line));
  }, [points, line, useCustomLine, customLineM, customLineC, useDraggableLine, linePoint1, linePoint2]);

  // Worked example
  const exampleLine = "y-axis";
  const exampleImage = workedExample.map((p) => reflectPoint(p, exampleLine));

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-violet-200 bg-violet-100 px-3 py-2 text-sm font-bold text-violet-700">
            <FlipHorizontal className="mr-2 h-4 w-4" />
            Reflection (M)
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "theory" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("theory")}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Theory
            </Button>
            <Button variant={mode === "explore" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("explore")}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Explore
            </Button>
          </div>
        </div>

        {mode === "theory" ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 font-bold text-slate-900">Definition</h3>
              <p className="text-sm leading-7 text-slate-700">
                A reflection flips a shape across a mirror line. Every point and its image are the same perpendicular distance from the mirror line, on opposite sides.
              </p>
            </div>

            {/* Axis of Symmetry Mini Card */}
            <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FlipHorizontal className="h-5 w-5 text-violet-600" />
                <h3 className="font-bold text-violet-900">Axis of Symmetry</h3>
              </div>
              <p className="text-sm text-violet-700 mb-3">
                An axis of symmetry is a line that divides a shape into two identical halves that are mirror images of each other.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white p-2">
                  <span className="font-bold text-violet-800">Regular shapes:</span>
                  <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                    <li>- Equilateral triangle: 3 axes</li>
                    <li>- Square: 4 axes</li>
                    <li>- Regular hexagon: 6 axes</li>
                    <li>- Circle: infinite axes</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <span className="font-bold text-violet-800">Key properties:</span>
                  <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                    <li>- Passes through centre</li>
                    <li>- Folds shape onto itself</li>
                    <li>- n-sided regular polygon has n axes</li>
                    <li>- Used to identify reflections</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">x-axis:</span> {"(x, y) → (x, −y)"}
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">y-axis:</span> {"(x, y) → (−x, y)"}
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">y = x:</span> {"(x, y) → (y, x)"}
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">y = −x:</span> {"(x, y) → (−y, −x)"}
              </div>
            </div>

            {/* Worked Example */}
            <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
              <h3 className="mb-3 font-bold text-violet-900">Worked Example</h3>
              <p className="mb-3 text-sm text-violet-800">
                Reflect triangle ABC in the y-axis where A = (2, 1), B = (4, 1), C = (3, 3).
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button size="sm" variant={step === 0 ? "default" : "outline"} onClick={() => setStep(0)}>Original</Button>
                <Button size="sm" variant={step === 1 ? "default" : "outline"} onClick={() => setStep(1)}>Point A</Button>
                <Button size="sm" variant={step === 2 ? "default" : "outline"} onClick={() => setStep(2)}>Point B</Button>
                <Button size="sm" variant={step === 3 ? "default" : "outline"} onClick={() => setStep(3)}>Point C</Button>
                <Button size="sm" variant={step === 4 ? "default" : "outline"} onClick={() => setStep(4)}>Final</Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Grid 
                  points={workedExample} 
                  imagePoints={step >= 1 ? exampleImage.slice(0, Math.min(step, 3)) : []} 
                  reflectionLine={exampleLine}
                  showArrowForPoint={step >= 1 && step <= 3 ? step - 1 : undefined}
                  title="Reflection Worked Example"
                />
                <div className="space-y-2 text-sm">
                  {step === 0 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-blue-600">Step 1:</span> Identify original coordinates
                      <div className="mt-1 text-slate-600">A(2, 1), B(4, 1), C(3, 3)</div>
                      <div className="mt-1 text-slate-600">Mirror line: y-axis (x = 0)</div>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-violet-600">Step 2:</span> Reflect Point A
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        {"y-axis rule: (x, y) → (−x, y)"}<br />
                        {"A(2, 1) → A'(−2, 1)"}<br />
                        <span className="font-bold text-orange-600">{"A' = (−2, 1)"}</span>
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-violet-600">Step 3:</span> Reflect Point B
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        {"B(4, 1) → B'(−4, 1)"}<br />
                        <span className="font-bold text-orange-600">{"B' = (−4, 1)"}</span>
                      </div>
                    </div>
                  )}
                  {step === 3 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-violet-600">Step 4:</span> Reflect Point C
                      <div className="mt-2 font-mono text-sm text-slate-700">
                        {"C(3, 3) → C'(−3, 3)"}<br />
                        <span className="font-bold text-orange-600">{"C' = (−3, 3)"}</span>
                      </div>
                    </div>
                  )}
                  {step === 4 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-green-600">Complete!</span>
                      <div className="mt-2 text-slate-700">
                        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                          <div>A(2, 1)</div><div className="text-orange-600">{"A'(−2, 1)"}</div>
                          <div>B(4, 1)</div><div className="text-orange-600">{"B'(−4, 1)"}</div>
                          <div>C(3, 3)</div><div className="text-orange-600">{"C'(−3, 3)"}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <Grid
                points={points}
                imagePoints={imagePoints}
                reflectionLine={useDraggableLine ? null : useCustomLine ? null : line}
                draggable
                onPointDrag={(i, p) => setPoints(points.map((old, idx) => (idx === i ? p : old)))}
                title="Interactive Reflection"
                zoom={zoom}
                onZoomChange={setZoom}
                showZoomControls
                draggableLine={useDraggableLine}
                linePoint1={useDraggableLine ? linePoint1 : undefined}
                linePoint2={useDraggableLine ? linePoint2 : undefined}
                onLineDrag={useDraggableLine ? (p1, p2) => { setLinePoint1(p1); setLinePoint2(p2); } : undefined}
                customLine={!useDraggableLine && useCustomLine ? { m: customLineM, c: customLineC } : undefined}
              />
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">Mirror Line</h3>

                  <div className="mb-3 flex gap-2">
                    <Button size="sm" variant={useDraggableLine ? "default" : "outline"} className="rounded-lg text-xs" onClick={() => { setUseDraggableLine(true); setUseCustomLine(false); }}>
                      <GripVertical className="mr-1 h-3 w-3" /> Drag
                    </Button>
                    <Button size="sm" variant={!useDraggableLine && !useCustomLine ? "default" : "outline"} className="rounded-lg text-xs" onClick={() => { setUseDraggableLine(false); setUseCustomLine(false); }}>
                      Preset
                    </Button>
                    <Button size="sm" variant={!useDraggableLine && useCustomLine ? "default" : "outline"} className="rounded-lg text-xs" onClick={() => { setUseDraggableLine(false); setUseCustomLine(true); }}>
                      Custom
                    </Button>
                  </div>

                  {!useDraggableLine && !useCustomLine && (
                    <select className="w-full rounded-lg border p-2 text-sm" value={line} onChange={(e) => setLine(e.target.value)}>
                      <option value="x-axis">x-axis</option>
                      <option value="y-axis">y-axis</option>
                      <option value="y=x">y = x</option>
                      <option value="y=-x">y = −x</option>
                    </select>
                  )}

                  {!useDraggableLine && useCustomLine && (
                    <div className="space-y-2 text-sm">
                      <label>
                        Gradient (m)
                        <input type="number" step="0.5" className="mt-1 w-full rounded-lg border p-2" value={customLineM} onChange={(e) => setCustomLineM(Number(e.target.value))} />
                      </label>
                      <label>
                        y-intercept (c)
                        <input type="number" step="0.5" className="mt-1 w-full rounded-lg border p-2" value={customLineC} onChange={(e) => setCustomLineC(Number(e.target.value))} />
                      </label>
                    </div>
                  )}

                  {useDraggableLine && (
                    <div className="mt-3 rounded-lg bg-violet-100 p-2 text-xs text-violet-700">
                      Drag purple handles to position line.
                      <div className="mt-1 font-mono">
                        {getDraggableLineParams().m === Infinity 
                          ? `x = ${clean(getDraggableLineParams().c)}`
                          : getDraggableLineParams().c === 0 
                            ? `y = ${clean(getDraggableLineParams().m)}x`
                            : `y = ${clean(getDraggableLineParams().m)}x ${getDraggableLineParams().c >= 0 ? '+' : ''} ${clean(getDraggableLineParams().c)}`
                        }
                      </div>
                    </div>
                  )}

                  <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => setPoints(starterShape)}>
                    Reset Shape
                  </Button>
                </div>
                <CoordinateComparison points={points} imagePoints={imagePoints} />
              </div>
            </div>
            <TransformationDescriptionCard 
              type="reflection" 
              params={useDraggableLine ? { lineM: getDraggableLineParams().m, lineC: getDraggableLineParams().c } : useCustomLine ? { lineM: customLineM, lineC: customLineC } : { line }}
              points={points}
              imagePoints={imagePoints}
            />
            <AlgebraicMethodPanel
              type="reflection"
              params={useDraggableLine ? { lineM: getDraggableLineParams().m, lineC: getDraggableLineParams().c } : useCustomLine ? { lineM: customLineM, lineC: customLineC } : { line }}
              points={points}
              imagePoints={imagePoints}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== ROTATION SECTION =====
function RotationSection() {
  const [mode, setMode] = useState<"theory" | "explore">("theory");
  const [points, setPoints] = useState<Point[]>(starterShape);
  const [angle, setAngle] = useState(90);
  const [center, setCenter] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0);
  const [exampleIndex, setExampleIndex] = useState(0);

  const imagePoints = useMemo(() => points.map((p) => rotatePoint(p, angle, center)), [points, angle, center]);

  // Multiple worked examples
  const rotationExamples = [
    {
      title: "90 deg Anticlockwise about Origin",
      description: "Rotate triangle ABC 90 deg anticlockwise about the origin where A = (2, 1), B = (4, 1), C = (3, 3).",
      original: workedExample,
      center: [0, 0] as Point,
      angle: 90,
      steps: [
        { label: "Step 1:", content: "Identify centre and angle\nCentre: (0, 0) (origin)\nAngle: 90 deg anticlockwise\nRule: (x, y) → (-y, x)" },
        { label: "Step 2:", calc: "A(2, 1) → A'(-y, x)\n= (-1, 2)", result: "A' = (-1, 2)" },
        { label: "Step 3:", calc: "B(4, 1) → B'(-y, x)\n= (-1, 4)", result: "B' = (-1, 4)" },
        { label: "Step 4:", calc: "C(3, 3) → C'(-y, x)\n= (-3, 3)", result: "C' = (-3, 3)" },
      ],
      summary: [["A(2, 1)", "A'(-1, 2)"], ["B(4, 1)", "B'(-1, 4)"], ["C(3, 3)", "C'(-3, 3)"]]
    },
    {
      title: "90 deg Clockwise about (2, 1)",
      description: "Rotate triangle PQR 90 deg clockwise about centre (2, 1) where P = (3, 3), Q = (5, 3), R = (4, 5).",
      original: [[3, 3], [5, 3], [4, 5]] as Point[],
      center: [2, 1] as Point,
      angle: -90,
      steps: [
        { label: "Step 1:", content: "Identify centre and angle\nCentre: (2, 1)\nAngle: 90 deg clockwise\nFor non-origin centre, translate to origin, rotate, translate back." },
        { label: "Step 2:", calc: "P(3,3): Translate by (-2,-1) → (1,2)\nRotate 90 cw: (2,-1)\nTranslate back: (4, 0)", result: "P' = (4, 0)" },
        { label: "Step 3:", calc: "Q(5,3): Translate → (3,2)\nRotate 90 cw: (2,-3)\nTranslate back: (4, -2)", result: "Q' = (4, -2)" },
        { label: "Step 4:", calc: "R(4,5): Translate → (2,4)\nRotate 90 cw: (4,-2)\nTranslate back: (6, -1)", result: "R' = (6, -1)" },
      ],
      summary: [["P(3, 3)", "P'(4, 0)"], ["Q(5, 3)", "Q'(4, -2)"], ["R(4, 5)", "R'(6, -1)"]]
    },
  ];

  const currentExample = rotationExamples[exampleIndex];
  const exampleImage = currentExample.original.map((p) => rotatePoint(p, currentExample.angle, currentExample.center));

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-blue-200 bg-blue-100 px-3 py-2 text-sm font-bold text-blue-700">
            <RotateCcw className="mr-2 h-4 w-4" />
            Rotation (R)
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "theory" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("theory")}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Theory
            </Button>
            <Button variant={mode === "explore" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("explore")}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Explore
            </Button>
          </div>
        </div>

        {mode === "theory" ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 font-bold text-slate-900">Definition</h3>
              <p className="text-sm leading-7 text-slate-700">
                A rotation turns a shape around a fixed centre point by a given angle. The distance from the centre stays the same; only the direction changes.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">90 deg anticlockwise about origin:</span> (x, y) → (-y, x)
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">90 deg clockwise about origin:</span> (x, y) → (y, -x)
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">180 deg about (a, b):</span> (x, y) → (2a - x, 2b - y)
              </div>
            </div>
            <CentreFinderPanel kind="rotation" />

            {/* Worked Example */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-blue-900">{currentExample.title}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant={exampleIndex === 0 ? "default" : "outline"} className="text-xs" onClick={() => { setExampleIndex(0); setStep(0); }}>
                    Origin Centre
                  </Button>
                  <Button size="sm" variant={exampleIndex === 1 ? "default" : "outline"} className="text-xs" onClick={() => { setExampleIndex(1); setStep(0); }}>
                    Different Centre
                  </Button>
                </div>
              </div>
              <p className="mb-3 text-sm text-blue-800">
                {currentExample.description}
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button size="sm" variant={step === 0 ? "default" : "outline"} onClick={() => setStep(0)}>Original</Button>
                <Button size="sm" variant={step === 1 ? "default" : "outline"} onClick={() => setStep(1)}>Point {exampleIndex === 0 ? "A" : "P"}</Button>
                <Button size="sm" variant={step === 2 ? "default" : "outline"} onClick={() => setStep(2)}>Point {exampleIndex === 0 ? "B" : "Q"}</Button>
                <Button size="sm" variant={step === 3 ? "default" : "outline"} onClick={() => setStep(3)}>Point {exampleIndex === 0 ? "C" : "R"}</Button>
                <Button size="sm" variant={step === 4 ? "default" : "outline"} onClick={() => setStep(4)}>Final</Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Grid 
                  points={currentExample.original} 
                  imagePoints={step >= 1 ? exampleImage.slice(0, Math.min(step, 3)) : []} 
                  center={currentExample.center}
                  showArrowForPoint={step >= 1 && step <= 3 ? step - 1 : undefined}
                  title={currentExample.title}
                />
                <div className="space-y-2 text-sm">
                  {step === 0 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-blue-600">{currentExample.steps[0].label}</span>
                      <div className="mt-1 whitespace-pre-line text-slate-600"><TextWithColumnVectors text={currentExample.steps[0].content} /></div>
                    </div>
                  )}
                  {step >= 1 && step <= 3 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-blue-600">{currentExample.steps[step].label}</span>
                      <div className="mt-2 font-mono text-sm text-slate-700 whitespace-pre-line">
                        <TextWithColumnVectors text={currentExample.steps[step].calc} />
                        <br />
                        <span className="font-bold text-orange-600">{currentExample.steps[step].result}</span>
                      </div>
                    </div>
                  )}
                  {step === 4 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-green-600">Complete!</span>
                      <div className="mt-2 text-slate-700">
                        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                          {currentExample.summary.map(([orig, img], i) => (
                            <React.Fragment key={i}>
                              <div>{orig}</div>
                              <div className="text-orange-600">{img}</div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <Grid
                points={points}
                imagePoints={imagePoints}
                center={center}
                draggableCenter
                onCenterDrag={setCenter}
                draggable
                onPointDrag={(i, p) => setPoints(points.map((old, idx) => (idx === i ? p : old)))}
                title="Interactive Rotation"
                zoom={zoom}
                onZoomChange={setZoom}
                showZoomControls
              />
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">Controls</h3>
                  <label className="text-sm font-semibold text-slate-700">
                    Angle
                    <select className="mt-1 w-full rounded-lg border p-2" value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
                      <option value={90}>90 deg anticlockwise</option>
                      <option value={-90}>90 deg clockwise</option>
                      <option value={180}>180 deg</option>
                    </select>
                  </label>
                  <div className="mt-3">
                    <CentreInputs center={center} setCenter={setCenter} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Drag the red centre point on the grid to reposition it.</p>
                  <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => setPoints(starterShape)}>
                    Reset Shape
                  </Button>
                </div>
                <CoordinateComparison points={points} imagePoints={imagePoints} />
              </div>
            </div>
            <TransformationDescriptionCard type="rotation" params={{ angle, center }} points={points} imagePoints={imagePoints} />
            <AlgebraicMethodPanel type="rotation" params={{ angle, center }} points={points} imagePoints={imagePoints} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== ENLARGEMENT SECTION =====
function EnlargementSection() {
  const [mode, setMode] = useState<"theory" | "explore">("theory");
  const [points, setPoints] = useState<Point[]>(starterShape);
  const [scale, setScale] = useState(2);
  const [center, setCenter] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0);
  const [exampleIndex, setExampleIndex] = useState(0);

  const imagePoints = useMemo(() => points.map((p) => enlargePoint(p, scale, center)), [points, scale, center]);

  // Worked examples - one at origin, one with different centre
  const workedExamples = [
    {
      title: "Enlargement from Origin",
      description: "Enlarge triangle ABC by scale factor 2 about the origin where A = (2, 1), B = (4, 1), C = (3, 3).",
      center: [0, 0] as Point,
      scale: 2,
      original: workedExample,
      gridRange: { min: -2, max: 10 },
      steps: [
        { label: "Step 1: Identify centre and scale factor", content: "Centre: (0, 0) (origin)\nScale factor k = 2\nRule: (x, y) → (kx, ky) when centre is origin\nMultiply each coordinate by the scale factor." },
        { label: "Step 2: Transform Point A", calc: "A(2, 1)\nA' = (2 × 2, 1 × 2)\n= (4, 2)", result: "A' = (4, 2)" },
        { label: "Step 3: Transform Point B", calc: "B(4, 1)\nB' = (4 × 2, 1 × 2)\n= (8, 2)", result: "B' = (8, 2)" },
        { label: "Step 4: Transform Point C", calc: "C(3, 3)\nC' = (3 × 2, 3 × 2)\n= (6, 6)", result: "C' = (6, 6)" },
      ],
      finalNote: "Image is 2× larger, same shape and orientation."
    },
    {
      title: "Enlargement from Different Centre",
      description: "Enlarge triangle PQR by scale factor 2 about centre (1, 1) where P = (2, 2), Q = (4, 2), R = (3, 4).",
      center: [1, 1] as Point,
      scale: 2,
      original: [[2, 2], [4, 2], [3, 4]] as Point[],
      gridRange: { min: -2, max: 10 },
      steps: [
        { label: "Step 1: Identify centre and scale factor", content: "Centre: (1, 1)\nScale factor k = 2\nRule: (x, y) → (a + k(x-a), b + k(y-b))\nwhere centre is (a, b) = (1, 1)" },
        { label: "Step 2: Transform Point P", calc: "P(2, 2)\nP' = (1 + 2(2-1), 1 + 2(2-1))\n= (1 + 2(1), 1 + 2(1))\n= (3, 3)", result: "P' = (3, 3)" },
        { label: "Step 3: Transform Point Q", calc: "Q(4, 2)\nQ' = (1 + 2(4-1), 1 + 2(2-1))\n= (1 + 2(3), 1 + 2(1))\n= (7, 3)", result: "Q' = (7, 3)" },
        { label: "Step 4: Transform Point R", calc: "R(3, 4)\nR' = (1 + 2(3-1), 1 + 2(4-1))\n= (1 + 2(2), 1 + 2(3))\n= (5, 7)", result: "R' = (5, 7)" },
      ],
      finalNote: "Centre (1, 1) stays fixed. All points move away from the centre."
    }
  ];

  const currentExample = workedExamples[exampleIndex];
  const exampleImage = currentExample.original.map((p) => enlargePoint(p, currentExample.scale, currentExample.center));

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-orange-200 bg-orange-100 px-3 py-2 text-sm font-bold text-orange-700">
            <Maximize2 className="mr-2 h-4 w-4" />
            Enlargement (E)
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "theory" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("theory")}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Theory
            </Button>
            <Button variant={mode === "explore" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("explore")}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Explore
            </Button>
          </div>
        </div>

        {mode === "theory" ? (          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 font-bold text-slate-900">Definition</h3>
              <p className="text-sm leading-7 text-slate-700">
                An enlargement changes the size of a shape from a centre using a scale factor. Each original point, its image and the centre lie on one straight line. For a positive scale factor they are on the same ray; for a negative scale factor the image is on the opposite side of the centre.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">Rule:</span> (x, y) → (a + k(x-a), b + k(y-b)) where centre is (a, b) and scale factor is k
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">k &gt; 1:</span> Shape gets larger
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">0 &lt; k &lt; 1:</span> Shape gets smaller
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">k &lt; 0:</span> Image on opposite side of centre (inverted)
              </div>
            </div>
            <CentreFinderPanel kind="enlargement" />

            {/* Worked Example */}
            <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-orange-900">{currentExample.title}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant={exampleIndex === 0 ? "default" : "outline"} className="text-xs" onClick={() => { setExampleIndex(0); setStep(0); }}>
                    Origin Centre
                  </Button>
                  <Button size="sm" variant={exampleIndex === 1 ? "default" : "outline"} className="text-xs" onClick={() => { setExampleIndex(1); setStep(0); }}>
                    Different Centre
                  </Button>
                </div>
              </div>
              <p className="mb-3 text-sm text-orange-800">
                {currentExample.description}
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button size="sm" variant={step === 0 ? "default" : "outline"} onClick={() => setStep(0)}>Original</Button>
                <Button size="sm" variant={step === 1 ? "default" : "outline"} onClick={() => setStep(1)}>Point A/P</Button>
                <Button size="sm" variant={step === 2 ? "default" : "outline"} onClick={() => setStep(2)}>Point B/Q</Button>
                <Button size="sm" variant={step === 3 ? "default" : "outline"} onClick={() => setStep(3)}>Point C/R</Button>
                <Button size="sm" variant={step === 4 ? "default" : "outline"} onClick={() => setStep(4)}>Final</Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Grid 
                  points={currentExample.original} 
                  imagePoints={step >= 1 ? exampleImage.slice(0, Math.min(step, 3)) : []} 
                  center={currentExample.center}
                  customGridRange={currentExample.gridRange}
                  showArrowForPoint={step >= 1 && step <= 3 ? step - 1 : undefined}
                  title={currentExample.title}
                />
                <div className="space-y-2 text-sm">
                  {step === 0 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-blue-600">{currentExample.steps[0].label}</span>
                      <div className="mt-1 whitespace-pre-line text-slate-600"><TextWithColumnVectors text={currentExample.steps[0].content} /></div>
                    </div>
                  )}
                  {step >= 1 && step <= 3 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-orange-600">{currentExample.steps[step].label}</span>
                      <div className="mt-2 font-mono text-sm text-slate-700 whitespace-pre-line">
                        <TextWithColumnVectors text={currentExample.steps[step].calc} />
                        <br />
                        <span className="font-bold text-orange-600">{currentExample.steps[step].result}</span>
                      </div>
                    </div>
                  )}
                  {step === 4 && (
                    <div className="rounded-lg bg-white p-3">
                      <span className="font-bold text-green-600">Complete!</span>
                      <div className="mt-2 text-slate-700">
                        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                          {currentExample.original.map((p, i) => (
                            <React.Fragment key={i}>
                              <div>{String.fromCharCode(exampleIndex === 0 ? 65 + i : 80 + i)}{fmtPoint(p)}</div>
                              <div className="text-orange-600">{String.fromCharCode(exampleIndex === 0 ? 65 + i : 80 + i)}&apos;{fmtPoint(exampleImage[i])}</div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{currentExample.finalNote}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <Grid
                points={points}
                imagePoints={imagePoints}
                center={center}
                draggableCenter
                onCenterDrag={setCenter}
                draggable
                onPointDrag={(i, p) => setPoints(points.map((old, idx) => (idx === i ? p : old)))}
                title="Interactive Enlargement"
                zoom={zoom}
                onZoomChange={setZoom}
                showZoomControls
              />
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">Controls</h3>
                  <label className="text-sm font-semibold text-slate-700">
                    Scale factor: <span className="font-bold text-orange-600">{scale}</span>
                    <input type="range" min="-3" max="3" step="0.5" value={scale} onChange={(e) => setScale(Number(e.target.value) || 0.5)} className="mt-2 w-full" />
                  </label>
                  <div className="mt-3">
                    <CentreInputs center={center} setCenter={setCenter} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Drag the red centre point on the grid to reposition it.</p>
                  <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => setPoints(starterShape)}>
                    Reset Shape
                  </Button>
                </div>
                <CoordinateComparison points={points} imagePoints={imagePoints} />
              </div>
            </div>
            <TransformationDescriptionCard type="enlargement" params={{ scale, center }} points={points} imagePoints={imagePoints} />
            <AlgebraicMethodPanel type="enlargement" params={{ scale, center }} points={points} imagePoints={imagePoints} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== COMPOSITION SECTION =====
function CompositionSection() {
  const [mode, setMode] = useState<"theory" | "explore">("theory");
  const [points, setPoints] = useState<Point[]>(starterShape);
  const [zoom, setZoom] = useState(1);

  // T1
  const [t1Type, setT1Type] = useState<"T" | "M" | "R" | "E">("M");
  const [t1Vector, setT1Vector] = useState<Point>([2, 0]);
  const [t1Line, setT1Line] = useState("y-axis");
  const [t1Angle, setT1Angle] = useState(90);
  const [t1Center, setT1Center] = useState<Point>([0, 0]);
  const [t1Scale, setT1Scale] = useState(2);

  // T2
  const [t2Type, setT2Type] = useState<"T" | "M" | "R" | "E">("R");
  const [t2Vector, setT2Vector] = useState<Point>([0, 3]);
  const [t2Line, setT2Line] = useState("x-axis");
  const [t2Angle, setT2Angle] = useState(90);
  const [t2Center, setT2Center] = useState<Point>([0, 0]);
  const [t2Scale, setT2Scale] = useState(2);

  const applyT = (p: Point, type: string, params: { vector?: Point; line?: string; angle?: number; center?: Point; scale?: number }): Point => {
    if (type === "T" && params.vector) return translatePoint(p, params.vector);
    if (type === "M" && params.line) return reflectPoint(p, params.line);
    if (type === "R" && params.angle !== undefined && params.center) return rotatePoint(p, params.angle, params.center);
    if (type === "E" && params.scale !== undefined && params.center) return enlargePoint(p, params.scale, params.center);
    return p;
  };

  const intermediatePoints = useMemo(() => {
    return points.map((p) => applyT(p, t1Type, { vector: t1Vector, line: t1Line, angle: t1Angle, center: t1Center, scale: t1Scale }));
  }, [points, t1Type, t1Vector, t1Line, t1Angle, t1Center, t1Scale]);

  const finalPoints = useMemo(() => {
    return intermediatePoints.map((p) => applyT(p, t2Type, { vector: t2Vector, line: t2Line, angle: t2Angle, center: t2Center, scale: t2Scale }));
  }, [intermediatePoints, t2Type, t2Vector, t2Line, t2Angle, t2Center, t2Scale]);

  const getLabel = (type: string) => {
    if (type === "T") return "Translation";
    if (type === "M") return "Reflection";
    if (type === "E") return "Enlargement";
    return "Rotation";
  };

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-700">
            <Layers className="mr-2 h-4 w-4" />
            Composition (T2 o T1)
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "theory" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("theory")}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Theory
            </Button>
            <Button variant={mode === "explore" ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setMode("explore")}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Explore
            </Button>
          </div>
        </div>

        {mode === "theory" ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 font-bold text-slate-900">Definition</h3>
              <p className="text-sm leading-7 text-slate-700">
                A composition of transformations applies two or more transformations in sequence. The result of the first becomes the input for the second. Written as T2 o T1 (T2 after T1).
              </p>
            </div>
            <div className="grid gap-2">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">Key:</span> Order matters! T2 o T1 is different from T1 o T2.
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">Notation:</span> T = Translation, M = Reflection (Mirror), R = Rotation, E = Enlargement
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">M o M (parallel lines):</span> Equivalent to a translation
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                <span className="font-bold">M o M (intersecting lines):</span> Equivalent to a rotation about intersection point
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <Grid
                points={points}
                intermediatePoints={intermediatePoints}
                imagePoints={finalPoints}
                draggable
                onPointDrag={(i, p) => setPoints(points.map((old, idx) => (idx === i ? p : old)))}
                title={`${getLabel(t2Type)} o ${getLabel(t1Type)}`}
                zoom={zoom}
                onZoomChange={setZoom}
                showZoomControls
                reflectionLine={t1Type === "M" ? t1Line : t2Type === "M" ? t2Line : null}
                center={t1Type === "R" ? t1Center : t2Type === "R" ? t2Center : null}
              />
              <div className="space-y-4">
                {/* T1 */}
                <div className="rounded-2xl bg-blue-50 p-4">
                  <h4 className="mb-2 text-sm font-bold text-blue-900">T1: First Transformation</h4>
                  <select className="mb-2 w-full rounded-lg border p-2 text-sm" value={t1Type} onChange={(e) => setT1Type(e.target.value as "T" | "M" | "R" | "E")}>
                    <option value="T">T - Translation</option>
                    <option value="M">M - Reflection</option>
                    <option value="R">R - Rotation</option>
                    <option value="E">E - Enlargement</option>
                  </select>
  {t1Type === "T" && (
  <div className="space-y-2 text-xs">
    <div className="flex items-center gap-2 font-semibold">Vector <ColumnVector vector={t1Vector} /></div>
    <div className="grid grid-cols-2 gap-2">
      <label>x: <input type="number" className="w-full rounded border p-1" value={t1Vector[0]} onChange={(e) => setT1Vector([Number(e.target.value), t1Vector[1]])} /></label>
      <label>y: <input type="number" className="w-full rounded border p-1" value={t1Vector[1]} onChange={(e) => setT1Vector([t1Vector[0], Number(e.target.value)])} /></label>
    </div>
  </div>
  )}
                  {t1Type === "M" && (
                    <select className="w-full rounded border p-1 text-sm" value={t1Line} onChange={(e) => setT1Line(e.target.value)}>
                      <option value="x-axis">x-axis</option>
                      <option value="y-axis">y-axis</option>
                      <option value="y=x">y = x</option>
                      <option value="y=-x">y = -x</option>
                      <option value="x=1">x = 1</option>
                      <option value="x=-1">x = -1</option>
                      <option value="x=2">x = 2</option>
                      <option value="y=1">y = 1</option>
                      <option value="y=-1">y = -1</option>
                      <option value="y=2">y = 2</option>
                    </select>
                  )}
                  {t1Type === "R" && (
                    <div className="space-y-2 text-xs">
                      <select className="w-full rounded border p-1" value={t1Angle} onChange={(e) => setT1Angle(Number(e.target.value))}>
                        <option value={90}>90 deg anticlockwise</option><option value={-90}>90 deg clockwise</option><option value={180}>180 deg</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <label>Cx: <input type="number" className="w-full rounded border p-1" value={t1Center[0]} onChange={(e) => setT1Center([Number(e.target.value), t1Center[1]])} /></label>
                        <label>Cy: <input type="number" className="w-full rounded border p-1" value={t1Center[1]} onChange={(e) => setT1Center([t1Center[0], Number(e.target.value)])} /></label>
                      </div>
                    </div>
                  )}
                  {t1Type === "E" && (
                    <div className="space-y-2 text-xs">
                      <label>Scale factor: <input type="number" step="0.5" className="w-full rounded border p-1" value={t1Scale} onChange={(e) => setT1Scale(Number(e.target.value))} /></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label>Cx: <input type="number" className="w-full rounded border p-1" value={t1Center[0]} onChange={(e) => setT1Center([Number(e.target.value), t1Center[1]])} /></label>
                        <label>Cy: <input type="number" className="w-full rounded border p-1" value={t1Center[1]} onChange={(e) => setT1Center([t1Center[0], Number(e.target.value)])} /></label>
                      </div>
                    </div>
                  )}
                </div>

                {/* T2 */}
                <div className="rounded-2xl bg-orange-50 p-4">
                  <h4 className="mb-2 text-sm font-bold text-orange-900">T2: Second Transformation</h4>
                  <select className="mb-2 w-full rounded-lg border p-2 text-sm" value={t2Type} onChange={(e) => setT2Type(e.target.value as "T" | "M" | "R" | "E")}>
                    <option value="T">T - Translation</option>
                    <option value="M">M - Reflection</option>
                    <option value="R">R - Rotation</option>
                    <option value="E">E - Enlargement</option>
                  </select>
  {t2Type === "T" && (
  <div className="space-y-2 text-xs">
    <div className="flex items-center gap-2 font-semibold">Vector <ColumnVector vector={t2Vector} /></div>
    <div className="grid grid-cols-2 gap-2">
      <label>x: <input type="number" className="w-full rounded border p-1" value={t2Vector[0]} onChange={(e) => setT2Vector([Number(e.target.value), t2Vector[1]])} /></label>
      <label>y: <input type="number" className="w-full rounded border p-1" value={t2Vector[1]} onChange={(e) => setT2Vector([t2Vector[0], Number(e.target.value)])} /></label>
    </div>
  </div>
  )}
                  {t2Type === "M" && (
                    <select className="w-full rounded border p-1 text-sm" value={t2Line} onChange={(e) => setT2Line(e.target.value)}>
                      <option value="x-axis">x-axis</option>
                      <option value="y-axis">y-axis</option>
                      <option value="y=x">y = x</option>
                      <option value="y=-x">y = -x</option>
                      <option value="x=1">x = 1</option>
                      <option value="x=-1">x = -1</option>
                      <option value="x=2">x = 2</option>
                      <option value="y=1">y = 1</option>
                      <option value="y=-1">y = -1</option>
                      <option value="y=2">y = 2</option>
                    </select>
                  )}
                  {t2Type === "R" && (
                    <div className="space-y-2 text-xs">
                      <select className="w-full rounded border p-1" value={t2Angle} onChange={(e) => setT2Angle(Number(e.target.value))}>
                        <option value={90}>90 deg anticlockwise</option><option value={-90}>90 deg clockwise</option><option value={180}>180 deg</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <label>Cx: <input type="number" className="w-full rounded border p-1" value={t2Center[0]} onChange={(e) => setT2Center([Number(e.target.value), t2Center[1]])} /></label>
                        <label>Cy: <input type="number" className="w-full rounded border p-1" value={t2Center[1]} onChange={(e) => setT2Center([t2Center[0], Number(e.target.value)])} /></label>
                      </div>
                    </div>
                  )}
                  {t2Type === "E" && (
                    <div className="space-y-2 text-xs">
                      <label>Scale factor: <input type="number" step="0.5" className="w-full rounded border p-1" value={t2Scale} onChange={(e) => setT2Scale(Number(e.target.value))} /></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label>Cx: <input type="number" className="w-full rounded border p-1" value={t2Center[0]} onChange={(e) => setT2Center([Number(e.target.value), t2Center[1]])} /></label>
                        <label>Cy: <input type="number" className="w-full rounded border p-1" value={t2Center[1]} onChange={(e) => setT2Center([t2Center[0], Number(e.target.value)])} /></label>
                      </div>
                    </div>
                  )}
                </div>

                <Button variant="outline" className="w-full rounded-xl" onClick={() => setPoints(starterShape)}>
                  Reset
                </Button>
                <CoordinateComparison points={points} imagePoints={finalPoints} intermediatePoints={intermediatePoints} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== PRACTICE SECTION =====
function randInt(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function randomPoint(): Point {
  return [randInt(-4, 4), randInt(-4, 4)];
}
function randomTriangle(): Point[] {
  let p = [randomPoint(), randomPoint(), randomPoint()];
  while (new Set(p.map((x) => x.join(","))).size < 3) p = [randomPoint(), randomPoint(), randomPoint()];
  return p;
}

interface Problem {
  type: string;
  shape: Point[];
  answer: Point[];
  text: string;
  detail: string;
  line?: string;
  angle?: number;
  center?: Point;
  scale?: number;
  vector?: Point;
  isComposite?: boolean;
  steps?: { type: string; description: string }[];
}

function makeProblem(kind: string): Problem {
  const shape = randomTriangle();

  if (kind === "translation") {
    const vx = randInt(-4, 4);
    const vy = randInt(-4, 4);
    const vector: Point = [vx, vy];
    return { type: kind, shape, answer: shape.map((p) => translatePoint(p, vector)), text: `Translate triangle ABC by vector (${vx}, ${vy}).`, detail: `Add ${vx} to x and ${vy} to y.`, vector };
  }

  if (kind === "reflection") {
    const lines = ["x-axis", "y-axis", "y=x", "y=-x"];
    const line = lines[randInt(0, lines.length - 1)];
    return { type: kind, shape, answer: shape.map((p) => reflectPoint(p, line)), text: `Reflect triangle ABC in the ${line}.`, detail: `Use the reflection rule for ${line}.`, line };
  }

  if (kind === "rotation") {
    const angles = [90, -90, 180];
    const angle = angles[randInt(0, angles.length - 1)];
    const center: Point = [0, 0];
    const phrase = angle === 90 ? "90 deg anticlockwise" : angle === -90 ? "90 deg clockwise" : "180 deg";
    return { type: kind, shape, answer: shape.map((p) => rotatePoint(p, angle, center)), text: `Rotate triangle ABC ${phrase} about the origin.`, detail: "Apply rotation rule.", angle, center };
  }

  if (kind === "enlargement") {
    const scales = [2, -1, 0.5];
    const scale = scales[randInt(0, scales.length - 1)];
    const center: Point = [0, 0];
    return { type: kind, shape, answer: shape.map((p) => enlargePoint(p, scale, center)), text: `Enlarge triangle ABC by scale factor ${scale} about the origin.`, detail: "Multiply vectors from centre.", scale, center };
  }

  // Combined
  const combos = [
    { t1: "M", t2: "T" },
    { t1: "R", t2: "M" },
    { t1: "T", t2: "R" },
    { t1: "M", t2: "M" },
  ];
  const combo = combos[randInt(0, combos.length - 1)];
  const lines = ["x-axis", "y-axis", "y=x"];
  const angles = [90, -90, 180];

  let intermediate = shape;
  let step1Desc = "";
  let step2Desc = "";

  if (combo.t1 === "M") {
    const line = lines[randInt(0, lines.length - 1)];
    intermediate = shape.map((p) => reflectPoint(p, line));
    step1Desc = `M: Reflect in ${line}`;
  } else if (combo.t1 === "R") {
    const angle = angles[randInt(0, angles.length - 1)];
    intermediate = shape.map((p) => rotatePoint(p, angle, [0, 0]));
    step1Desc = `R: Rotate ${angle === 90 ? "90 deg anticlockwise" : angle === -90 ? "90 deg clockwise" : "180 deg"} about origin`;
  } else {
    const vec: Point = [randInt(-3, 3), randInt(-3, 3)];
    intermediate = shape.map((p) => translatePoint(p, vec));
    step1Desc = `T: Translate by (${vec[0]}, ${vec[1]})`;
  }

  let final = intermediate;
  if (combo.t2 === "M") {
    const line = lines[randInt(0, lines.length - 1)];
    final = intermediate.map((p) => reflectPoint(p, line));
    step2Desc = `M: Reflect in ${line}`;
  } else if (combo.t2 === "R") {
    const angle = angles[randInt(0, angles.length - 1)];
    final = intermediate.map((p) => rotatePoint(p, angle, [0, 0]));
    step2Desc = `R: Rotate ${angle === 90 ? "90 deg anticlockwise" : angle === -90 ? "90 deg clockwise" : "180 deg"} about origin`;
  } else {
    const vec: Point = [randInt(-3, 3), randInt(-3, 3)];
    final = intermediate.map((p) => translatePoint(p, vec));
    step2Desc = `T: Translate by (${vec[0]}, ${vec[1]})`;
  }

  return {
    type: "combined",
    shape,
    answer: final,
    text: `Apply two transformations: First ${step1Desc}, then ${step2Desc}.`,
    detail: `Step 1: ${step1Desc}. Step 2: ${step2Desc}.`,
    isComposite: true,
    steps: [{ type: combo.t1, description: step1Desc }, { type: combo.t2, description: step2Desc }],
  };
}

function PracticeSection({ studentId, studentName, studentSchool, studentYear }: { studentId: string | null; studentName: string; studentSchool: string; studentYear: string }) {
  const types = ["translation", "reflection", "rotation", "enlargement", "combined"];
  const [currentType, setCurrentType] = useState("translation");
  const [problem, setProblem] = useState<Problem>(() => makeProblem("translation"));
  const [attempt, setAttempt] = useState<Point[]>([[0, 0], [1, 0], [0, 1]]);
  const [checked, setChecked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const { xp, streak, addXp, incrementStreak, resetStreak } = useGamification();

  function newProblem(type: string) {
    setProblem(makeProblem(type));
    setAttempt([[0, 0], [1, 0], [0, 1]]);
    setChecked(false);
    setShowAnswer(false);
    setAttemptCount(0);
    setStartTime(Date.now());
  }

  const correct = attempt.every((p, i) => Math.abs(p[0] - problem.answer[i][0]) < 0.1 && Math.abs(p[1] - problem.answer[i][1]) < 0.1);

  async function handleCheck() {
    setChecked(true);
    setAttemptCount(attemptCount + 1);
    
    if (correct) {
      addXp(10);
      incrementStreak();
      
      // Record to Firestore
      if (studentId) {
        try {
          await recordPracticeAttempt({
            studentId,
            studentName,
            school: studentSchool,
            year: studentYear,
            problemType: problem.type as "translation" | "reflection" | "rotation" | "enlargement",
            problemDetails: problem.text,
            isCorrect: true,
            attempts: attemptCount + 1,
            timeSpent: Math.round((Date.now() - startTime) / 1000),
          });
        } catch (error) {
          console.error("Error recording attempt:", error);
        }
      }
    } else {
      resetStreak();
    }
  }
  
  async function handleGiveUp() {
    // Record failed attempt to Firestore
    if (studentId && !checked) {
      try {
        await recordPracticeAttempt({
          studentId,
          studentName,
          school: studentSchool,
          year: studentYear,
          problemType: problem.type as "translation" | "reflection" | "rotation" | "enlargement",
          problemDetails: problem.text,
          isCorrect: false,
          attempts: attemptCount,
          timeSpent: Math.round((Date.now() - startTime) / 1000),
        });
      } catch (error) {
        console.error("Error recording attempt:", error);
      }
    }
    setShowAnswer(true);
  }

  const feedback = checked ? (
    correct ? (
      <span className="flex items-center text-green-600"><CheckCircle2 className="mr-1 h-4 w-4" /> Correct! +10 XP</span>
    ) : (
      <span className="flex items-center text-red-600"><XCircle className="mr-1 h-4 w-4" /> Try again</span>
    )
  ) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8">
      <GamificationBar xp={xp} streak={streak} />
      
      <div className="my-6 flex items-center gap-3">
        <div className="rounded-xl bg-rose-500/20 p-2">
          <Target className="h-5 w-5 text-rose-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Practice Mode</h2>
          <p className="text-sm text-slate-400">Drag green points to place the image. Check when ready.</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {types.map((t) => (
          <Button
            key={t}
            variant={currentType === t ? "default" : "outline"}
            className={`rounded-xl capitalize ${currentType === t ? "bg-white text-slate-900" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
            onClick={() => { setCurrentType(t); newProblem(t); }}
          >
            {t}
          </Button>
        ))}
        <Button variant="outline" className="ml-auto rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => newProblem(currentType)}>
          <Shuffle className="mr-2 h-4 w-4" /> New Problem
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl bg-white p-2">
          <Grid
            points={problem.shape}
            targetPoints={attempt}
            imagePoints={showAnswer ? problem.answer : []}
            center={problem.center || null}
            reflectionLine={problem.line || null}
            translationVector={problem.type === "translation" ? problem.vector : null}
            onTargetDrag={(i, p) => setAttempt(attempt.map((old, idx) => (idx === i ? p : old)))}
            title={`Practice: ${problem.type.charAt(0).toUpperCase() + problem.type.slice(1)}`}
            feedback={feedback}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900 p-4">
            <h3 className="mb-2 font-bold text-white">Problem</h3>
            <p className="text-sm leading-6 text-slate-300"><TextWithColumnVectors text={problem.text} /></p>
            {problem.isComposite && problem.steps && (
              <div className="mt-2 space-y-1">
                {problem.steps.map((s, i) => (
                  <div key={i} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">Step {i + 1}: <TextWithColumnVectors text={s.description} /></div>
                ))}
              </div>
            )}
            {problem.detail && (
              <div className="mt-3 rounded-lg border-l-2 border-blue-400 bg-slate-800 p-2 text-xs text-blue-300">
                <span className="font-bold text-blue-200">Method:</span> {problem.detail}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900 p-4">
            <h3 className="mb-2 font-bold text-white">Original</h3>
            <div className="space-y-1 text-sm text-slate-300">
              {problem.shape.map((p, i) => (
                <div key={i}><span className="font-bold text-blue-400">{String.fromCharCode(65 + i)}</span> = {fmtPoint(p)}</div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-4">
            <h3 className="mb-2 font-bold text-white">Your Answer</h3>
            <div className="space-y-1 text-sm text-slate-300">
              {attempt.map((p, i) => (
                <div key={i}><span className="font-bold text-green-400">{String.fromCharCode(65 + i)}'</span> = {fmtPoint(p)}</div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="rounded-xl bg-white text-slate-900 hover:bg-slate-100" onClick={handleCheck}>Check Answer</Button>
            <Button variant="outline" className="rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800" onClick={handleGiveUp}>
              <Eye className="mr-2 h-4 w-4" /> {showAnswer ? "Hide" : "Show"} Answer
            </Button>
          </div>

          {showAnswer && (
            <div className="rounded-xl bg-orange-500/20 p-4 text-sm text-orange-200">
              <strong className="text-orange-100">Correct:</strong>
              <div className="mt-2 space-y-1">
                {problem.answer.map((p, i) => (<div key={i}>{String.fromCharCode(65 + i)}' = {fmtPoint(p)}</div>))}
              </div>
              <p className="mt-2 text-xs text-orange-300">{problem.detail}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ===== ETAPA 2: REASONING SECTION =====
function ReasoningSection() {
  const [mode, setMode] = useState<"identify" | "compose" | "describe">("identify");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showHints, setShowHints] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [hasAttempted, setHasAttempted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [composeStep, setComposeStep] = useState(0);

  const identifyQuestions = [
    {
      original: [[1, 2], [3, 2], [2, 4]] as Point[],
      image: [[1, -2], [3, -2], [2, -4]] as Point[],
      answer: "Reflection in the x-axis",
      acceptedAnswers: ["reflection x-axis", "reflection in x-axis", "reflect x-axis", "reflection in the x-axis", "x-axis reflection"],
      hints: ["Notice y-coordinates change sign", "x-coordinates stay the same", "Rule: (x, y) -> (x, -y)"],
    },
    {
      original: [[1, 1], [3, 1], [2, 3]] as Point[],
      image: [[4, 1], [6, 1], [5, 3]] as Point[],
      answer: "Translation by vector (3, 0)",
      acceptedAnswers: ["translation (3, 0)", "translation 3, 0", "translate (3, 0)", "translation by (3, 0)", "translation by vector (3, 0)"],
      hints: ["All points move the same amount", "x increases by 3, y stays same", "Movement is horizontal only"],
    },
    {
      original: [[2, 1], [4, 1], [3, 3]] as Point[],
      image: [[-1, 2], [-1, 4], [-3, 3]] as Point[],
      answer: "Rotation 90 degrees anticlockwise about origin",
      acceptedAnswers: ["rotation 90 anticlockwise", "rotate 90 anticlockwise", "90 degree anticlockwise", "rotation 90 degrees anticlockwise about origin", "90 anticlockwise about origin"],
      hints: ["Shape has turned", "Distance from origin preserved", "Rule: (x, y) -> (-y, x)"],
    },
    {
      original: [[1, 1], [2, 1], [1.5, 2]] as Point[],
      image: [[2, 2], [4, 2], [3, 4]] as Point[],
      answer: "Enlargement scale factor 2, centre origin",
      acceptedAnswers: ["enlargement sf 2", "enlargement scale factor 2", "enlarge by 2", "enlargement 2 origin", "enlargement scale factor 2 centre origin"],
      hints: ["Shape is bigger but same proportions", "All coordinates doubled", "Distances from origin doubled"],
    },
    {
      original: [[2, 3], [4, 3], [3, 5]] as Point[],
      image: [[-2, 3], [-4, 3], [-3, 5]] as Point[],
      answer: "Reflection in the y-axis",
      acceptedAnswers: ["reflection y-axis", "reflection in y-axis", "reflect y-axis", "reflection in the y-axis", "y-axis reflection"],
      hints: ["x-coordinates change sign", "y-coordinates stay the same", "Rule: (x, y) -> (-x, y)"],
    },
    {
      original: [[1, 1], [3, 1], [2, 3]] as Point[],
      image: [[-1, -1], [-3, -1], [-2, -3]] as Point[],
      answer: "Rotation 180 degrees about origin",
      acceptedAnswers: ["rotation 180", "rotate 180", "180 degree rotation", "rotation 180 degrees about origin", "half turn about origin"],
      hints: ["Shape is upside down and reversed", "Both coordinates change sign", "Rule: (x, y) -> (-x, -y)"],
    },
  ];

  const composeQuestions = [
    {
      t1: "Reflection in y-axis",
      t2: "Translation (2, 0)",
      original: [[1, 1], [2, 1], [1.5, 2]] as Point[],
      intermediate: [[-1, 1], [-2, 1], [-1.5, 2]] as Point[],
      final: [[1, 1], [0, 1], [0.5, 2]] as Point[],
      notation: "T o M",
    },
    {
      t1: "Rotation 90 deg anticlockwise about O",
      t2: "Reflection in x-axis",
      original: [[2, 1], [3, 1], [2.5, 2]] as Point[],
      intermediate: [[-1, 2], [-1, 3], [-2, 2.5]] as Point[],
      final: [[-1, -2], [-1, -3], [-2, -2.5]] as Point[],
      notation: "M o R",
    },
    {
      t1: "Translation (3, 2)",
      t2: "Reflection in y=x",
      original: [[1, 0], [2, 0], [1.5, 1]] as Point[],
      intermediate: [[4, 2], [5, 2], [4.5, 3]] as Point[],
      final: [[2, 4], [2, 5], [3, 4.5]] as Point[],
      notation: "M o T",
    },
    {
      t1: "Enlargement SF 2 centre O",
      t2: "Translation (-2, -2)",
      original: [[1, 1], [2, 1], [1.5, 2]] as Point[],
      intermediate: [[2, 2], [4, 2], [3, 4]] as Point[],
      final: [[0, 0], [2, 0], [1, 2]] as Point[],
      notation: "T o E",
    },
    {
      t1: "Reflection in x-axis",
      t2: "Reflection in y-axis",
      original: [[2, 3], [4, 3], [3, 5]] as Point[],
      intermediate: [[2, -3], [4, -3], [3, -5]] as Point[],
      final: [[-2, -3], [-4, -3], [-3, -5]] as Point[],
      notation: "M_y o M_x",
    },
  ];

  const describeQuestions = [
    {
      transformation: "Reflection",
      properties: ["Preserves shape and size", "Reverses orientation (mirror image)", "Points equidistant from mirror line", "Line joining point to image is perpendicular to mirror"],
    },
    {
      transformation: "Rotation",
      properties: ["Preserves shape and size", "Preserves orientation", "All points rotate same angle", "Distance from centre preserved"],
    },
    {
      transformation: "Enlargement",
      properties: ["Preserves shape but not size", "Preserves orientation", "Scale factor > 1: image larger", "Scale factor < 1: image smaller", "Negative scale factor: image inverted"],
    },
    {
      transformation: "Translation",
      properties: ["Preserves shape and size", "Preserves orientation", "All points move same vector", "No fixed points (unless vector is zero)"],
    },
  ];

  const q = identifyQuestions[currentQuestion % identifyQuestions.length];
  const compQ = composeQuestions[currentQuestion % composeQuestions.length];
  const descQ = describeQuestions[currentQuestion % describeQuestions.length];

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-3xl border-pink-200 shadow-lg">
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-pink-500 p-2 text-white"><Brain className="h-5 w-5" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Transformation Reasoning</h2>
              <p className="text-sm text-slate-500">Identify, compose, and describe transformations</p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button variant={mode === "identify" ? "default" : "outline"} className="rounded-xl" onClick={() => { setMode("identify"); setShowHints(false); setShowAnswer(false); setUserAnswer(""); setHasAttempted(false); setIsCorrect(null); }}>
              <Lightbulb className="mr-2 h-4 w-4" /> Identify
            </Button>
            <Button variant={mode === "compose" ? "default" : "outline"} className="rounded-xl" onClick={() => { setMode("compose"); setShowHints(false); setShowAnswer(false); setComposeStep(0); }}>
              <Layers className="mr-2 h-4 w-4" /> Compose
            </Button>
            <Button variant={mode === "describe" ? "default" : "outline"} className="rounded-xl" onClick={() => { setMode("describe"); setShowHints(false); setShowAnswer(false); }}>
              <FileText className="mr-2 h-4 w-4" /> Describe
            </Button>
          </div>

          {mode === "identify" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-pink-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="mb-2 font-bold text-pink-900">What transformation maps the blue shape to the orange shape?</h3>
                    <p className="text-sm text-pink-700">Examine the coordinates and determine the transformation.</p>
                  </div>
                  <div className="rounded-lg bg-pink-200 px-3 py-1 text-sm font-bold text-pink-800">
                    Q{(currentQuestion % identifyQuestions.length) + 1}/{identifyQuestions.length}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Grid 
                  points={q.original} 
                  imagePoints={q.image} 
                  customGridRange={calculateGridRange([...q.original, ...q.image])}
                  title="Identify the Transformation"
                />
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <h4 className="mb-2 font-bold text-slate-700">Original Points</h4>
                    {q.original.map((p, i) => (
                      <div key={i} className="text-blue-600 font-mono">{String.fromCharCode(65 + i)} = {fmtPoint(p)}</div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <h4 className="mb-2 font-bold text-slate-700">Image Points</h4>
                    {q.image.map((p, i) => (
                      <div key={i} className="text-orange-600 font-mono">{String.fromCharCode(65 + i)}&apos; = {fmtPoint(p)}</div>
                    ))}
                  </div>
                  
                  {/* Answer Input */}
                  <div className="rounded-xl bg-white border-2 border-pink-200 p-4">
                    <h4 className="mb-2 font-bold text-slate-700">Your Answer:</h4>
                    <input
                      type="text"
                      placeholder="e.g. Reflection in the x-axis"
                      className={`w-full rounded-lg border p-3 text-sm ${
                        isCorrect === true ? "border-green-500 bg-green-50" : 
                        isCorrect === false ? "border-red-500 bg-red-50" : "border-slate-300"
                      }`}
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && userAnswer.trim()) {
                          const normalized = userAnswer.toLowerCase().trim();
                          const correct = q.acceptedAnswers.some(a => normalized.includes(a.toLowerCase()) || a.toLowerCase().includes(normalized));
                          setIsCorrect(correct);
                          setHasAttempted(true);
                          if (!correct) setShowHints(true);
                        }
                      }}
                    />
                    <Button 
                      className="mt-2 w-full rounded-xl" 
                      onClick={() => {
                        if (userAnswer.trim()) {
                          const normalized = userAnswer.toLowerCase().trim();
                          const correct = q.acceptedAnswers.some(a => normalized.includes(a.toLowerCase()) || a.toLowerCase().includes(normalized));
                          setIsCorrect(correct);
                          setHasAttempted(true);
                          if (!correct) setShowHints(true);
                        }
                      }}
                      disabled={!userAnswer.trim()}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Check Answer
                    </Button>
                    {isCorrect === true && (
                      <div className="mt-2 rounded-lg bg-green-100 p-2 text-sm text-green-700 font-medium">
                        Correct! Well done.
                      </div>
                    )}
                    {isCorrect === false && (
                      <div className="mt-2 rounded-lg bg-red-100 p-2 text-sm text-red-700 font-medium">
                        Not quite right. Check the hints below and try again!
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-xl" 
                      onClick={() => setShowHints(!showHints)}
                      disabled={!hasAttempted && !showHints}
                    >
                      <Lightbulb className="mr-2 h-4 w-4" /> {showHints ? "Hide" : "Show"} Hints
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowAnswer(!showAnswer)}>
                      <Eye className="mr-2 h-4 w-4" /> {showAnswer ? "Hide" : "Show"} Answer
                    </Button>
                  </div>

                  {!hasAttempted && !showHints && (
                    <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600 text-center">
                      Submit an answer to unlock hints
                    </div>
                  )}

                  {showHints && (
                    <div className="rounded-xl bg-amber-50 p-4">
                      <h4 className="font-bold text-amber-800">Hints:</h4>
                      <ul className="mt-2 space-y-1 text-sm text-amber-700">
                        {q.hints.map((h, i) => <li key={i}>- {h}</li>)}
                      </ul>
                    </div>
                  )}

                  {showAnswer && (
                    <div className="rounded-xl bg-green-100 p-4">
                      <h4 className="font-bold text-green-800">Answer:</h4>
                      <p className="mt-1 text-lg font-bold text-green-700"><TextWithColumnVectors text={q.answer} /></p>
                    </div>
                  )}

                  <Button className="w-full rounded-xl" onClick={() => { setCurrentQuestion(currentQuestion + 1); setShowHints(false); setShowAnswer(false); setUserAnswer(""); setHasAttempted(false); setIsCorrect(null); }}>
                    Next Question
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === "compose" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-pink-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="mb-2 font-bold text-pink-900">Composition of Transformations</h3>
                    <p className="text-sm text-pink-700">
                      Apply <strong><TextWithColumnVectors text={compQ.t1} /></strong> first, then <strong><TextWithColumnVectors text={compQ.t2} /></strong>.
                    </p>
                    <p className="mt-2 text-sm font-mono text-pink-600">Notation: {compQ.notation}</p>
                  </div>
                  <div className="rounded-lg bg-pink-200 px-3 py-1 text-sm font-bold text-pink-800">
                    Q{(currentQuestion % composeQuestions.length) + 1}/{composeQuestions.length}
                  </div>
                </div>
              </div>

              {/* Step-by-step navigation */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={composeStep === 0 ? "default" : "outline"} className="rounded-lg" onClick={() => setComposeStep(0)}>
                  Original
                </Button>
                <Button size="sm" variant={composeStep === 1 ? "default" : "outline"} className="rounded-lg" onClick={() => setComposeStep(1)}>
                  After T1
                </Button>
                <Button size="sm" variant={composeStep === 2 ? "default" : "outline"} className="rounded-lg" onClick={() => setComposeStep(2)}>
                  Final (After T2)
                </Button>
                <Button size="sm" variant={composeStep === 3 ? "default" : "outline"} className="rounded-lg" onClick={() => setComposeStep(3)}>
                  All Steps
                </Button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Grid 
                  points={compQ.original} 
                  imagePoints={composeStep >= 2 ? compQ.final : composeStep === 1 ? compQ.intermediate : []} 
                  intermediatePoints={composeStep === 3 ? compQ.intermediate : []}
                  customGridRange={calculateGridRange([...compQ.original, ...compQ.intermediate, ...compQ.final])}
                  title={composeStep === 0 ? "Original Shape" : composeStep === 1 ? <span>After T1: <TextWithColumnVectors text={compQ.t1} /></span> : composeStep === 2 ? <span>Final: <TextWithColumnVectors text={compQ.t2} /></span> : "Complete Composition"}
                />
                <div className="space-y-4">
                  {/* Step explanations */}
                  {composeStep === 0 && (
                    <div className="rounded-xl bg-blue-50 p-4">
                      <h4 className="font-bold text-blue-800">Original Shape (Blue)</h4>
                      <div className="mt-2 space-y-1">
                        {compQ.original.map((p, i) => (
                          <div key={i} className="font-mono text-sm text-blue-600">{String.fromCharCode(65 + i)} = {fmtPoint(p)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {composeStep === 1 && (
                    <div className="rounded-xl bg-green-50 p-4">
                      <h4 className="font-bold text-green-800">After T1: <TextWithColumnVectors text={compQ.t1} /></h4>
                      <div className="mt-2 space-y-1">
                        {compQ.intermediate.map((p, i) => (
                          <div key={i} className="font-mono text-sm text-green-600">{String.fromCharCode(65 + i)}&apos; = {fmtPoint(p)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {composeStep === 2 && (
                    <div className="rounded-xl bg-orange-50 p-4">
                      <h4 className="font-bold text-orange-800">After T2: <TextWithColumnVectors text={compQ.t2} /></h4>
                      <div className="mt-2 space-y-1">                        {compQ.final.map((p, i) => (
                          <div key={i} className="font-mono text-sm text-orange-600">{String.fromCharCode(65 + i)}&apos;&apos; = {fmtPoint(p)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {composeStep === 3 && (
                    <CoordinateComparison points={compQ.original} imagePoints={compQ.final} intermediatePoints={compQ.intermediate} />
                  )}
                  
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <h4 className="font-bold text-emerald-800">Understanding Composition</h4>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-700">
                      <li>- Apply transformations in order (T1 first, then T2)</li>
                      <li>- Notation {compQ.notation} reads right to left</li>
                      <li>- Order matters! T2 o T1 is usually different from T1 o T2</li>
                    </ul>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { 
                      const shuffled = Math.floor(Math.random() * composeQuestions.length);
                      setCurrentQuestion(shuffled); 
                      setComposeStep(0);
                    }}>
                      Random Question
                    </Button>
                    <Button className="flex-1 rounded-xl" onClick={() => { setCurrentQuestion(currentQuestion + 1); setComposeStep(0); }}>
                      Next Example
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "describe" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-pink-50 p-4">
                <h3 className="mb-2 font-bold text-pink-900">Describe the Properties</h3>
                <p className="text-sm text-pink-700">What are the key properties of this transformation?</p>
              </div>

              <div className="rounded-2xl bg-white border-2 border-pink-200 p-6">
                <h3 className="text-2xl font-black text-pink-700">{descQ.transformation}</h3>
                
                <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setShowAnswer(!showAnswer)}>
                  <Eye className="mr-2 h-4 w-4" /> {showAnswer ? "Hide" : "Show"} Properties
                </Button>

                {showAnswer && (
                  <div className="mt-4 space-y-2">
                    {descQ.properties.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-pink-50 p-3">
                        <CheckSquare className="mt-0.5 h-4 w-4 text-pink-600" />
                        <span className="text-slate-700">{p}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button className="mt-4 w-full rounded-xl" onClick={() => { setCurrentQuestion(currentQuestion + 1); setShowHints(false); setShowAnswer(false); }}>
                  Next Transformation
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ===== ETAPA 3: ALGEBRA SECTION =====
function AlgebraSection() {
  const [mode, setMode] = useState<"notation" | "rules" | "composition">("notation");

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-3xl border-indigo-200 shadow-lg">
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500 p-2 text-white"><PenTool className="h-5 w-5" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Transformation Algebra</h2>
              <p className="text-sm text-slate-500">Notation, coordinate rules, and composition language</p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button variant={mode === "notation" ? "default" : "outline"} className="rounded-xl" onClick={() => setMode("notation")}>
              <FileText className="mr-2 h-4 w-4" /> Notation
            </Button>
            <Button variant={mode === "rules" ? "default" : "outline"} className="rounded-xl" onClick={() => setMode("rules")}>
              <Calculator className="mr-2 h-4 w-4" /> Coordinate Rules
            </Button>
            <Button variant={mode === "composition" ? "default" : "outline"} className="rounded-xl" onClick={() => setMode("composition")}>
              <Layers className="mr-2 h-4 w-4" /> Composition Language
            </Button>
          </div>

          {mode === "notation" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-2xl bg-indigo-50 p-4">
                  <h3 className="mb-3 font-bold text-indigo-900">Standard Notation</h3>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white p-3">
                      <span className="font-mono text-lg font-bold text-cyan-600">T</span>
                      <span className="ml-2 text-slate-700">= Translation</span>
                      <div className="mt-1 text-sm text-slate-500"><TextWithColumnVectors text="T(a,b) or T by vector (a, b)" /></div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <span className="font-mono text-lg font-bold text-violet-600">M</span>
                      <span className="ml-2 text-slate-700">= Reflection (Mirror)</span>
                      <div className="mt-1 text-sm text-slate-500">M in line l, or M(y=x)</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <span className="font-mono text-lg font-bold text-blue-600">R</span>
                      <span className="ml-2 text-slate-700">= Rotation</span>
                      <div className="mt-1 text-sm text-slate-500">R(angle, centre) e.g. R(90, O)</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <span className="font-mono text-lg font-bold text-orange-600">E</span>
                      <span className="ml-2 text-slate-700">= Enlargement</span>
                      <div className="mt-1 text-sm text-slate-500">E(k, centre) e.g. E(2, O)</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 font-bold text-slate-900">Image Notation</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-mono font-bold text-blue-600">P</span> = original point</p>
                    <p><span className="font-mono font-bold text-orange-600">P'</span> = image after one transformation</p>
                    <p><span className="font-mono font-bold text-violet-600">P''</span> = image after two transformations</p>
                    <p><span className="font-mono font-bold text-emerald-600">P'''</span> = image after three transformations</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4">
                  <h3 className="mb-3 font-bold text-amber-900">Examples</h3>
                  <div className="space-y-2 font-mono text-sm">
                    <p><TextWithColumnVectors text={"T(3, -2): A(1, 4) -> A'(4, 2)"} /></p>
                    <p>{"M(y-axis): B(2, 3) -> B'(-2, 3)"}</p>
                    <p>{"R(90, O): C(1, 0) -> C'(0, 1)"}</p>
                    <p>{"E(2, O): D(3, 1) -> D'(6, 2)"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "rules" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-cyan-50 p-4">
                  <h3 className="mb-3 flex items-center gap-1 font-bold text-cyan-900">Translation T<ColumnVector vector={["a", "b"]} /></h3>
                  <div className="rounded-xl bg-white p-3 font-mono text-center text-lg">
                    {"(x, y) -> (x + a, y + b)"}
                  </div>
                  <p className="mt-2 text-sm text-cyan-700">Add the vector components to each coordinate.</p>
                </div>

                <div className="rounded-2xl bg-violet-50 p-4">
                  <h3 className="mb-3 font-bold text-violet-900">Reflection Rules</h3>
                  <div className="space-y-2 text-sm">
                    <div className="rounded-lg bg-white p-2 font-mono">{"x-axis: (x, y) -> (x, -y)"}</div>
                    <div className="rounded-lg bg-white p-2 font-mono">{"y-axis: (x, y) -> (-x, y)"}</div>
                    <div className="rounded-lg bg-white p-2 font-mono">{"y = x: (x, y) -> (y, x)"}</div>
                    <div className="rounded-lg bg-white p-2 font-mono">{"y = -x: (x, y) -> (-y, -x)"}</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-blue-50 p-4">
                  <h3 className="mb-3 font-bold text-blue-900">Rotation about Origin</h3>
                  <div className="space-y-2 text-sm">
                    <div className="rounded-lg bg-white p-2 font-mono">{"90 deg ACW: (x, y) -> (-y, x)"}</div>
                    <div className="rounded-lg bg-white p-2 font-mono">{"90 deg CW: (x, y) -> (y, -x)"}</div>
                    <div className="rounded-lg bg-white p-2 font-mono">{"180 deg: (x, y) -> (-x, -y)"}</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-orange-50 p-4">
                  <h3 className="mb-3 font-bold text-orange-900">Enlargement E(k, O)</h3>
                  <div className="rounded-xl bg-white p-3 font-mono text-center text-lg">
                    {"(x, y) -> (kx, ky)"}
                  </div>
                  <p className="mt-2 text-sm text-orange-700">When centre is origin, multiply each coordinate by scale factor.</p>
                  <p className="mt-1 text-xs text-orange-600">For other centres: use vector method.</p>
                </div>
              </div>
            </div>
          )}

          {mode === "composition" && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-2xl bg-indigo-50 p-4">
                    <h3 className="mb-3 font-bold text-indigo-900">Composition Notation</h3>
                    <div className="space-y-3">
                      <div className="rounded-xl bg-white p-3">
                        <p className="font-mono text-lg font-bold">T2 o T1</p>
                        <p className="text-sm text-slate-600">Read: "T2 after T1" or "T2 composed with T1"</p>
                        <p className="mt-1 text-xs text-slate-500">Apply T1 first, then T2 to the result</p>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="font-mono text-lg font-bold">M o R o T</p>
                        <p className="text-sm text-slate-600">Apply T first, then R, then M</p>
                        <p className="mt-1 text-xs text-slate-500">Read right to left!</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-amber-50 p-4">
                    <h3 className="mb-3 font-bold text-amber-900">Important Properties</h3>
                    <ul className="space-y-2 text-sm text-amber-800">
                      <li>- Order matters: T2 o T1 != T1 o T2 (usually)</li>
                      <li>- Two reflections in parallel lines = translation</li>
                      <li>- Two reflections in intersecting lines = rotation</li>
                      <li>- M o M (same line) = Identity</li>
                      <li>- R(180) o R(180) = Identity</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-3 font-bold text-slate-900">Worked Example</h3>
                  <div className="space-y-3 text-sm">
                    <p className="font-bold"><TextWithColumnVectors text={"Find M(y-axis) o T(3, 0) applied to P(1, 2)"} /></p>
                    
                    <div className="rounded-lg bg-white p-3">
                      <p className="font-bold text-blue-600">Step 1: Apply <TextWithColumnVectors text="T(3, 0)" /> first</p>
                      <p className="font-mono">{"P(1, 2) -> P'(1+3, 2+0) = P'(4, 2)"}</p>
                    </div>
                    
                    <div className="rounded-lg bg-white p-3">
                      <p className="font-bold text-violet-600">{"Step 2: Apply M(y-axis) to P'"}</p>
                      <p className="font-mono">{"P'(4, 2) -> P''(-4, 2)"}</p>
                    </div>
                    
                    <div className="rounded-lg bg-green-100 p-3">
                      <p className="font-bold text-green-700">Final answer:</p>
                      <p className="font-mono">{"P(1, 2) -> P''(-4, 2)"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ===== ETAPA 4: ASSESSMENT SECTION =====
interface WorksheetProblem {
  type: string;
  shape: Point[];
  description: string;
  answer: Point[];
}

function AssessmentSection() {
  const [mode, setMode] = useState<"worksheet" | "teacher" | "analytics">("worksheet");
  const [worksheetProblems, setWorksheetProblems] = useState<WorksheetProblem[]>([]);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [numProblems, setNumProblems] = useState(5);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, Point[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [classStats, setClassStats] = useState<{ totalStudents: number; totalAttempts: number; averageScore: number; topicStats: { topic: string; correct: number; total: number }[] } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (mode === "teacher" || mode === "analytics") {
      loadClassStats();
    }
  }, [mode]);

  async function loadClassStats() {
    setLoadingStats(true);
    try {
      const stats = await getClassStats();
      setClassStats(stats);
    } catch (error) {
      console.error("Error loading class stats:", error);
    }
    setLoadingStats(false);
  }

  function handleModeChange(newMode: "worksheet" | "teacher" | "analytics") {
    setMode(newMode);
  }

  function generateWorksheet() {
    const problems: WorksheetProblem[] = [];
    const types = difficulty === "easy" 
      ? ["translation", "reflection"] 
      : difficulty === "medium" 
        ? ["translation", "reflection", "rotation", "enlargement"]
        : ["translation", "reflection", "rotation", "enlargement", "combined"];

    for (let i = 0; i < numProblems; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const shape: Point[] = [
        [randInt(-3, 3), randInt(-3, 3)],
        [randInt(-3, 3), randInt(-3, 3)],
        [randInt(-3, 3), randInt(-3, 3)],
      ];

      let description = "";
      let answer: Point[] = [];

      if (type === "translation") {
        const v: Point = [randInt(-4, 4), randInt(-4, 4)];
        description = `Translate by vector (${v[0]}, ${v[1]})`;
        answer = shape.map((p) => translatePoint(p, v));
      } else if (type === "reflection") {
        const lines = ["x-axis", "y-axis", "y=x"];
        const line = lines[Math.floor(Math.random() * lines.length)];
        description = `Reflect in the ${line}`;
        answer = shape.map((p) => reflectPoint(p, line));
      } else if (type === "rotation") {
        const angles = [90, -90, 180];
        const angle = angles[Math.floor(Math.random() * angles.length)];
        const dir = angle === 90 ? "anticlockwise" : angle === -90 ? "clockwise" : "";
        description = `Rotate ${Math.abs(angle)} degrees ${dir} about origin`;
        answer = shape.map((p) => rotatePoint(p, angle, [0, 0]));
      } else if (type === "enlargement") {
        const scale = difficulty === "hard" ? randInt(-2, 3) : randInt(2, 3);
        description = `Enlarge by scale factor ${scale} from origin`;
        answer = shape.map((p) => enlargePoint(p, scale, [0, 0]));
      } else {
        const v: Point = [randInt(-2, 2), randInt(-2, 2)];
        description = `Translate by (${v[0]}, ${v[1]}), then reflect in y-axis`;
        const intermediate = shape.map((p) => translatePoint(p, v));
        answer = intermediate.map((p) => reflectPoint(p, "y-axis"));
      }

      problems.push({ type, shape, description, answer });
    }

    setWorksheetProblems(problems);
    setStudentAnswers({});
    setSubmitted(false);
  }

  function calculateScore() {
    let correct = 0;
    worksheetProblems.forEach((prob, i) => {
      const studentAns = studentAnswers[i];
      if (studentAns) {
        const isCorrect = prob.answer.every((p, j) => 
          studentAns[j] && Math.abs(p[0] - studentAns[j][0]) < 0.5 && Math.abs(p[1] - studentAns[j][1]) < 0.5
        );
        if (isCorrect) correct++;
      }
    });
    return correct;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-3xl border-amber-200 shadow-lg">
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-amber-500 p-2 text-white"><ClipboardList className="h-5 w-5" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Assessment Platform</h2>
              <p className="text-sm text-slate-500">Auto-generated worksheets, teacher mode, and analytics</p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button variant={mode === "worksheet" ? "default" : "outline"} className="rounded-xl" onClick={() => handleModeChange("worksheet")}>
              <FileText className="mr-2 h-4 w-4" /> Worksheets
            </Button>
            <Button variant={mode === "teacher" ? "default" : "outline"} className="rounded-xl" onClick={() => handleModeChange("teacher")}>
              <Users className="mr-2 h-4 w-4" />
              Teacher Mode
            </Button>
            <Button variant={mode === "analytics" ? "default" : "outline"} className="rounded-xl" onClick={() => handleModeChange("analytics")}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </div>



          {mode === "worksheet" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-amber-50 p-4">
                <h3 className="mb-3 font-bold text-amber-900">Generate Worksheet</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Difficulty</label>
                    <select 
                      className="mt-1 w-full rounded-lg border p-2"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
                    >
                      <option value="easy">Easy (T, M)</option>
                      <option value="medium">Medium (T, M, R, E)</option>
                      <option value="hard">Hard (+ Combined)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Number of Problems</label>
                    <input 
                      type="number" 
                      className="mt-1 w-full rounded-lg border p-2"
                      value={numProblems}
                      min={1}
                      max={20}
                      onChange={(e) => setNumProblems(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full rounded-xl" onClick={generateWorksheet}>
                      <Shuffle className="mr-2 h-4 w-4" /> Generate
                    </Button>
                  </div>
                </div>
              </div>

              {worksheetProblems.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">Worksheet ({worksheetProblems.length} problems)</h3>
                    {submitted && (
                      <div className="rounded-xl bg-green-100 px-4 py-2 text-green-800">
                        Score: {calculateScore()} / {worksheetProblems.length}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-6">
                    {worksheetProblems.map((prob, i) => (
                      <div key={i} className="rounded-2xl border bg-white p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-bold text-amber-800">Q{i + 1}</span>
                          <span className="text-sm text-slate-600"><TextWithColumnVectors text={prob.description} /></span>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Original Points:</p>
                            <div className="space-y-1">
                              {prob.shape.map((p, j) => (
                                <div key={j} className="font-mono text-blue-600">{String.fromCharCode(65 + j)} = {fmtPoint(p)}</div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Your Answers:</p>
                            <div className="space-y-2">
                              {prob.shape.map((_, j) => (
                                <div key={j} className="flex items-center gap-2">
                                  <span className="font-mono text-orange-600">{String.fromCharCode(65 + j)}'</span>
                                  <input
                                    type="text"
                                    placeholder="(x, y)"
                                    className="flex-1 rounded-lg border p-1 text-sm"
                                    onChange={(e) => {
                                      const match = e.target.value.match(/\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?/);
                                      if (match) {
                                        const newAnswers = { ...studentAnswers };
                                        if (!newAnswers[i]) newAnswers[i] = [];
                                        newAnswers[i][j] = [Number(match[1]), Number(match[2])];
                                        setStudentAnswers(newAnswers);
                                      }
                                    }}
                                  />
                                  {submitted && (
                                    prob.answer[j][0] === studentAnswers[i]?.[j]?.[0] && 
                                    prob.answer[j][1] === studentAnswers[i]?.[j]?.[1]
                                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                      : <XCircle className="h-5 w-5 text-red-500" />
                                  )}
                                </div>
                              ))}
                            </div>
                            {submitted && (
                              <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                                Correct: {prob.answer.map((p, j) => `${String.fromCharCode(65 + j)}'${fmtPoint(p)}`).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button className="w-full rounded-xl" onClick={() => setSubmitted(true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Submit & Check
                  </Button>
                </div>
              )}
            </div>
          )}

          {mode === "teacher" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-slate-50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Teacher Dashboard</h3>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={loadClassStats} disabled={loadingStats}>
                    {loadingStats ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="text-3xl font-black text-blue-600">{classStats?.totalStudents ?? "--"}</div>
                    <div className="text-sm text-slate-500">Students Active</div>
                  </div>
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="text-3xl font-black text-green-600">{classStats?.totalAttempts ?? "--"}</div>
                    <div className="text-sm text-slate-500">Problems Completed</div>
                  </div>
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="text-3xl font-black text-amber-600">{classStats?.averageScore ?? "--"}%</div>
                    <div className="text-sm text-slate-500">Average Score</div>
                  </div>
                </div>

                {classStats && classStats.topicStats && (
                  <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
                    <h4 className="mb-3 font-bold text-slate-700">Performance by Topic</h4>
                    <div className="space-y-2">
                      {classStats.topicStats.map((stat) => (
                        <div key={stat.topic} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{stat.topic}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full" 
                                style={{ width: stat.total > 0 ? `${(stat.correct / stat.total) * 100}%` : "0%" }} 
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-16">
                              {stat.correct}/{stat.total} ({stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!classStats && !loadingStats && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                    No data yet. Students will appear here once they start practicing.
                  </div>
                )}

                <div className="mt-6">
                  <h4 className="mb-3 font-bold text-slate-700">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={generateWorksheet}>
                      <FileText className="mr-2 h-4 w-4" /> Create Class Worksheet
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4">
                <h4 className="mb-2 font-bold text-amber-900">Worksheet Settings</h4>
                <div className="space-y-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span>Show step-by-step solutions after submission</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span>Allow multiple attempts</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span>Time limit per problem</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span>Randomize problem order</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {mode === "analytics" && (
            <div className="space-y-6">
              {loadingStats ? (
                <div className="rounded-2xl bg-blue-50 p-4 text-center">
                  <p className="text-blue-700">Loading analytics...</p>
                </div>
              ) : classStats ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <h3 className="mb-4 font-bold text-slate-900">Performance by Topic</h3>
                      <div className="space-y-3">
                        {classStats.topicStats.map((stat) => {
                          const score = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
                          const colors: Record<string, string> = {
                            translation: "bg-cyan-500",
                            reflection: "bg-violet-500",
                            rotation: "bg-blue-500",
                            enlargement: "bg-orange-500",
                          };
                          return (
                            <div key={stat.topic}>
                              <div className="flex justify-between text-sm">
                                <span className="capitalize">{stat.topic}</span>
                                <span className="font-bold">{score}%</span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div className={`h-full ${colors[stat.topic] || "bg-gray-500"}`} style={{ width: `${score}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <h3 className="mb-4 font-bold text-slate-900">Summary Statistics</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                          <span className="text-sm text-slate-600">Total Students</span>
                          <span className="font-bold text-blue-600">{classStats.totalStudents}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                          <span className="text-sm text-slate-600">Total Attempts</span>
                          <span className="font-bold text-green-600">{classStats.totalAttempts}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                          <span className="text-sm text-slate-600">Average Score</span>
                          <span className="font-bold text-amber-600">{classStats.averageScore}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-green-50 p-4">
                    <h3 className="mb-3 font-bold text-green-900">Recommendations</h3>
                    <ul className="space-y-2 text-sm text-green-800">
                      {classStats.topicStats.filter(s => s.total > 0 && (s.correct / s.total) < 0.7).map(s => (
                        <li key={s.topic}>- Focus more practice on <span className="capitalize font-bold">{s.topic}</span> ({Math.round((s.correct / s.total) * 100)}% success rate)</li>
                      ))}
                      {classStats.topicStats.every(s => s.total === 0 || (s.correct / s.total) >= 0.7) && (
                        <li>- Great progress! Students are performing well across all topics.</li>
                      )}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-blue-50 p-4 text-center">
                  <BarChart3 className="mx-auto h-12 w-12 text-blue-400 mb-3" />
                  <h3 className="font-bold text-blue-900">No Data Yet</h3>
                  <p className="mt-2 text-sm text-blue-700">
                    Analytics will appear here once students start completing practice problems.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ===== MAIN APP =====
export default function TransformationsApp() {
  const [activeSection, setActiveSection] = useState("translation");
  const [studentName, setStudentName] = useState("");
  const [studentSchool, setStudentSchool] = useState("");
  const [studentYear, setStudentYear] = useState("");
  const [isTeacher, setIsTeacher] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [schoolInput, setSchoolInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);

  // Check for saved name on mount
  useEffect(() => {
    const saved = localStorage.getItem("transformations_student_data");
    if (saved) {
      const data = JSON.parse(saved);
      setStudentName(data.name || "");
      setStudentSchool(data.school || "");
      setStudentYear(data.year || "");
      setIsTeacher(data.isTeacher || false);
      setStudentId(data.studentId || null);
      setHasEntered(true);
    }
  }, []);

  async function handleEnter() {
    if (nameInput.trim()) {
      setStudentName(nameInput.trim());
      setStudentSchool(schoolInput.trim());
      setStudentYear(yearInput.trim());
      setHasEntered(true);
      
      // Save to Firestore
      try {
        const id = await createOrUpdateStudent({
          name: nameInput.trim(),
          school: schoolInput.trim(),
          year: yearInput.trim(),
          isTeacher
        });
        setStudentId(id);
        localStorage.setItem("transformations_student_data", JSON.stringify({
          name: nameInput.trim(),
          school: schoolInput.trim(),
          year: yearInput.trim(),
          isTeacher,
          studentId: id
        }));
      } catch (error) {
        console.error("Error saving to Firestore:", error);
        // Still save locally even if Firestore fails
        localStorage.setItem("transformations_student_data", JSON.stringify({
          name: nameInput.trim(),
          school: schoolInput.trim(),
          year: yearInput.trim(),
          isTeacher
        }));
      }
    }
  }

  // Landing page
  if (!hasEntered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="w-full max-w-md"
        >
          <Card className="rounded-3xl border-0 bg-white/10 backdrop-blur shadow-2xl">
            <CardContent className="p-8">
              <div className="mb-6 flex justify-center">
                <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 p-4">
                  <Layers className="h-10 w-10 text-white" />
                </div>
              </div>
              
              <h1 className="mb-2 text-center text-3xl font-black text-white">Transformations</h1>
              <p className="mb-6 text-center text-sm text-slate-300">Interactive Geometry Lab</p>
              
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    <User className="mr-2 inline h-4 w-4" />
                    Your name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    className="w-full rounded-xl border-0 bg-white/20 p-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">School</label>
                    <input
                      type="text"
                      placeholder="School name"
                      className="w-full rounded-xl border-0 bg-white/20 p-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={schoolInput}
                      onChange={(e) => setSchoolInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">Year</label>
                    <select
                      className="w-full rounded-xl border-0 bg-white/20 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={yearInput}
                      onChange={(e) => setYearInput(e.target.value)}
                    >
                      <option value="" className="bg-slate-800">Select year</option>
                      <option value="Year 7" className="bg-slate-800">Year 7</option>
                      <option value="Year 8" className="bg-slate-800">Year 8</option>
                      <option value="Year 9" className="bg-slate-800">Year 9</option>
                      <option value="Year 10" className="bg-slate-800">Year 10</option>
                      <option value="Year 11" className="bg-slate-800">Year 11</option>
                      <option value="Year 12" className="bg-slate-800">Year 12</option>
                      <option value="Year 13" className="bg-slate-800">Year 13</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-xl bg-white/10 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTeacher}
                    onChange={(e) => setIsTeacher(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-400"
                  />
                  <span className="text-sm text-slate-300">I am a teacher</span>
                </label>
                
                <Button 
                  className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 py-6 text-lg font-bold hover:from-blue-600 hover:to-violet-700"
                  onClick={handleEnter}
                  disabled={!nameInput.trim()}
                >
                  Start Learning
                </Button>
              </div>
              
              <div className="mt-6 grid grid-cols-4 gap-2">
                {[
                  { icon: ArrowRight, label: "Translate", color: "bg-cyan-500/20" },
                  { icon: FlipHorizontal, label: "Reflect", color: "bg-violet-500/20" },
                  { icon: RotateCcw, label: "Rotate", color: "bg-blue-500/20" },
                  { icon: Maximize2, label: "Enlarge", color: "bg-orange-500/20" },
                ].map((item, i) => (
                  <div key={i} className={`rounded-xl ${item.color} p-3 text-center`}>
                    <item.icon className="mx-auto h-5 w-5 text-white" />
                    <span className="mt-1 block text-xs text-slate-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-6 md:grid-cols-[1.5fr_1fr] md:p-10">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="inline-flex items-center rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-blue-200">
                  <BookOpen className="mr-2 h-4 w-4" /> Geometry Lab
                </div>
                <div className="rounded-xl bg-gradient-to-r from-blue-500/20 to-violet-500/20 px-3 py-2 text-sm font-medium text-white">
                  Welcome, {studentName}!
                </div>
              </div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">Transformations</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                Master translations, reflections, rotations and enlargements through interactive coordinate geometry, step-by-step algebraic methods, and randomly generated practice.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
              <h2 className="text-lg font-bold">Learning Goals</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                <li>- Understand properties of each transformation</li>
                <li>- Apply coordinate rules to find image points</li>
                <li>- Use algebraic methods suitable for paper</li>
                <li>- Explore composition of transformations</li>
                <li>- Practise with randomly generated problems</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Button
                key={s.id}
                variant={activeSection === s.id ? "default" : "outline"}
                className={`rounded-xl ${activeSection === s.id ? `${s.color} text-white` : ""}`}
                onClick={() => setActiveSection(s.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {s.title}
              </Button>
            );
          })}
        </div>

        {/* Active Section */}
        {activeSection === "translation" && <TranslationSection />}
        {activeSection === "reflection" && <ReflectionSection />}
        {activeSection === "rotation" && <RotationSection />}
        {activeSection === "enlargement" && <EnlargementSection />}
        {activeSection === "composition" && <CompositionSection />}
        {activeSection === "reasoning" && <ReasoningSection />}
        {activeSection === "algebra" && <AlgebraSection />}
        {activeSection === "practice" && <PracticeSection studentId={studentId} studentName={studentName} studentSchool={studentSchool} studentYear={studentYear} />}
        {activeSection === "assessment" && <AssessmentSection />}
      </div>
    </div>
  );
}