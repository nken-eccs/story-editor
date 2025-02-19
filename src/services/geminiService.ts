import axios from 'axios';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const API_URL_think = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp-1219:generateContent';

interface Character {
  id: string;
  name: string;
  description: string;
  relationships: Array<{
    to: string;
    type: string;
  }>;
}

interface GeminiResponse {
  text: string;
  flowchart?: any;
  characters?: Character[];
  plot?: string[];
}

const extractFlowchart = (text: string): any => {
  const flowchartSection = text.match(/\[FLOWCHART\][\s\S]*?```mermaid\s*\n\s*graph TD\n([\s\S]*?)\n```/);
  if (flowchartSection) {
    const nodes: Array<{ id: string; data: { label: string }; position: { x: number; y: number } }> = [];
    const edges: Array<{ id: string; source: string; target: string; type: string; animated?: boolean }> = [];
    const lines = flowchartSection[1].split('\n').map(l => l.trim()).filter(Boolean);

    // First pass: create nodes
    lines.forEach(line => {
      const nodeMatches = line.match(/([A-Z])\[(.*?)\]/g);
      if (nodeMatches) {
        nodeMatches.forEach(match => {
          const matchResult = match.match(/([A-Z])\[(.*?)\]/);
          if (matchResult) {
            const [, id, label] = matchResult;
            if (!nodes.find(n => n.id === id)) {
              nodes.push({
                id,
                data: { label },
                position: { x: 100, y: 100 + (nodes.length * 100) },
              });
            }
          }
        });
      }
    });

    // Second pass: create edges
    lines.forEach((line, index) => {
      if (line.includes('-->')) {
        const [fromPart, toPart] = line.split('-->').map(part => part.trim());
        // Extract node IDs from both parts, handling any text content
        const fromMatch = fromPart.match(/^([A-Z])/);
        const toMatch = toPart.match(/^([A-Z])/);
        if (fromMatch && toMatch) {
          edges.push({
            id: `e${index}`,
            source: fromMatch[1],
            target: toMatch[1],
            type: 'smoothstep',
            animated: false,
          });
        }
      }
    });

    return { nodes, edges };
  }
  return null;
};

const extractCharacters = (text: string): Character[] => {
  const charactersSection = text.match(/\[CHARACTERS\]\n([\s\S]*?)(?=\n\[PLOT\]|\n\s*$)/);
  if (!charactersSection) return [];

  const characters: Character[] = [];
  const characterBlocks = charactersSection[1].split('\n-').filter(Boolean);

  characterBlocks.forEach((block, index) => {
    const nameMatch = block.match(/\*\*(.*?)\*\*:\s*(.*?)(?=\n|$)/);
    if (nameMatch) {
      const [, name, description] = nameMatch;
      characters.push({
        id: `char-${index}`,
        name: name.trim(),
        description: description.trim(),
        relationships: []
      });
    }
  });

  return characters;
};

const extractPlot = (text: string): string[] => {
  const plotSection = text.match(/\[PLOT\]([\s\S]*?)(?=\n\[|$)/);
  if (!plotSection) return [];

  return plotSection[1]
    .split('\n-')
    .map(point => point.trim())
    .filter(point => point.length > 0);
};

export const analyzeText = async (text: string): Promise<GeminiResponse> => {
  try {
    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Analyze the following text and provide the analysis in the same language as the input text.
Follow this EXACT format:

[FLOWCHART]
\`\`\`mermaid
graph TD
  A[Event1] --> B[Event2]
  B --> C[Event3]
\`\`\`

[CHARACTERS]
- **Character1**: Description1
- **Character2**: Description2

[PLOT]
- Point1
- Point2
- Point3

Text to analyze: ${text}

Important: 
1. Keep the section markers [FLOWCHART], [CHARACTERS], and [PLOT] exactly as shown
2. Use the exact format for each section
3. Provide content in the same language as the input text
4. For flowchart, use single capital letters (A, B, C...) for node IDs`
          }]
        }]
      }
    );

    console.log('Gemini API Response:', response.data);
    const result = response.data.candidates[0].content.parts[0].text;
    console.log('Extracted Text:', result);

    const flowchart = extractFlowchart(result);
    console.log('Extracted Flowchart:', flowchart);

    const characters = extractCharacters(result);
    console.log('Extracted Characters:', characters);

    const plot = extractPlot(result);
    console.log('Extracted Plot:', plot);

    return {
      text: result,
      flowchart,
      characters,
      plot
    };
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
};

