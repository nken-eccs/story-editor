# Story Editor

## 主な機能

### 1. テキスト編集・分析
- リアルタイムテキスト編集および文字数表示
- 50文字以上で自動解析が開始され、物語構造や登場人物情報を抽出
- テキスト選択範囲を指定して局所的な変更が可能
- 手動「再解析」ボタンにより解析処理の再実行が可能
- 音声再生機能（入力文字数が一定以内の場合のみ再生可能）

### 2. 物語の変更機能
#### 2.1 部分的な変更
- テキストの選択部分を指定して変更
- 前後の文脈を考慮した自然な文章生成
- 変更内容の指示をプロンプトとして入力可能
- バージョン切り替え時に選択テキストが自動的にクリアされる

#### 2.2 全体的な変更
- 物語全体の展開や雰囲気の変更
- 物語の基本要素を維持しながらの書き換え
- 文体や語調の一貫性を保持

#### 2.3 分岐再解析機能
- バージョン間の分岐点を再解析し、フローチャートの関係性（分岐点、接続など）を更新

### 3. 登場人物管理
- 登場人物の追加・編集・削除
- 名前と詳細な説明の管理
- 登場人物の変更に基づく物語の自動書き換え
- カード形式によるキャラクター情報の視覚化

### 4. バージョン管理
- 変更履歴の保存と管理
- バージョン間の比較が可能
- タイムスタンプと変更内容の記録
- 各バージョンへの簡単な切り替え
- "name" プロパティでバージョン名を管理
- "description" プロパティに編集内容・変更内容を格納

### 5. インターフェース
- リサイズ可能なパネルレイアウト
- フローチャートと要約のタブ切り替え表示
- ノードのダブルクリックによる編集モーダル（フローチャート上）
- モーダルダイアログによる編集インターフェース
- ローディング状態の視覚的フィードバック
- 音声再生・一時停止の操作ボタン付き

## 技術仕様

### フロントエンド
- React + TypeScript
- Material-UI (MUI) コンポーネント
- react-resizable-panels によるレイアウト管理

### 外部API
- Google Gemini API
  - テキスト解析
  - 物語の生成・変更
  - キャラクター情報の抽出
- Voicevox API（音声生成）

### データ構造
#### バージョン管理
```typescript
interface StoryVersion {
  id: string;
  name: string;
  text: string;
  flowchartData: any;
  characters: Character[];
  plot: string[];
  timestamp: number;
  description: string;
}
```

#### キャラクター情報
```typescript
interface Character {
  id: string;
  name: string;
  description: string;
  relationships: Array<{
    to: string;
    type: string;
  }>;
}
```

## 使用方法

### 1. テキストの編集と解析
1. メインエディタにテキストを入力
2. 文字数が自動的に表示される
3. 50文字以上で自動的に解析が開始
4. フローチャート、要約、登場人物情報が自動生成
5. 必要に応じて「再解析」ボタンで手動で解析を実行可能
6. 音声再生ボタンでテキストの音声再生が可能（入力文字数が一定以内の場合）

### 2. 物語の分析
1. フローチャートと要約をタブで切り替えて表示
2. 自動生成された物語の構造を確認
3. 登場人物の一覧をカード形式で確認

### 3. 部分的な変更
1. 変更したい部分のテキストを選択
2. 「選択部分を変更」ボタンをクリック
3. 変更の指示を入力
4. 「変更」ボタンで確定

### 4. 全体的な変更
1. 「全体を変更」ボタンをクリック
2. 変更の指示を入力
3. 「変更」ボタンで確定

### 5. 登場人物の編集
1. 登場人物リストの編集モードを開始
2. キャラクターの追加、編集、削除が可能
3. 変更を保存すると物語が自動的に更新

### 6. バージョン管理
- 各変更は新しいバージョンとして保存
- バージョン間の比較が可能
- タブで簡単にバージョン切り替え

## 環境設定
1. 必要なパッケージのインストール
```bash
npm install
```

2. 環境変数の設定

Story Editorフォルダ直下に `.env` ファイルを作成し、以下の内容を記述
```env
VITE_GEMINI_API_KEY=your_api_key_here
```

3. 開発サーバーの起動
```bash
npm run dev
```

## 注意事項
- Gemini APIキー（Google AI Studioで無料で発行可能）が必要です
- テキストは50文字以上必要です
- 変更処理中は編集機能が一時的に無効になります
- 大きな変更を行う場合は処理に時間がかかる場合があります

## 今後の展望
- キャラクター関係図の視覚化
- より詳細なプロット分析
- 複数の物語の並行管理
- 協調編集機能の追加
- AIによる物語展開の提案機能
- 解析精度の向上と再解析オプションの拡充
