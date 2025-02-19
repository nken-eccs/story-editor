const VOICEVOX_API_URL = 'http://localhost:50021';  // VOICEVOXのデフォルトポート
import { convertToReadableText } from './geminiService';

export interface Speaker {
    id: number;
    name: string;
}

export async function getSpeakers(): Promise<Speaker[]> {
    const response = await fetch(`${VOICEVOX_API_URL}/speakers`);
    if (!response.ok) throw new Error('Failed to fetch speakers');
    const data = await response.json();
    return data.map((speaker: any) => ({
        id: speaker.style_id,
        name: `${speaker.name} (${speaker.style_name})`
    }));
}

// テキストの前処理用の関数を追加
function preprocessText(text: string): string {
    return text
        // 改行を「。」に変換（連続する改行は1つの「。」に）
        .replace(/\n+/g, '。')
        // 文末が句読点で終わっていない場合は「。」を追加
        .replace(/([^、。！？])\s*$/g, '$1。')
        // 連続する句読点を1つに整理
        .replace(/[、。！？]+/g, match => match[0])
        // 句読点の後のスペースを削除
        .replace(/([、。！？])\s+/g, '$1')
        // 文章の途中の空白を「、」に変換（連続する空白は1つの「、」に）
        .replace(/\s+/g, '、');
}

export async function generateAudio(text: string, speakerId: number = 1): Promise<ArrayBuffer> {
    try {
        // Gemini APIを使用してテキストを読みやすい形式に変換
        const readableText = await convertToReadableText(text);

        // テキストの前処理を実行
        const processedText = preprocessText(readableText);
        console.log('Processed text:', processedText);

        // 1. 音声合成用のクエリを作成
        const query = await fetch(
            `${VOICEVOX_API_URL}/audio_query?text=${encodeURIComponent(processedText)}&speaker=${speakerId}`,
            { method: 'POST' }
        );
        if (!query.ok) throw new Error('Failed to generate audio query');
        const queryJson = await query.json();

        if (speakerId === 13) {
            queryJson.speedScale = 0.7;
        }

        // 2. 音声を合成
        const synthesis = await fetch(
            `${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(queryJson)
            }
        );
        if (!synthesis.ok) throw new Error('Failed to synthesize audio');

        return synthesis.arrayBuffer();
    } catch (error) {
        console.error('Error in audio generation:', error);
        throw error;
    }
}

// AudioPlayerクラスの定義
export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private startTime: number = 0;
    private offset: number = 0;
    private isPlaying: boolean = false;

    async loadAudio(audioData: ArrayBuffer) {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        }
        this.audioBuffer = await this.audioContext.decodeAudioData(audioData);
        this.offset = 0;
    }

    play() {
        if (!this.audioContext || !this.audioBuffer) return;

        // 既存の再生を停止（ただし、オフセットは保持）
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
        }

        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.audioContext.destination);

        this.sourceNode.start(0, this.offset);
        this.startTime = this.audioContext.currentTime - this.offset;
        this.isPlaying = true;

        // 再生終了時のイベントハンドラ
        this.sourceNode.onended = () => {
            if (this.getCurrentTime() >= this.getDuration()) {
                // 通常の終了時のみオフセットをリセット
                this.isPlaying = false;
                this.offset = 0;
            }
        };
    }

    pause() {
        if (!this.isPlaying) return;

        // 現在の再生位置を保存
        this.offset = this.getCurrentTime();

        // 再生を停止
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
        }

        this.isPlaying = false;
    }

    stop() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
        }
        this.isPlaying = false;
        this.offset = 0;  // オフセットをリセット
    }

    reset() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
        }
        this.isPlaying = false;
        this.offset = 0;
    }

    getCurrentTime(): number {
        if (!this.audioContext || !this.isPlaying) return this.offset;
        return this.audioContext.currentTime - this.startTime;
    }

    getDuration(): number {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }
}