export const generateContinuation = async (selection: { text: string; context: { before: string; after: string; fullText: string } }, modification: string): Promise<string> => {
  try {
    const prompt = `以下の物語文の指定された箇所から先を、新しい展開として書き直してください。
指定箇所までの文章の流れを維持しながら、その後の展開を指示に従って生成してください。
文体や語調を完全に統一し、違和感のない文章にしてください。

物語の前半部分（ここまでは変更しない）:
${selection.context.before}

変更開始位置の文章:
${selection.text}

現在の後半部分（これを新しい展開に置き換える）:
${selection.context.after}

変更の指示:
${modification}

出力形式:
[新しい展開の文章のみを出力。変更開始位置から物語の最後までを生成してください。]`;

    console.log('テキスト生成のプロンプト:', {
      変更開始位置まで: selection.context.before,
      変更開始箇所: selection.text,
      現在の後半部分: selection.context.after,
      変更指示: modification,
      プロンプト全体: prompt
    });

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const result = response.data.candidates[0].content.parts[0].text;
    const cleanedResult = result.replace(/^\[新しい展開の文章のみを出力.*?\]\n*/, '').trim();

    console.log('生成結果:', {
      APIレスポンス: result,
      クリーニング後: cleanedResult
    });

    return cleanedResult;
  } catch (error) {
    console.error('Error generating continuation:', error);
    throw error;
  }
};

export const modifyEntireText = async (currentText: string, modificationPrompt: string): Promise<string> => {
  try {
    const prompt = `以下の物語文全体を、指示に従って書き直してください。
物語の基本的な展開や文体、語調などは元の文章のものを維持しながら、指示に基づいて適切に変更してください。

現在の物語文:
${currentText}

変更の指示:
${modificationPrompt}

出力形式:
[新しい物語文のみを出力してください。]`;

    console.log('テキスト全体の変更プロンプト:', {
      現在の物語文: currentText,
      変更指示: modificationPrompt,
      プロンプト全体: prompt
    });

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const result = response.data.candidates[0].content.parts[0].text;
    const cleanedResult = result.replace(/^\[新しい物語文のみを出力.*?\]\n*/, '').trim();

    console.log('生成結果:', {
      APIレスポンス: result,
      クリーニング後: cleanedResult
    });

    return cleanedResult;
  } catch (error) {
    console.error('Error modifying entire text:', error);
    throw error;
  }
};

interface CharacterChange {
  type: 'modified' | 'added' | 'deleted';
  original?: Character;
  modified?: Character;
  changes?: {
    name: boolean;
    description: boolean;
    relationships: boolean;
  };
}

