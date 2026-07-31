import {
  Background,
  Handle,
  MarkerType,
  NodeToolbar,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  IconChevronRight,
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
  onSelect: () => void;
  onOpen: () => void;
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

function displayPositionFor(node: GraphNode, nodeCount: number) {
  const position = node.position ?? fallbackPositionFor(node.id);
  if (nodeCount <= 6) return position;

  return {
    x: Math.round(position.x * 1.65),
    y: position.y,
  };
}

export function worldEdgeFor(
  edge: LabProjection["graph"]["edges"][number],
): Edge {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "smoothstep",
    className: `world-edge world-edge--${edge.state ?? "known"}`,
    selectable: false,
    focusable: false,
    deletable: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  };
}

function WorldNode({ data, selected }: NodeProps<WorldFlowNode>) {
  const node = data.node;
  const discovered = node.state !== "undiscovered";
  const stateLabel =
    selected
      ? "選択中"
      : node.state === "discovered"
        ? "発見済み"
        : "未発見";

  return (
    <>
      <Handle type="target" position={Position.Left} />
      {discovered ? (
        <button
          type="button"
          className={`world-node world-node--${node.state} ${selected ? "is-focused" : ""}`}
          aria-label={`${node.label}${node.detail ? `、${node.detail}` : ""}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            data.onSelect();
          }}
        >
          <span className="world-node-index" aria-hidden="true">
            {String(data.index + 1).padStart(2, "0")}
          </span>
          <span className="world-node-state" aria-hidden="true">
            {stateLabel}
          </span>
          <span className="world-node-icon" aria-hidden="true">
            <AppIcon name={node.icon} stroke={1.7} />
          </span>
          <span className="world-node-copy">
            <strong>{node.label}</strong>
            {node.detail ? <small>{node.detail}</small> : null}
            {node.progress ? <em>{node.progress}</em> : null}
          </span>
        </button>
      ) : (
        <div className="world-node world-node--undiscovered">
          <span className="world-node-index" aria-hidden="true">
            {String(data.index + 1).padStart(2, "0")}
          </span>
          <span className="world-node-state" aria-hidden="true">
            {stateLabel}
          </span>
          <span className="world-node-copy">
            <strong>{node.category ?? "未発見"}</strong>
          </span>
        </div>
      )}
      <NodeToolbar
        className="world-node-toolbar"
        isVisible={selected && discovered}
        position={Position.Bottom}
        offset={12}
      >
        <button
          type="button"
          className="world-node-action"
          data-testid="next-action-map"
          onClick={(event) => {
            event.stopPropagation();
            data.onOpen();
          }}
        >
          次の一手
          <span aria-hidden="true">
            <IconChevronRight />
          </span>
        </button>
      </NodeToolbar>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

const nodeTypes = { world: WorldNode };

interface MapCanvasProps {
  projection: LabProjection;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  onOpenNode: () => void;
}

export function MapCanvas({
  projection,
  selectedNodeId,
  onSelectNode,
  onOpenNode,
}: MapCanvasProps) {
  const nodes = useMemo<WorldFlowNode[]>(
    () =>
      projection.graph.nodes.map((node, index) => ({
        id: node.id,
        type: "world",
        position: displayPositionFor(node, projection.graph.nodes.length),
        data: {
          node,
          index,
          onSelect: () => onSelectNode(node.id),
          onOpen: onOpenNode,
        },
        selected: selectedNodeId === node.id,
        selectable: false,
        draggable: false,
        deletable: false,
        focusable: false,
      })),
    [onOpenNode, onSelectNode, projection.graph.nodes, selectedNodeId],
  );

  const edges = useMemo<Edge[]>(
    () => projection.graph.edges.map(worldEdgeFor),
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
          fitViewOptions={{ padding: 0.04, minZoom: 0.42, maxZoom: 1.05 }}
          minZoom={0.42}
          maxZoom={1.05}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
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
                <span>{node.category ?? "未発見"} · 未発見</span>
              </div>
            ) : (
              <div
                className={`mobile-map-node mobile-map-node--${node.state} ${
                  selectedNodeId === node.id ? "is-focused" : ""
                }`}
              >
                <button
                  type="button"
                  className="mobile-map-select"
                  aria-pressed={selectedNodeId === node.id}
                  onClick={() => onSelectNode(node.id)}
                >
                  <AppIcon name={node.icon} stroke={1.7} />
                  <span>
                    <strong>{node.label}</strong>
                    {node.detail ? <small>{node.detail}</small> : null}
                  </span>
                  {selectedNodeId === node.id ? (
                    <IconCircleDot aria-hidden="true" />
                  ) : (
                    <IconCircleCheck aria-hidden="true" />
                  )}
                </button>
                {selectedNodeId === node.id ? (
                  <button
                    type="button"
                    className="mobile-map-action"
                    data-testid="next-action-mobile"
                    onClick={onOpenNode}
                  >
                    次の一手
                    <IconChevronRight aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
