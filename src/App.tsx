import { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, CssBaseline, Container, Tabs, Tab, IconButton, Tooltip, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Node, Edge } from 'reactflow';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle
} from "react-resizable-panels";
import TextEditor from './components/TextEditor';
import FlowchartView from './components/FlowchartView';
import CharacterMap from './components/CharacterMap';
import { analyzeText, generateContinuation, modifyEntireText, modifyStoryWithCharacters, generateStoryFromFlowchart, analyzeFlowchartRelationship } from './services/geminiService';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DeleteIcon from '@mui/icons-material/Delete'; // 追加
import EditIcon from '@mui/icons-material/Edit'; // 追加
import { AccountTreeOutlined } from '@mui/icons-material';  // 追加
import VersionMap from './components/VersionMap';  // 追加

interface Character {
  id: string;
  name: string;
  description: string;
  relationships: Array<{
    to: string;
    type: string;
  }>;
}

interface TextSelection {
  text: string;
  context: {
    before: string;
    after: string;
    fullText: string;
  };
}

interface StoryVersion {
  id: string;
  name: string;               // 追加
  text: string;
  flowchartData: any;
  characters: Character[];
  plot: string[];
  timestamp: number;
  description: string;        // 編集内容などを格納
  parentVersionId: string | null;  // 追加：親バージョンのID
}