export const modifyStoryWithCharacters = async (currentText: string, originalCharacters: Character[], modifiedCharacters: Character[]): Promise<string> => {
  try {
    // 変更されたキャラクターを特定
    const characterChanges: CharacterChange[] = modifiedCharacters.map(modChar => {
      const origChar = originalCharacters.find(c => c.id === modChar.id);
      if (origChar) {
        return {
          type: 'modified',
          original: origChar,
          modified: modChar,
          changes: {
            name: origChar.name !== modChar.name,
            description: origChar.description !== modChar.description,
            relationships: JSON.stringify(origChar.relationships) !== JSON.stringify(modChar.relationships)
          }
        };
      }
      return {
        type: 'added',
        modified: modChar
      };
    });

    // 削除されたキャラクターを特定
    const deletedCharacters: CharacterChange[] = originalCharacters
      .filter(origChar => !modifiedCharacters.some(modChar => modChar.id === origChar.id))
      .map(char => ({
        type: 'deleted',
        original: char
      }));

    // すべての変更を結合
    const allChanges = [...characterChanges, ...deletedCharacters];

    const prompt = `以下の物語文を、登場人物の変更に基づいて書き直してください。
物語の基本的な展開や文体、語調は維持しながら、登場人物の新しい設定に合わせて適切に変更してください。

現在の物語文:
${currentText}

登場人物の変更点:
${allChanges.map(change => {
      switch (change.type) {
        case 'modified':
          return `
【${change.original!.name}】(変更)
- 名前: ${change.changes!.name ? `${change.original!.name} → ${change.modified!.name}` : '変更なし'}
- 設定: ${change.changes!.description ? `${change.original!.description} → ${change.modified!.description}` : '変更なし'}
- 関係性: ${change.changes!.relationships ? '変更あり' : '変更なし'}`;
        case 'added':
          return `
【${change.modified!.name}】(新規追加)
- 設定: ${change.modified!.description}`;
        case 'deleted':
          return `
【${change.original!.name}】(削除)`;
        default:
          return '';
      }
    }).join('\n')}

変更の指示:
1. 変更されたキャラクターについては、新しい設定に合わせて物語を自然に書き換えてください。
2. 新しく追加されたキャラクターについては、その設定に合わせて物語に自然な形で組み込んでください。
3. 削除されたキャラクターについては、その存在を適切に取り除き、必要に応じて他のキャラクターや展開で補完してください。
4. すべての変更が自然につながるように、物語全体の流れを調整してください。

出力形式:
[新しい物語文のみを出力してください。]`;

    console.log('登場人物変更に基づく書き換えプロンプト:', {
      現在の物語文: currentText,
      キャラクター変更: allChanges,
      プロンプト全体: prompt
    });

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const result = response.data.candidates[0].content.parts[0].text;
    const cleanedResult = result.replace(/^\[新しい物語文のみを出力.*?\]\n*/, '').trim();

    console.log('生成結果:', {
      APIレスポンス: result,
      クリーニング後: cleanedResult
    });

    return cleanedResult;
  } catch (error) {
    console.error('Error modifying story with character changes:', error);
    throw error;
  }
};

export const generateStoryFromFlowchart = async (nodes: any[], edges: any[], currentText: string = ''): Promise<string> => {
  try {
    // フローチャートをMermaid形式の文字列に変換
    const mermaidFlowchart = `graph TD\n${edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      return `  ${edge.source}["${sourceNode?.data?.label}"] --> ${edge.target}["${targetNode?.data?.label}"]`;
    }).join('\n')}`;

    const prompt = `以下のフローチャートに基づいて、新たな物語文を生成してください。
各ノードは物語の重要な出来事や場面を表しており、矢印はそれらの出来事の順序や因果関係を示しています。現在の物語の文体や語調は維持しつつ、各場面が適切に繋がるように生成してください。

フローチャート:
\`\`\`mermaid
${mermaidFlowchart}
\`\`\`

${currentText ? `
現在の物語文（参考）:
${currentText}

フローチャートに基づき、新たな物語文を生成してください。
` : ''}

出力形式:
[生成された物語文のみを出力してください]`;

    console.log('フローチャートから物語文を生成するプロンプト:', {
      フローチャート: mermaidFlowchart,
      現在の物語文: currentText,
      プロンプト全体: prompt
    });

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const result = response.data.candidates[0].content.parts[0].text;
    const cleanedResult = result.replace(/^\[生成された物語文のみを出力してください\]\n*/, '').trim();

    console.log('生成結果:', {
      APIレスポンス: result,
      クリーニング後: cleanedResult
    });

    return cleanedResult;
  } catch (error) {
    console.error('Error generating story from flowchart:', error);
    throw error;
  }
};

