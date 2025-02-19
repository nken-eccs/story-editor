import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  IconButton, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField,
  ListItemSecondaryAction,
  Tooltip,
  Fab
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';

interface Character {
  id: string;
  name: string;
  description: string;
  relationships: Array<{
    to: string;
    type: string;
  }>;
}

interface CharacterMapProps {
  characters: Character[];
  onCharactersEdit?: (modifiedCharacters: Character[]) => Promise<void>;
}

const CharacterMap: React.FC<CharacterMapProps> = ({ characters, onCharactersEdit }) => {
  const [editingCharacters, setEditingCharacters] = useState<Character[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isNewCharacter, setIsNewCharacter] = useState(false);

  const handleEditClick = () => {
    setEditingCharacters([...characters]);
    setEditListDialogOpen(true);
  };

  const handleSaveClick = async () => {
    if (onCharactersEdit) {
      await onCharactersEdit(editingCharacters);
    }
    setEditListDialogOpen(false);
    setIsEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditingCharacters([...characters]);
    setEditListDialogOpen(false);
    setIsEditMode(false);
  };

  const handleCharacterClick = (character: Character) => {
    setSelectedCharacter(character);
    setEditedName(character.name);
    setEditedDescription(character.description);
    setIsNewCharacter(false);
    setEditDialogOpen(true);
  };

  const handleAddCharacter = () => {
    setSelectedCharacter(null);
    setEditedName('');
    setEditedDescription('');
    setIsNewCharacter(true);
    setEditDialogOpen(true);
  };

  const handleDeleteCharacter = (characterId: string) => {
    const updatedCharacters = editingCharacters.filter(char => char.id !== characterId);
    setEditingCharacters(updatedCharacters);
  };

  const handleDialogSave = () => {
    if (!editedName.trim()) return;

    if (isNewCharacter) {
      const newCharacter: Character = {
        id: Date.now().toString(),
        name: editedName.trim(),
        description: editedDescription.trim(),
        relationships: []
      };
      setEditingCharacters([...editingCharacters, newCharacter]);
    } else if (selectedCharacter) {
      const updatedCharacters = editingCharacters.map(char =>
        char.id === selectedCharacter.id
          ? { ...char, name: editedName.trim(), description: editedDescription.trim() }
          : char
      );
      setEditingCharacters(updatedCharacters);
    }
    handleDialogClose();
  };

  const handleDialogClose = () => {
    setEditDialogOpen(false);
    setSelectedCharacter(null);
    setEditedName('');
    setEditedDescription('');
  };

  return (
    <Paper elevation={3} sx={{ height: '100%', ml: 1, p: 2, overflow: 'auto', border: '1px solid #e0e0e0', boxShadow: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight="bold">登場人物</Typography>
        {onCharactersEdit && (
          <IconButton onClick={handleEditClick}>
            <EditIcon />
          </IconButton>
        )}
      </Box>
      
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
        gap: 2, 
        mt: 2
      }}>
        {characters.map((character) => (
          <Paper
            key={character.id}
            elevation={2}
            sx={{
              p: 2,
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 4,
              },
            }}
          >
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  mb: 1,
                }}
              >
                {character.name}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  lineHeight: 1.4,
                }}
              >
                {character.description}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      {/* 登場人物一覧の編集モーダル */}
      <Dialog
        open={editListDialogOpen}
        onClose={handleCancelEdit}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">登場人物の編集</Typography>
            <Box>
              <IconButton onClick={handleSaveClick} color="primary" sx={{ mr: 1 }}>
                <SaveIcon />
              </IconButton>
              <IconButton onClick={handleCancelEdit} color="error">
                <CancelIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <List>
            {editingCharacters.map((character) => (
              <ListItem
                key={character.id}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                  }
                }}
                onClick={() => handleCharacterClick(character)}
              >
                <ListItemText
                  primary={character.name}
                  secondary={character.description}
                />
                <ListItemSecondaryAction>
                  <Tooltip title="削除">
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(character.id);
                      }}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>

          <Box sx={{ position: 'fixed', bottom: 24, right: 24 }}>
            <Tooltip title="登場人物を追加">
              <Fab
                color="primary"
                size="small"
                onClick={handleAddCharacter}
              >
                <AddIcon />
              </Fab>
            </Tooltip>
          </Box>
        </DialogContent>
      </Dialog>

      {/* 個別の登場人物編集モーダル */}
      <Dialog 
        open={editDialogOpen} 
        onClose={handleDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {isNewCharacter ? '登場人物の追加' : '登場人物の編集'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="名前"
              fullWidth
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              error={editedName.trim() === ''}
              helperText={editedName.trim() === '' ? '名前を入力してください' : ''}
              autoFocus
            />
            <TextField
              label="説明"
              fullWidth
              multiline
              rows={3}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>キャンセル</Button>
          <Button 
            onClick={handleDialogSave} 
            variant="contained"
            disabled={!editedName.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default CharacterMap;