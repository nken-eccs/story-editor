import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogTitle, IconButton, Box, Tooltip } from '@mui/material';
import { Close, Refresh } from '@mui/icons-material';
import ReactFlow, {
    Node,
    Edge,
    Background,
    Controls,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { analyzeFlowchartRelationship } from '../services/geminiService';

interface VersionMapProps {
    open: boolean;
    onClose: () => void;
    versions: any[];
    currentVersionIndex: number;
    onVersionSelect: (index: number) => void;
    onReanalyze: () => void;  // 追加
}

interface FlowchartRelationship {
    sharedNodes: string[];
    divergencePoint: string | null;
    branchPoint: {
        source: string;
        target: string;
        label: string;
    } | null;
}

const calculateFlowchartLayout = (
    nodes: any[],
    edges: any[],
    baseX: number,
    divergencePoint: string | null = null
) => {
    const nodeWidth = 150;
    const nodeHeight = 40;
    const verticalGap = 100;

    // 各ノードの依存関係を構築
    const dependencies: { [key: string]: Set<string> } = {};
    nodes.forEach(node => {
        dependencies[node.id] = new Set();
    });

    edges.forEach(edge => {
        dependencies[edge.target].add(edge.source);
    });

    // トポロジカルソートでレベルを計算
    const levels: { [key: string]: number } = {};
    const visited = new Set<string>();

    const calculateLevel = (nodeId: string): number => {
        if (visited.has(nodeId)) return levels[nodeId];
        visited.add(nodeId);

        const deps = dependencies[nodeId];
        if (deps.size === 0) {
            levels[nodeId] = 0;
        } else {
            const maxDependencyLevel = Math.max(
                ...Array.from(deps).map(dep => calculateLevel(dep))
            );
            levels[nodeId] = maxDependencyLevel + 1;
        }

        return levels[nodeId];
    };

    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            calculateLevel(node.id);
        }
    });

    // レベルごとにノードをグループ化
    const levelGroups: { [level: number]: string[] } = {};
    Object.entries(levels).forEach(([nodeId, level]) => {
        if (!levelGroups[level]) levelGroups[level] = [];
        levelGroups[level].push(nodeId);
    });

    // ノードの座標を計算
    const positions: { [key: string]: { x: number, y: number, highlight?: boolean } } = {};
    const maxLevel = Math.max(...Object.values(levels));

    Object.entries(levelGroups).forEach(([level, nodeIds]) => {
        const y = Number(level) * verticalGap;
        nodeIds.forEach((nodeId, index) => {
            const x = baseX + (index - (nodeIds.length - 1) / 2) * (nodeWidth + 40);
            positions[nodeId] = { x, y };

            // 分岐点のノードを強調
            const node = nodes.find(n => n.id === nodeId);
            if (node?.data.label === divergencePoint) {
                positions[nodeId].highlight = true;
            }
        });
    });

    return {
        positions,
        maxLevel,
        height: (maxLevel + 1) * verticalGap,
        centerX: baseX
    };
};