export async function convertToReadableText(text: string): Promise<string> {
  try {
    const prompt = `以下のテキストを音声読み上げ用に変換してください。
ルール：
- 漢字やカタカナはひらがなに変換してください
- 元の読み方は一切変えないようにしてください
- 数字や記号なども適切な読み方に変換してください

入力テキスト：
${text}

出力形式：
変換後のテキストのみを出力してください。`;
    console.log('変換プロンプト:', prompt);

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const result = response.data.candidates[0].content.parts[0].text;
    return result.trim();
  } catch (error) {
    console.error('Error converting text to readable format:', error);
    return text; // エラー時は元のテキストを返す
  }
}

export const analyzeFlowchartRelationship = async (
  flowchart1: any,
  flowchart2: any,
  text1: string,
  text2: string
): Promise<{
  branchPoint: {
    source: string;
    target: string;
    label: string;
  } | null;
  sharedNodes: string[];
}> => {
  try {
    const prompt = `以下の2つのバージョンの物語を比較し、分岐点とその前後の展開の違いを分析してください。
それぞれのバージョンについて、フローチャートと物語のテキストの両方が与えられます。

バージョン1（元のストーリー）:
テキスト:
${text1}

フローチャート1:
${JSON.stringify(flowchart1.nodes.map((n: any) => ({
  content: n.data.label
})))}

バージョン2（分岐後のストーリー）:
テキスト:
${text2}

フローチャート2:
${JSON.stringify(flowchart2.nodes.map((n: any) => ({
  content: n.data.label
})))}

以下の形式でJSON形式の結果を出力してください：
{
  "sharedNodes": ["物語展開が共通しているノードの内容1", "物語展開が共通しているノードの内容2", ...],
  "branchPoint": {
    "source": "元のストーリー（フローチャート1）の分岐元となるノードの内容",
    "target": "分岐後のストーリー（フローチャート2）で最初に異なる展開となるノードの内容",
    "label": "分岐の説明（どのように展開が変化したか）"
  }
}

注意点：
1. フローチャートとテキストの両方を参照して、物語の展開の違いを正確に特定してください
2. 分岐点より前の物語の流れは共通しているはずです
3. 分岐点以降は異なる展開になるため、それ以降のノードは共有ノードに含めないでください
4. sourceには必ずフローチャート1から、targetにはフローチャート2からノードを選んでください
5. 分岐が見つからない場合は "branchPoint": null を返してください
6. フローチャートとテキストが完全に同一の場合、sharedNodesには全ノードが含まれ、branchPointはnullとなります`;

    console.log('フローチャート関係性解析プロンプト:',
      flowchart1.nodes.map((n: any) => ({
        id: n.id,
        content: n.data.label
      })),
      flowchart2.nodes.map((n: any) => ({
        id: n.id,
        content: n.data.label
      })),
      prompt
    );
    const response = await axios.post(
      `${API_URL}?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    );

    const responseText = response.data.candidates[0].content.parts[0].text;
    console.log('API Response:', responseText);

    // JSONの部分だけを抽出して解析
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // JSON文字列を整形して再試行
      const cleanedJson = jsonMatch[0]
        .replace(/(\r\n|\n|\r)/gm, '')
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/([{,])\s*([^"'\s].*?):\s*/g, '$1"$2":')
        .replace(/:\s*([^"'\s{[].*?)([,}])/g, ':"$1"$2');

      parsedResult = JSON.parse(cleanedJson);
    }

    return {
      branchPoint: parsedResult.branchPoint,
      sharedNodes: Array.isArray(parsedResult.sharedNodes) ? parsedResult.sharedNodes : []
    };

  } catch (error) {
    console.error('Error analyzing flowchart relationship:', error);
    return {
      branchPoint: null,
      sharedNodes: []
    };
  }
};