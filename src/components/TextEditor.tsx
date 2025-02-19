import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Paper, TextField, CircularProgress, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import { AudioPlayer, generateAudio } from '../services/voicevoxService';

const MAX_TEXT_LENGTH = 500;  // 追加: 最大文字数の定数

interface TextSelection {
  text: string;
  context: {
    before: string;
    after: string;
    fullText: string;
  };
}

interface TextEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  isAnalyzing?: boolean;
  onModifyText?: (selection: TextSelection, modificationPrompt: string) => Promise<string>;
  onModifyEntireText?: (modificationPrompt: string) => Promise<void>;
  versionIndex: number;
  onReanalyze?: () => void;
  isModifying?: boolean;
  versions: Array<{ id: string }>;  // 追加
}

interface AudioState {
  audioPlayer: AudioPlayer;
  state: 'initial' | 'playing' | 'paused';
  isGenerating: boolean;
}

interface AudioStates {
  [versionId: string]: AudioState;
}

const TextEditor: React.FC<TextEditorProps> = ({
  text,
  onTextChange,
  isAnalyzing = false,
  isModifying = false,
  onModifyText,
  onModifyEntireText,
  versionIndex,
  onReanalyze,
  versions,  // 追加
}) => {
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  const [isModifyEntireDialogOpen, setIsModifyEntireDialogOpen] = useState(false);
  const [audioStates, setAudioStates] = useState<AudioStates>({});
  const previousVersionIndex = useRef<number>(versionIndex);

  // テキストエリアの参照を更新
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // バージョンが変更されたときに選択をクリアする
  useEffect(() => {
    setSelectedText(null);
  }, [versionIndex]);

  const handleTextSelection = useCallback(() => {
    setTimeout(() => {
      // テキストエリアから直接選択範囲を取得
      const textarea = textAreaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // 選択範囲がない場合
      if (start === end) {
        setSelectedText(null);
        return;
      }

      const selectedContent = textarea.value.substring(start, end).trim();
      if (!selectedContent) {
        setSelectedText(null);
        return;
      }

      const contextData = {
        text: selectedContent,
        context: {
          before: textarea.value.substring(0, start),
          after: textarea.value.substring(end),
          fullText: textarea.value
        }
      };

      setSelectedText(contextData);
    }, 10);
  }, [text]);

  // 選択イベントの監視を設定
  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    const handleSelection = () => {
      handleTextSelection();
    };

    textarea.addEventListener('select', handleSelection);
    textarea.addEventListener('mouseup', handleSelection);
    textarea.addEventListener('keyup', handleSelection);

    return () => {
      textarea.removeEventListener('select', handleSelection);
      textarea.removeEventListener('mouseup', handleSelection);
      textarea.removeEventListener('keyup', handleSelection);
    };
  }, [handleTextSelection]);

  const handleModifyClick = useCallback(() => {
    if (selectedText) {
      setModificationPrompt('');
      setIsModifyDialogOpen(true);
    }
  }, [selectedText]);

  const handleModifyEntireClick = useCallback(() => {
    setModificationPrompt('');
    setIsModifyEntireDialogOpen(true);
  }, []);

  const handleModifySubmit = async () => {
    if (onModifyText && selectedText && modificationPrompt.trim()) {
      try {
        await onModifyText(selectedText, modificationPrompt);
        handleModifyDialogClose();
      } catch (error) {
        console.error('Error modifying text:', error);
      }
    }
  };

  const handleModifyEntireSubmit = async () => {
    if (onModifyEntireText && modificationPrompt.trim()) {
      try {
        await onModifyEntireText(modificationPrompt);
        handleModifyEntireDialogClose();
      } catch (error) {
        console.error('Error modifying entire text:', error);
      }
    }
  };

  const handleModifyDialogClose = useCallback(() => {
    setIsModifyDialogOpen(false);
    setModificationPrompt('');
  }, []);

  const handleModifyEntireDialogClose = useCallback(() => {
    setIsModifyEntireDialogOpen(false);
    setModificationPrompt('');
  }, []);

  // 現在のバージョンの音声状態を取得または初期化
  const getCurrentAudioState = useCallback(() => {
    const currentVersion = `v${versionIndex + 1}`;
    if (!audioStates[currentVersion]) {
      const newState = {
        audioPlayer: new AudioPlayer(),
        state: 'initial' as const,
        isGenerating: false
      };
      setAudioStates(prev => ({ ...prev, [currentVersion]: newState }));
      return newState;
    }
    return audioStates[currentVersion];
  }, [versionIndex, audioStates]);

  // バージョン切り替え時の処理
  useEffect(() => {
    if (previousVersionIndex.current !== versionIndex) {
      const prevVersion = `v${previousVersionIndex.current + 1}`;
      
      // 前のバージョンを削除する（不要なメモリを解放）
      if (!versions.some(v => v.id === prevVersion)) {
        setAudioStates(prev => {
          const newStates = { ...prev };
          delete newStates[prevVersion];
          return newStates;
        });
      }
      // それ以外の場合は単に停止
      else if (audioStates[prevVersion]) {
        audioStates[prevVersion].audioPlayer.reset();
        setAudioStates(prev => ({
          ...prev,
          [prevVersion]: { ...prev[prevVersion], state: 'initial' }
        }));
      }
      
      previousVersionIndex.current = versionIndex;
    }
  }, [versionIndex, audioStates, versions]);

  // 音声生成・再生が可能かどうかを判定する関数を追加
  const isAudioEnabled = useCallback(() => {
    return text.length > 0 && text.length <= MAX_TEXT_LENGTH;
  }, [text]);

  const handlePlayAudio = async () => {
    // 文字数制限のチェックを追加
    if (!isAudioEnabled()) return;

    const currentAudioState = getCurrentAudioState();
    const currentVersion = `v${versionIndex + 1}`;

    try {
      if (currentAudioState.state === 'playing') {
        currentAudioState.audioPlayer.pause();
        setAudioStates(prev => ({
          ...prev,
          [currentVersion]: { ...currentAudioState, state: 'paused' }
        }));
        return;
      }

      if (!text) return;

      if (currentAudioState.audioPlayer.getDuration() === 0) {
        setAudioStates(prev => ({
          ...prev,
          [currentVersion]: { ...currentAudioState, isGenerating: true }
        }));

        // バージョンに応じてspeakerIdを選択
        const speakerId = versionIndex === 0 ? 13 : 1;
        const audioData = await generateAudio(text, speakerId);
        await currentAudioState.audioPlayer.loadAudio(audioData);

        setAudioStates(prev => ({
          ...prev,
          [currentVersion]: { ...currentAudioState, isGenerating: false, state: 'initial' }
        }));
      }

      currentAudioState.audioPlayer.play();
      setAudioStates(prev => ({
        ...prev,
        [currentVersion]: { ...currentAudioState, state: 'playing' }
      }));
    } catch (error) {
      console.error('Error playing audio:', error);
      setAudioStates(prev => ({
        ...prev,
        [currentVersion]: { ...currentAudioState, isGenerating: false, state: 'initial' }
      }));
    }
  };

  const handleResetAudio = () => {
    const currentAudioState = getCurrentAudioState();
    const currentVersion = `v${versionIndex + 1}`;

    currentAudioState.audioPlayer.reset();
    setAudioStates(prev => ({
      ...prev,
      [currentVersion]: { ...currentAudioState, state: 'initial' }
    }));
  };

  // テキストが変更されたら音声をリセットし、状態もリセット
  useEffect(() => {
    const currentVersion = `v${versionIndex + 1}`;
    if (audioStates[currentVersion]) {
      audioStates[currentVersion].audioPlayer.reset();
      setAudioStates(prev => ({
        ...prev,
        [currentVersion]: { ...prev[currentVersion], state: 'initial' }
      }));
    }
  }, [text]);

  const getPlayButtonLabel = () => {
    if (!isAudioEnabled()) return `再生`;
    const currentAudioState = getCurrentAudioState();
    if (currentAudioState.isGenerating) return '生成中';
    switch (currentAudioState.state) {
      case 'playing':
        return '一時停止';
      case 'paused':
        return '再開';
      default:
        return '再生';
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 1
      }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            disabled={!selectedText || isAnalyzing || isModifying}
            onClick={handleModifyClick}
            size="small"
          >
            選択部分を変更
          </Button>
          <Button
            variant="contained"
            startIcon={<AutoFixHighIcon />}
            disabled={!text || isAnalyzing || isModifying}
            onClick={handleModifyEntireClick}
            size="small"
          >
            全体を変更
          </Button>
          {/* 再解析ボタンを追加 */}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={!text || isAnalyzing || isModifying}
            onClick={onReanalyze}
            size="small"
          >
            再解析
          </Button>
          <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 1, ml: 1 }}>
            <Button
              variant="contained"
              startIcon={getCurrentAudioState().state === 'playing' ? <PauseIcon /> : <PlayArrowIcon />}
              disabled={
                !text ||
                isAnalyzing ||
                isModifying ||
                getCurrentAudioState().isGenerating ||
                !isAudioEnabled()  // 条件を追加
              }
              onClick={handlePlayAudio}
              size="small"
              title={!isAudioEnabled() ? `${MAX_TEXT_LENGTH}文字以内のテキストのみ再生可能です` : undefined}
            >
              {getPlayButtonLabel()}
            </Button>
            <IconButton
              size="small"
              onClick={handleResetAudio}
              disabled={
                !getCurrentAudioState().audioPlayer.getDuration() ||
                getCurrentAudioState().isGenerating ||
                !isAudioEnabled()  // 条件を追加
              }
            >
              <SkipPreviousIcon />
            </IconButton>
          </Box>
        </Box>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ ml: 2 }}
        >
          {text.length}文字
        </Typography>
      </Box>

      <Box sx={{ flex: 1, position: 'relative' }}>
        <TextField
          multiline
          fullWidth
          variant="outlined"
          placeholder="テキストを入力してください..."
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onSelect={handleTextSelection}  // 選択イベントを追加
          disabled={isModifying}
          inputRef={textAreaRef}  // テキストエリアへの参照を設定
          InputProps={{
            sx: {
              height: '100%',
              '& textarea': {
                height: '100% !important',
                overflow: 'auto !important',
                resize: 'none',
              },
            },
          }}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            '& .MuiOutlinedInput-root': {
              height: '100%',
              overflow: 'hidden', // コンテナのオーバーフローを防ぐ
            },
            '& .MuiInputBase-root': {
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            },
            '& .MuiInputBase-input': {
              flex: 1,
              overflowY: 'auto !important', // 縦スクロールを有効化
              overflowX: 'hidden', // 横スクロールを無効化
            },
          }}
        />
      </Box>

      {(isAnalyzing || isModifying) && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(255, 255, 255, 0.8)',
            p: 2,
            borderRadius: 1,
            zIndex: 1,
          }}
        >
          <CircularProgress size={20} />
          {isModifying ? 'テキストを生成中...' : 'テキストを解析中...'}
        </Box>
      )}

      <Dialog
        open={isModifyDialogOpen}
        onClose={handleModifyDialogClose}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={isModifying}
        keepMounted={false}
      >
        <DialogTitle>テキストの変更</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              選択されたテキスト:
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {selectedText?.text}
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="変更の指示"
              placeholder="例: この部分をより悲しい展開に変更してください"
              value={modificationPrompt}
              onChange={(e) => setModificationPrompt(e.target.value)}
              disabled={isModifying}
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleModifyDialogClose}
            disabled={isModifying}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleModifySubmit}
            variant="contained"
            disabled={!modificationPrompt.trim() || isModifying}
          >
            変更
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isModifyEntireDialogOpen}
        onClose={handleModifyEntireDialogClose}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={isModifying}
        keepMounted={false}
      >
        <DialogTitle>物語全体の変更</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="変更の指示"
              placeholder="例: ハッピーエンドにしてください"
              value={modificationPrompt}
              onChange={(e) => setModificationPrompt(e.target.value)}
              disabled={isModifying}
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleModifyEntireDialogClose}
            disabled={isModifying}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleModifyEntireSubmit}
            variant="contained"
            disabled={!modificationPrompt.trim() || isModifying}
          >
            変更
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default TextEditor;