import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
} from "@tabler/icons-react";
import { useMemo } from "react";
import type { GraphNode, LabProjection } from "../types";
import { AppIcon } from "./AppIcon";

interface WorldNodeData extends Record<string, unknown> {
  node: GraphNode;
  index: number;
}

type WorldFlowNode = Node<WorldNodeData, "world">;

export const WORLD_POSITIONS: ReadonlyMap<
  string,
  { x: number; y: number }
> = new Map([
  ["map-01", { x: 0, y: 10 }],
  ["map-02", { x: 0, y: 155 }],
  ["map-03", { x: 0, y: 300 }],
  ["map-04", { x: 205, y: 10 }],
  ["map-05", { x: 205, y: 155 }],
  ["map-06", { x: 205, y: 300 }],
  ["map-07", { x: 410, y: 10 }],
  ["map-08", { x: 410, y: 155 }],
  ["map-09", { x: 410, y: 300 }],
  ["map-10", { x: 615, y: 10 }],
  ["map-11", { x: 615, y: 155 }],
  ["map-12", { x: 615, y: 300 }],
  ["map-13", { x: 820, y: 155 }],
  ["map-14", { x: 820, y: 340 }],
]);

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fallbackPositionFor(nodeId: string) {
  const worldPosition = WORLD_POSITIONS.get(nodeId);
  if (worldPosition) return worldPosition;

  const hash = stableHash(nodeId);
  return {
    x: 24 + (hash % 4) * 205,
    y: 25 + (Math.floor(hash / 4) % 4) * 145,
  };
}

function WorldNode({ data, selected }: NodeProps<WorldFlowNode>) {
  const node = data.node;
  return (
    <div
      className={`world-node world-node--${node.state} ${selected ? "is-focused" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span className="world-node-index" aria-hidden="true">
        {String(data.index + 1).padStart(2, "0")}
      </span>
      {node.state !== "undiscovered" ? (
        <span className="world-node-icon">
          <AppIcon name={node.icon} stroke={1.7} />
        </span>
      ) : null}
      <span className="world-node-copy">
        <strong>{node.label}</strong>
        {node.detail ? <small>{node.detail}</small> : null}
        {node.progress ? <em>{node.progress}</em> : null}
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { world: WorldNode };

interface MapCanvasProps {
  projection: LabProjection;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
}

export function MapCanvas({
  projection,
  selectedNodeId,
  onSelectNode,
}: MapCanvasProps) {
  const nodes = useMemo<WorldFlowNode[]>(
    () =>
      projection.graph.nodes.map((node, index) => ({
        id: node.id,
        type: "world",
        position: node.position ?? fallbackPositionFor(node.id),
        data: { node, index },
        selected: selectedNodeId === node.id,
        selectable: node.state !== "undiscovered",
        draggable: false,
        focusable: node.state !== "undiscovered",
        ariaLabel:
          node.state === "undiscovered"
            ? "未発見の地点"
            : `${node.label}${node.detail ? `、${node.detail}` : ""}`,
      })),
    [projection.graph.nodes, selectedNodeId],
  );

  const edges = useMemo<Edge[]>(
    () =>
      projection.graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        className: `world-edge world-edge--${edge.state ?? "known"}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
        },
      })),
    [projection.graph.edges],
  );

  return (
    <>
      <div className="map-canvas" aria-label="探索経路の地図">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.45, maxZoom: 1 }}
          minZoom={0.45}
          maxZoom={1}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          panOnDrag={false}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            const graphNode = node.data.node;
            if (graphNode.state !== "undiscovered") onSelectNode(node.id);
          }}
        >
          <Background color="transparent" gap={40} />
        </ReactFlow>
      </div>

      <ol className="mobile-map" aria-label="探索経路の地図">
        {projection.graph.nodes.map((node) => (
          <li key={node.id}>
            {node.state === "undiscovered" ? (
              <div className="mobile-map-node mobile-map-node--undiscovered">
                <IconCircleDashed aria-hidden="true" />
                <span>未発見</span>
              </div>
            ) : (
              <button
                type="button"
                className={`mobile-map-node mobile-map-node--${node.state}`}
                aria-pressed={selectedNodeId === node.id}
                onClick={() => onSelectNode(node.id)}
              >
                <AppIcon name={node.icon} stroke={1.7} />
                <span>
                  <strong>{node.label}</strong>
                  {node.detail ? <small>{node.detail}</small> : null}
                </span>
                {node.state === "selected" ? (
                  <IconCircleDot aria-hidden="true" />
                ) : (
                  <IconCircleCheck aria-hidden="true" />
                )}
              </button>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