interface RelationshipCache {
  [key: string]: {
    branchPoint: {
      source: string;
      target: string;
      label: string;
    } | null;
    sharedNodes: string[];
  }
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

// リサイズハンドルのスタイルコンポーネント
const ResizeHandle = () => {
  return (
    <PanelResizeHandle className="resize-handle">
      <div
        style={{
          width: '8px',
          height: '100%',
          backgroundColor: 'transparent',
          cursor: 'col-resize',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '4px',
            height: '24px',
            backgroundColor: '#e0e0e0',
            borderRadius: '2px',
          }}
        />
      </div>
    </PanelResizeHandle>
  );
};

function App() {
  const [versions, setVersions] = useState<StoryVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(0);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareVersionIndex, setCompareVersionIndex] = useState<number | null>(null);
  const [text, setText] = useState<string>('');
  const [flowchartData, setFlowchartData] = useState<any>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModifying, setIsModifying] = useState(false); // 追加
  const [editVersionDialog, setEditVersionDialog] = useState<{
    open: boolean;
    index: number;
    name: string;
  } | null>(null);
  const [isVersionMapOpen, setIsVersionMapOpen] = useState(false);  // 追加
  const [relationshipCache, setRelationshipCache] = useState<RelationshipCache>({});

  // バージョン間の関係を分析
  const analyzeVersionRelationships = async () => {
    const newCache: RelationshipCache = {};
    
    for (const version of versions) {
      if (!version.parentVersionId) continue;
      
      const parentVersion = versions.find(v => v.id === version.parentVersionId);
      if (!parentVersion) continue;

      const cacheKey = `${version.id}-${parentVersion.id}`;
      const result = await analyzeFlowchartRelationship(
        parentVersion.flowchartData,
        version.flowchartData,
        parentVersion.text,
        version.text
      );
      newCache[cacheKey] = result;
    }

    setRelationshipCache(newCache);
  };

  const handleTextChange = async (newText: string) => {
    setText(newText);

    if (newText.length < 50) return;

    try {
      setIsAnalyzing(true);
      const analysis = await analyzeText(newText);

      if (analysis.flowchart) {
        setFlowchartData(analysis.flowchart);
      }

      if (analysis.characters) {
        setCharacters(analysis.characters);
      }

      // 最初のバージョンの場合、新しいバージョンとして追加
      if (versions.length === 0) {
        const initialVersion: StoryVersion = {
          id: 'v1',
          name: '初期バージョン',       // 変更
          text: newText,
          flowchartData: analysis.flowchart || null,
          characters: analysis.characters || [],
          plot: analysis.plot || [],
          timestamp: Date.now(),
          description: '',              // 編集内容はなし
          parentVersionId: null,  // 初期バージョンは親を持たない
        };
        setVersions([initialVersion]);
        setCurrentVersionIndex(0);
      }
    } catch (error) {
      console.error('Error analyzing text:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 修正: 新しいバージョンを作成する関数を共通化
  const createNewVersion = async (
    newText: string, 
    description: string, 
    parentVersionId: string
  ): Promise<StoryVersion> => {
    const analysis = await analyzeText(newText);
    return {
      id: `v${versions.length + 1}`,
      name: `バージョン ${versions.length + 1}`,
      text: newText,
      flowchartData: analysis.flowchart || null,
      characters: analysis.characters || [],
      plot: analysis.plot || [],
      timestamp: Date.now(),
      description,
      parentVersionId,
    };
  };

  const handleModifyText = async (selectedText: TextSelection, modificationPrompt: string): Promise<string> => {
    try {
      setIsModifying(true);
      const newContinuation = await generateContinuation(selectedText, modificationPrompt);
      const newText = selectedText.context.before + newContinuation;

      setIsAnalyzing(true);
      const analysis = await analyzeText(newText);

      // 新しいバージョンを作成
      const newVersion = await createNewVersion(
        newText,
        `部分変更: ${modificationPrompt}`,
        versions[currentVersionIndex].id
      );

      // 状態を一括で更新
      setVersions([...versions, newVersion]);
      setCurrentVersionIndex(versions.length);
      setText(newText);
      setFlowchartData(analysis.flowchart || null);
      setCharacters(analysis.characters || []);

      return newContinuation;
    } catch (error) {
      console.error('Error in handleModifyText:', error);
      throw error;
    } finally {
      setIsModifying(false);
      setIsAnalyzing(false);
    }
  };

  const handleVersionChange = (index: number) => {
    const version = versions[index];
    setCurrentVersionIndex(index);
    setText(version.text);
    setFlowchartData(version.flowchartData);
    setCharacters(version.characters);
  };

  const toggleCompareMode = () => {
    setIsCompareMode(!isCompareMode);
    if (!isCompareMode) {
      setCompareVersionIndex(currentVersionIndex > 0 ? currentVersionIndex - 1 : 1);
    } else {
      setCompareVersionIndex(null);
    }
  };

  const handleModifyEntireText = async (modificationPrompt: string): Promise<void> => {
    try {
      setIsModifying(true);
      const newText = await modifyEntireText(text, modificationPrompt);

      setIsAnalyzing(true);
      const analysis = await analyzeText(newText);

      // 新しいバージョンを作成
      const newVersion = await createNewVersion(
        newText,
        `全体変更: ${modificationPrompt}`,
        versions[currentVersionIndex].id
      );

      // 状態を一括で更新
      setVersions([...versions, newVersion]);
      setCurrentVersionIndex(versions.length);
      setText(newText);
      setFlowchartData(analysis.flowchart || null);
      setCharacters(analysis.characters || []);
    } catch (error) {
      console.error('Error in handleModifyEntireText:', error);
      throw error;
    } finally {
      setIsModifying(false);
      setIsAnalyzing(false);
    }
  };

  const handleCharactersEdit = async (modifiedCharacters: Character[]): Promise<void> => {
    try {
      setIsModifying(true);
      const newText = await modifyStoryWithCharacters(text, characters, modifiedCharacters);

      setIsAnalyzing(true);
      const analysis = await analyzeText(newText);

      // 新しいバージョンを作成
      const newVersion = await createNewVersion(
        newText,
        '登場人物変更',
        versions[currentVersionIndex].id
      );

      // 状態を一括で更新
      const updatedVersions = [...versions, newVersion];
      setVersions(updatedVersions);
      setCurrentVersionIndex(updatedVersions.length - 1);
      setText(newText);
      setFlowchartData(analysis.flowchart || null);
      setCharacters(analysis.characters || []);
    } catch (error) {
      console.error('Error in handleCharactersEdit:', error);
      throw error;
    } finally {
      setIsModifying(false);
      setIsAnalyzing(false);
    }
  };

  const handleReanalyze = async () => {
    try {
      setIsAnalyzing(true);
      const analysis = await analyzeText(text);

      // 現在のバージョンを更新
      const updatedVersion: StoryVersion = {
        ...versions[currentVersionIndex],
        flowchartData: analysis.flowchart || null,
        characters: analysis.characters || [],
        plot: analysis.plot || [],
        timestamp: Date.now(),
        description: versions[currentVersionIndex].description
      };

      const updatedVersions = [...versions];
      updatedVersions[currentVersionIndex] = updatedVersion;
      setVersions(updatedVersions);

      // 表示を更新
      if (analysis.flowchart) setFlowchartData(analysis.flowchart);
      if (analysis.characters) setCharacters(analysis.characters);
    } catch (error) {
      console.error('Error reanalyzing text:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVersionDelete = (indexToDelete: number) => {
    // 最初のバージョンは削除不可
    if (indexToDelete === 0) return;

    // 削除するバージョンのIDを保存
    const versionToDelete = versions[indexToDelete];

    const updatedVersions = versions.filter((_, index) => index !== indexToDelete);
    setVersions(updatedVersions);

    // 削除したバージョンIDをTextEditorに伝えるため、versionIndexと共に渡す
    if (currentVersionIndex === indexToDelete) {
      handleVersionChange(indexToDelete - 1);
    }
    // 削除したバージョンが現在表示中のバージョンの場合
    else if (currentVersionIndex > indexToDelete) {
      setCurrentVersionIndex(currentVersionIndex - 1);
    }

    // 比較モードが有効で、比較対象のバージョンが削除された場合
    if (isCompareMode && compareVersionIndex === indexToDelete) {
      setCompareVersionIndex(null);
      setIsCompareMode(false);
    }
    // 比較対象のバージョンが削除したバージョンより後ろにある場合
    else if (compareVersionIndex !== null && compareVersionIndex > indexToDelete) {
      setCompareVersionIndex(compareVersionIndex - 1);
    }
  };

  // バージョン名の編集を開始
  const handleVersionNameEditStart = (index: number, currentName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (index === 0) return; // バージョン1は編集不可
    setEditVersionDialog({
      open: true,
      index,
      name: currentName
    });
  };

  // バージョン名の保存
  const handleVersionNameSave = () => {
    if (!editVersionDialog) return;
    const updatedVersions = [...versions];
    updatedVersions[editVersionDialog.index] = {
      ...updatedVersions[editVersionDialog.index],
      name: editVersionDialog.name
    };
    setVersions(updatedVersions);
    setEditVersionDialog(null);
  };

  // バージョン名編集のキャンセル
  const handleVersionNameCancel = () => {
    setEditVersionDialog(null);
  };

  // TabのlabelコンテンツをBox要素として分離
  const TabContent: React.FC<{
    version: StoryVersion;
    index: number;
    onEditStart: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
  }> = ({
    version,
    index,
    onEditStart,
    onDelete
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <span>{version.name}</span>
      {index !== 0 && (
        <Box 
          sx={{ 
            display: 'flex', 
            gap: 0.5,
            ml: 1
          }}
          onClick={e => e.stopPropagation()}
        >
          <Box
            component="div"
            role="button"
            onClick={onEditStart}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: '50%',
              cursor: 'pointer',
              opacity: 0.6,
              '&:hover': { 
                opacity: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.04)'
              },
              p: '2px'
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
          <Box
            component="div"
            role="button"
            onClick={onDelete}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: '50%',
              cursor: 'pointer',
              opacity: 0.6,
              '&:hover': { 
                opacity: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.04)'
              },
              p: '2px'
            }}
          >
            <DeleteIcon fontSize="small" />
          </Box>
        </Box>
      )}
    </Box>
  );

  const handleGenerateStoryFromFlowchart = async (nodes: Node[], edges: Edge[]) => {
    try {
      setIsModifying(true);
      const newText = await generateStoryFromFlowchart(nodes, edges, text);  // textを追加

      setIsAnalyzing(true);
      const analysis = await analyzeText(newText);

      // 新しいバージョンを作成
      const newVersion = await createNewVersion(
        newText,
        'フローチャートから生成',
        versions[currentVersionIndex].id
      );

      setVersions([...versions, newVersion]);
      setCurrentVersionIndex(versions.length);
      setText(newText);
      setFlowchartData(analysis.flowchart || null);
      setCharacters(analysis.characters || []);
    } catch (error) {
      console.error('Error generating story from flowchart:', error);
    } finally {
      setIsModifying(false);
      setIsAnalyzing(false);
    }
  };

  // バージョンマップを開く
  const handleOpenVersionMap = () => {
    setIsVersionMapOpen(true);
  };

  // 追加: バージョンマップの再解析ハンドラ
  const handleReanalyzeRelationships = () => {
    setRelationshipCache({});  // キャッシュをクリア
    analyzeVersionRelationships();  // 再解析実行
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 3, height: '100vh' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Tabs
                  value={currentVersionIndex}
                  onChange={(_, index) => handleVersionChange(index)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{
                    flex: 1,
                    // 編集中のすべてのアニメーションを無効化
                    '& .MuiTabs-indicator': {
                      transition: editVersionDialog ? 'none !important' : undefined
                    },
                    '& .MuiTab-root': {
                      transition: editVersionDialog ? 'none !important' : undefined,
                      // リップルエフェクトを無効化
                      '& .MuiTouchRipple-root': {
                        display: editVersionDialog ? 'none' : undefined
                      }
                    }
                  }}
                >
                  {versions.map((version, index) => (
                    <Tab
                      key={version.id}
                      value={index}
                      label={
                        <TabContent
                          version={version}
                          index={index}
                          onEditStart={(e) => handleVersionNameEditStart(index, version.name, e)}
                          onDelete={(e) => {
                            e.stopPropagation();
                            handleVersionDelete(index);
                          }}
                        />
                      }
                    />
                  ))}
                </Tabs>
                {/* ...existing compare mode button... */}
                <Tooltip title="バージョンマップ">
                  <IconButton onClick={handleOpenVersionMap}>
                    <AccountTreeOutlined />
                  </IconButton>
                </Tooltip>
              </Box>
              {versions.length > 0 && (
                <Box sx={{ px: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                  {new Date(versions[currentVersionIndex].timestamp).toLocaleString()} - {versions[currentVersionIndex].description}
                </Box>
              )}
            </Box>
            {versions.length > 1 && (
              <Tooltip title="バージョンを比較">
                <IconButton onClick={toggleCompareMode} color={isCompareMode ? "primary" : "default"}>
                  <CompareArrowsIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={60} minSize={30}>
                <TextEditor
                  text={text}
                  onTextChange={handleTextChange}
                  isAnalyzing={isAnalyzing}
                  isModifying={isModifying} // 追加
                  onModifyText={handleModifyText}
                  onModifyEntireText={handleModifyEntireText}
                  versionIndex={currentVersionIndex}  // 追加
                  onReanalyze={handleReanalyze}  // 追加
                  versions={versions}  // 追加: versionsを渡す
                />
              </Panel>

              <ResizeHandle />

              <Panel defaultSize={40} minSize={30}>
                {isCompareMode && compareVersionIndex !== null ? (
                  <PanelGroup direction="vertical">
                    <Panel>
                      <FlowchartView
                        data={versions[compareVersionIndex].flowchartData}
                        plot={versions[compareVersionIndex].plot || []}
                      />
                    </Panel>
                    <ResizeHandle />
                    <Panel>
                      <FlowchartView
                        data={flowchartData}
                        plot={versions[currentVersionIndex]?.plot || []}
                        onGenerateStory={handleGenerateStoryFromFlowchart}
                        currentText={text}  // 追加
                      />
                    </Panel>
                  </PanelGroup>
                ) : (
                  <FlowchartView
                    data={flowchartData}
                    plot={versions[currentVersionIndex]?.plot || []}
                    onGenerateStory={handleGenerateStoryFromFlowchart}
                    currentText={text}  // 追加
                  />
                )}
              </Panel>
            </PanelGroup>
          </Box>

          <Box sx={{ height: '30vh' }}>
            {isCompareMode && compareVersionIndex !== null ? (
              <PanelGroup direction="horizontal">
                <Panel>
                  <CharacterMap
                    characters={versions[compareVersionIndex].characters}
                  />
                </Panel>
                <ResizeHandle />
                <Panel>
                  <CharacterMap
                    characters={characters}
                    onCharactersEdit={handleCharactersEdit}
                  />
                </Panel>
              </PanelGroup>
            ) : (
              <CharacterMap
                characters={characters}
                onCharactersEdit={handleCharactersEdit}
              />
            )}
          </Box>
        </Box>
      </Container>

      {/* バージョン名編集用のダイアログ */}
      <Dialog
        open={!!editVersionDialog}
        onClose={handleVersionNameCancel}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>バージョン名の編集</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editVersionDialog?.name || ''}
            onChange={(e) => setEditVersionDialog(prev => 
              prev ? { ...prev, name: e.target.value } : null
            )}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleVersionNameCancel}>
            キャンセル
          </Button>
          <Button 
            onClick={handleVersionNameSave}
            variant="contained"
            disabled={!editVersionDialog?.name.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* バージョンマップモーダル */}
      <VersionMap
        open={isVersionMapOpen}
        onClose={() => setIsVersionMapOpen(false)}
        versions={versions}
        currentVersionIndex={currentVersionIndex}
        onVersionSelect={handleVersionChange}
        onReanalyze={handleReanalyzeRelationships}  // 追加
      />
    </ThemeProvider>
  );
}

export default App;