const VersionMap: React.FC<VersionMapProps> = ({
    open,
    onClose,
    versions,
    currentVersionIndex,
    onVersionSelect,
    onReanalyze,  // 追加
}) => {
    const [relationships, setRelationships] = useState<{ [key: string]: FlowchartRelationship }>({});

    // バージョン間の関係性を分析
    useEffect(() => {
        const analyzeRelationships = async () => {
            const newRelationships: { [key: string]: any } = {};

            for (let i = 1; i < versions.length; i++) {
                if (versions[i].flowchartData && versions[i-1].flowchartData) {
                    // インデックスの順序を修正：i-1が元のストーリー、iが分岐後のストーリー
                    const result = await analyzeFlowchartRelationship(
                        versions[i-1].flowchartData, // 元のストーリー
                        versions[i].flowchartData,    // 分岐後のストーリー
                        versions[i-1].text,          // 元のストーリーのテキスト
                        versions[i].text             // 分岐後のストーリーのテキスト
                    );
                    newRelationships[`${i}-${i-1}`] = result;
                }
            }

            setRelationships(newRelationships);
        };

        if (open) {
            analyzeRelationships();
        }
    }, [versions, open]);

    // フローチャートの表示用ノードとエッジを生成
    const { nodes, edges } = useMemo(() => {
        const versionNodes: Node[] = [];
        const versionEdges: Edge[] = [];
        const horizontalGap = 600; // バージョン間の水平間隔
        const verticalOffset = 100; // 全体の垂直オフセット

        versions.forEach((version, versionIndex) => {
            if (!version.flowchartData?.nodes) return;

            // 分岐点を取得
            const prevVersionIndex = versionIndex - 1;
            const relationship = prevVersionIndex >= 0
                ? relationships[`${versionIndex}-${prevVersionIndex}`]
                : null;

            // フローチャートのレイアウトを計算
            const layout = calculateFlowchartLayout(
                version.flowchartData.nodes,
                version.flowchartData.edges,
                horizontalGap * versionIndex + 200,
                relationship?.divergencePoint || null
            );

            // バージョン名ラベルを追加
            versionNodes.push({
                id: `label-${versionIndex}`,
                type: 'default',
                data: { label: version.name },
                position: {
                    x: layout.centerX, // ラベルの幅の半分を引く
                    y: verticalOffset - 60,  // フローチャートの上部に配置
                },
                style: {
                    background: 'transparent',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: versionIndex === currentVersionIndex ? 'bold' : 'normal',
                    color: versionIndex === currentVersionIndex ? '#1976d2' : '#666',
                    width: 150,
                    textAlign: 'center',
                },
                connectable: false, // エッジの接続点を無くす
            });

            // フローチャートノードを追加
            version.flowchartData.nodes.forEach((fcNode: Node) => {
                const pos = layout.positions[fcNode.id];
                if (!pos) return;

                const isNewBranch = relationships[`${versionIndex}-${versionIndex - 1}`]?.branchPoint
                    ?.target === fcNode.data.label;
                const isBranchSource = relationships[`${versionIndex}-${versionIndex - 1}`]?.branchPoint
                    ?.source === fcNode.data.label;

                // ノードのスタイルを変更
                const nodeStyle = {
                    background: isNewBranch ? '#e3f2fd' :
                        isBranchSource ? '#fff3e0' : '#fff',
                    border: isNewBranch || isBranchSource ?
                        '2px solid #1976d2' : '1px solid #ccc',
                    width: 150,
                    padding: '8px',
                    fontSize: '12px',
                    textAlign: 'center',
                    borderRadius: '4px',
                };

                versionNodes.push({
                    id: `v${versionIndex}-${fcNode.id}`,
                    type: 'default',
                    data: {
                        label: fcNode.data.label,
                        isDivergencePoint: fcNode.data.label === relationship?.divergencePoint
                    },
                    position: {
                        x: pos.x,
                        y: pos.y + verticalOffset
                    },
                    style: nodeStyle as React.CSSProperties,
                });
            });

            // フローチャート内のエッジを追加
            version.flowchartData.edges.forEach((edge: Edge, edgeIndex: number) => {
                versionEdges.push({
                    id: `v${versionIndex}-e${edgeIndex}`,
                    source: `v${versionIndex}-${edge.source}`,
                    target: `v${versionIndex}-${edge.target}`,
                    type: 'smoothstep',
                    style: { stroke: '#666' },
                });
            });

            // 分岐の接続を追加
            if (versionIndex > 0) {
                const relationship = relationships[`${versionIndex}-${versionIndex - 1}`];
                if (relationship?.branchPoint) {
                    const { source, target, label } = relationship.branchPoint;
                    const sourceNode = versions[versionIndex - 1].flowchartData.nodes
                        .find((n: Node) => n.data.label === source);
                    const targetNode = version.flowchartData.nodes
                        .find((n: Node) => n.data.label === target);

                    if (sourceNode && targetNode) {
                        // 分岐点を接続
                        versionEdges.push({
                            id: `branch-${versionIndex - 1}-${versionIndex}`,
                            source: `v${versionIndex - 1}-${sourceNode.id}`,
                            target: `v${versionIndex}-${targetNode.id}`,
                            type: 'smoothstep',
                            animated: true,
                            // label,
                            style: {
                                stroke: '#1976d2',
                                strokeWidth: 2,
                                strokeDasharray: '5,5',
                            },
                            labelStyle: {
                                fill: '#1976d2',
                                fontSize: 12,
                                fontWeight: 500
                            },
                            labelBgStyle: {
                                fill: '#fff',
                                fillOpacity: 0.8,
                            },
                        });

                        // 分岐点のノードのスタイルを変更
                        versionNodes.forEach(node => {
                            if (node.id === `v${versionIndex - 1}-${sourceNode.id}`) {
                                node.style = {
                                    ...node.style,
                                    background: '#fff3e0',
                                    border: '2px solid #1976d2',
                                };
                            } else if (node.id === `v${versionIndex}-${targetNode.id}`) {
                                node.style = {
                                    ...node.style,
                                    background: '#e3f2fd',
                                    border: '2px solid #1976d2',
                                };
                            }
                        });
                    }
                }
            }
        });

        return { nodes: versionNodes, edges: versionEdges };
    }, [versions, currentVersionIndex, relationships]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            fullScreen
        >
            <DialogTitle fontWeight="bold">
                バージョンマップ
                <Box sx={{ position: 'absolute', right: 48, top: 8 }}>
                    <Tooltip title="分岐を再解析">
                        <IconButton onClick={onReanalyze}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                </Box>
                <IconButton
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <Close />
                </IconButton>
            </DialogTitle>
            <Box sx={{ height: 'calc(100vh - 64px)', p: 2 }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                    minZoom={0.2}
                    maxZoom={1.5}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}  // 選択も無効化
                    attributionPosition="bottom-right"
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </Box>
        </Dialog>
    );
};

export default VersionMap;
