import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Paper, 
  Typography, 
  Tabs, 
  Tab, 
  Box, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField,
  Fab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

interface FlowchartViewProps {
  data: {
    nodes: Node[];
    edges: Edge[];
  } | null;
  plot?: string[];
  onGenerateStory?: (nodes: Node[], edges: Edge[]) => Promise<void>;
  currentText?: string;  // 追加
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    sx={{
      flex: 1,
      display: value === index ? 'flex' : 'none',
      height: 'calc(100% - 48px)', // タブの高さ(48px)を引いた残りの空間
      overflow: 'auto'
    }}
  >
    {value === index && children}
  </Box>
);

interface NodeModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (label: string) => void;
  initialLabel?: string;
}

const NodeModal: React.FC<NodeModalProps> = ({ open, onClose, onSave, initialLabel = '' }) => {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    setLabel(initialLabel);
  }, [initialLabel]);

  const handleSave = () => {
    onSave(label);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>ノードの{initialLabel ? '編集' : '追加'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="ノードの内容"
          fullWidth
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          multiline
          rows={4}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSave} color="primary">保存</Button>
      </DialogActions>
    </Dialog>
  );
};

const FlowchartView: React.FC<FlowchartViewProps> = ({ 
  data, 
  plot = [], 
  onGenerateStory,
  currentText = ''  // 追加
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [tabValue, setTabValue] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  useEffect(() => {
    if (data) {
      setNodes(data.nodes);
      setEdges(data.edges);
    }
  }, [data, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // シングルクリックをダブルクリックに変更
  const handleNodeDoubleClick = (event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedNode(null);
  };

  const handleNodeSave = (label: string) => {
    if (selectedNode) {
      // 既存ノードの編集
      setNodes(nodes.map(node =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, label } }
          : node
      ));
    } else {
      // 新規ノードの追加
      const newNodeId = `${nodes.length + 1}`;
      
      // ビューポートの中心座標を取得
      const center = reactFlowInstance ? reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }) : { x: 0, y: 0 };

      const newNode: Node = {
        id: newNodeId,
        type: 'default',
        position: center,
        data: { label },
      };
      setNodes(prev => [...prev, newNode]);
    }
  };

  const handleAddNode = () => {
    setSelectedNode(null);
    setModalOpen(true);
  };

  const handleGenerateStory = () => {
    if (onGenerateStory && nodes.length > 0) {
      onGenerateStory(nodes, edges);
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="フローチャート" />
          <Tab label="要約" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={handleNodeDoubleClick}  // クリックイベントを変更
            onNodeClick={undefined}  // シングルクリックを無効化
            onInit={setReactFlowInstance}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
          <Box sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            display: 'flex',
            gap: 1
          }}>
            <Fab
              color="primary"
              size="small"
              onClick={handleGenerateStory}
              disabled={nodes.length === 0}
              title="フローチャートから物語を生成"
            >
              <AutoStoriesIcon />
            </Fab>
            <Fab
              color="primary"
              size="small"
              onClick={handleAddNode}
            >
              <AddIcon />
            </Fab>
          </Box>
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box sx={{ p: 2 }}>
          {plot.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.5em' }}>
              {plot.map((point, index) => (
                <li key={index} style={{ marginBottom: '0.5em' }}>
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <Typography color="text.secondary">
              要約情報はありません
            </Typography>
          )}
        </Box>
      </TabPanel>

      <NodeModal
        open={modalOpen}
        onClose={handleModalClose}
        onSave={handleNodeSave}
        initialLabel={selectedNode?.data?.label || ''}
      />
    </Paper>
  );
};

export default FlowchartView;